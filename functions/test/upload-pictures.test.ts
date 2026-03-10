/**
 * Suite P: Picture Upload & Firestore Verification
 *
 * Tests upload of club logos, group pictures, and profile pictures,
 * verifying that pictureUrl / logoUrl / photoURL fields are correctly
 * persisted in all concerned Firestore documents.
 *
 * Firestore verification:
 *   - Club logo  → clubs/{clubId}.logoUrl            (via updateClub after upload)
 *   - Group pic  → clubs/{clubId}/groups/{groupId}.pictureUrl (written by CF)
 *   - Profile pic→ users/{uid}.photoURL               (via onProfilePictureResized)
 *                   clubs/{clubId}/allMembers/members  → entry.photoURL
 *                   groups/.../allMembers/members      → entry.photoURL
 *                   subgroups/.../allMembers/members   → entry.photoURL
 */

import {
    callFunction,
    clearAll,
    createFullTestUser,
    delay,
    expectFunctionError,
    getAdmin,
    getDocument,
    getFirestore,
    seedUserDocument,
} from "./helpers";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

// Minimal 1×1 red PNG (~67 bytes) — valid image for upload tests
const TINY_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8" +
  "/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const STORAGE_BUCKET = "sportnizer.firebasestorage.app";

/* ------------------------------------------------------------------ */
/*  Shared types & helpers                                             */
/* ------------------------------------------------------------------ */

interface TestUser {
  uid: string;
  idToken: string;
  email: string;
  displayName: string;
}

/**
 * Set up a full test environment: admin user, club, group, subgroup.
 * Admin is seeded in all member lists.
 */
async function setupFullEnvironment(): Promise<{
  admin: TestUser;
  clubId: string;
  groupId: string;
  subGroupId: string;
}> {
  const adminUser = await createFullTestUser({
    email: `admin_${Date.now()}@test.com`,
    displayName: "Admin User",
  });

  // Create club
  const { clubId } = await callFunction<{ clubId: string }>(
    "createClub",
    adminUser.idToken,
    { clubData: { name: "Test Club" } },
  );

  // Seed admin's clubAccess (no groupAccess yet)
  await seedUserDocument(adminUser.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Test Club",
        role: "club-admin",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [],
      },
    ],
  });

  // Create group
  const { groupId } = await callFunction<{ groupId: string }>(
    "createGroup",
    adminUser.idToken,
    { clubId, groupData: { name: "Test Group" } },
  );

  // Seed admin in club allMembers
  const db = getFirestore();
  await db.doc(`clubs/${clubId}/allMembers/members`).set(
    {
      members: [
        {
          userId: adminUser.uid,
          name: adminUser.displayName,
          email: adminUser.email,
          roles: ["club-admin"],
          photoURL: "",
          isActive: true,
        },
      ],
      memberCount: 1,
    },
    { merge: true },
  );

  // Seed admin in group allMembers
  await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set(
    {
      members: [
        {
          userId: adminUser.uid,
          name: adminUser.displayName,
          email: adminUser.email,
          roles: ["admin", "club-admin"],
          photoURL: "",
          isActive: true,
        },
      ],
      memberCount: 1,
    },
    { merge: true },
  );

  // Update admin's user doc with groupAccess
  await seedUserDocument(adminUser.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Test Club",
        role: "club-admin",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [
          {
            groupId,
            groupName: "Test Group",
            roles: ["admin"],
            joinedAt: new Date(),
          },
        ],
      },
    ],
  });

  // Create subgroup
  const { subGroupId } = await callFunction<{ subGroupId: string }>(
    "createSubGroup",
    adminUser.idToken,
    {
      uid: adminUser.uid,
      clubId,
      groupId,
      subGroupName: "Sub Team A",
    },
  );

  return { admin: adminUser, clubId, groupId, subGroupId };
}

/**
 * Add a member (player) to club, group, AND subgroup member lists,
 * and seed their user doc with matching clubAccess / groupAccess.
 */
async function addMemberEverywhere(
  member: TestUser,
  clubId: string,
  groupId: string,
  subGroupId: string,
): Promise<void> {
  const db = getFirestore();
  const now = new Date();

  const memberEntry = {
    userId: member.uid,
    name: member.displayName,
    email: member.email,
    roles: ["player"],
    photoURL: "",
    isActive: true,
    joinedAt: now,
    needsGuardian: false,
    guardiansContacts: [],
  };

  // Club allMembers — read-then-append
  const clubDoc = await db.doc(`clubs/${clubId}/allMembers/members`).get();
  const clubMembers = clubDoc.data()?.members || [];
  clubMembers.push({ ...memberEntry });
  await db.doc(`clubs/${clubId}/allMembers/members`).update({
    members: clubMembers,
    memberCount: clubMembers.length,
  });

  // Group allMembers — read-then-append
  const groupDoc = await db
    .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
    .get();
  const groupMembers = groupDoc.data()?.members || [];
  groupMembers.push({ ...memberEntry });
  await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).update({
    members: groupMembers,
    memberCount: groupMembers.length,
  });

  // Subgroup allMembers — create fresh (only the member)
  await db
    .doc(
      `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}/allMembers/members`,
    )
    .set({
      members: [{ ...memberEntry }],
      memberCount: 1,
    });

  // Seed member's user doc with clubAccess + groupAccess
  await seedUserDocument(member.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Test Club",
        role: "player",
        isActive: true,
        joinedAt: now,
        groupAccess: [
          {
            groupId,
            groupName: "Test Group",
            roles: ["player"],
            joinedAt: now,
          },
        ],
      },
    ],
  });
}

/**
 * Poll a Firestore document until a condition is met, or timeout.
 */
async function waitForFirestoreCondition(
  docPath: string,
  check: (data: Record<string, any> | undefined) => boolean,
  timeoutMs: number = 15000,
  intervalMs: number = 500,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await getDocument(docPath);
    if (check(data)) return true;
    await delay(intervalMs);
  }
  return false;
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("Suite P: Picture Upload & Firestore Verification", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── uploadClubLogo ──────────────────────────────────────────

  describe("uploadClubLogo", () => {
    it("TC-P1: Club admin uploads logo; updateClub stores logoUrl in club doc", async () => {
      const { admin: adminUser, clubId } = await setupFullEnvironment();

      // 1. Upload logo via CF
      const result = await callFunction<{
        success: boolean;
        logoUrl: string;
      }>("uploadClubLogo", adminUser.idToken, {
        clubId,
        imageBase64: TINY_IMAGE_BASE64,
        contentType: "image/png",
      });

      expect(result.success).toBe(true);
      expect(result.logoUrl).toBeDefined();
      expect(result.logoUrl).toContain(`profilePictures/clubs/${clubId}`);

      // 2. Mimic client: call updateClub to persist logoUrl in Firestore
      await callFunction("updateClub", adminUser.idToken, {
        clubId,
        clubData: { logoUrl: result.logoUrl },
      });

      // 3. Verify clubs/{clubId} document has logoUrl
      const clubDoc = await getDocument(`clubs/${clubId}`);
      expect(clubDoc).toBeDefined();
      expect(clubDoc!.logoUrl).toBe(result.logoUrl);
    });

    it("TC-P2: Non-admin gets permission denied", async () => {
      const { clubId } = await setupFullEnvironment();
      const nonAdmin = await createFullTestUser({
        email: `nonadmin_${Date.now()}@test.com`,
      });

      await expectFunctionError(
        "uploadClubLogo",
        nonAdmin.idToken,
        {
          clubId,
          imageBase64: TINY_IMAGE_BASE64,
          contentType: "image/png",
        },
        "permission-denied",
      );
    });

    it("TC-P3: Invalid content type is rejected", async () => {
      const { admin: adminUser, clubId } = await setupFullEnvironment();

      await expectFunctionError(
        "uploadClubLogo",
        adminUser.idToken,
        {
          clubId,
          imageBase64: TINY_IMAGE_BASE64,
          contentType: "text/plain",
        },
        "invalid-argument",
      );
    });
  });

  // ─── uploadGroupPicture ──────────────────────────────────────

  describe("uploadGroupPicture", () => {
    it("TC-P4: Group admin uploads picture; pictureUrl stored in group doc", async () => {
      const {
        admin: adminUser,
        clubId,
        groupId,
      } = await setupFullEnvironment();

      const result = await callFunction<{
        success: boolean;
        pictureUrl: string;
      }>("uploadGroupPicture", adminUser.idToken, {
        clubId,
        groupId,
        imageBase64: TINY_IMAGE_BASE64,
        contentType: "image/png",
      });

      expect(result.success).toBe(true);
      expect(result.pictureUrl).toBeDefined();
      expect(result.pictureUrl).toContain(`profilePictures/groups/${groupId}`);

      // Verify group Firestore doc has pictureUrl (written by CF itself)
      const groupDoc = await getDocument(`clubs/${clubId}/groups/${groupId}`);
      expect(groupDoc).toBeDefined();
      expect(groupDoc!.pictureUrl).toBe(result.pictureUrl);
    });

    it("TC-P5: Non-admin gets permission denied", async () => {
      const { clubId, groupId } = await setupFullEnvironment();
      const nonAdmin = await createFullTestUser({
        email: `nonadmin_${Date.now()}@test.com`,
      });

      await expectFunctionError(
        "uploadGroupPicture",
        nonAdmin.idToken,
        {
          clubId,
          groupId,
          imageBase64: TINY_IMAGE_BASE64,
          contentType: "image/png",
        },
        "permission-denied",
      );
    });

    it("TC-P6: Invalid content type is rejected", async () => {
      const {
        admin: adminUser,
        clubId,
        groupId,
      } = await setupFullEnvironment();

      await expectFunctionError(
        "uploadGroupPicture",
        adminUser.idToken,
        {
          clubId,
          groupId,
          imageBase64: TINY_IMAGE_BASE64,
          contentType: "application/pdf",
        },
        "invalid-argument",
      );
    });
  });

  // ─── uploadProfilePictureForMember ───────────────────────────

  describe("uploadProfilePictureForMember", () => {
    it("TC-P7: Club admin uploads for member → success + returns photoURL", async () => {
      const {
        admin: adminUser,
        clubId,
        groupId,
        subGroupId,
      } = await setupFullEnvironment();

      const member = await createFullTestUser({
        email: `member_${Date.now()}@test.com`,
        displayName: "Member Player",
      });
      await addMemberEverywhere(member, clubId, groupId, subGroupId);

      const result = await callFunction<{
        success: boolean;
        photoURL: string;
      }>("uploadProfilePictureForMember", adminUser.idToken, {
        targetUserId: member.uid,
        clubId,
        groupId,
        imageBase64: TINY_IMAGE_BASE64,
        contentType: "image/png",
      });

      expect(result.success).toBe(true);
      expect(result.photoURL).toBeDefined();
      expect(result.photoURL).toContain(`profilePictures/users/${member.uid}`);
    });

    it("TC-P8: Group coach uploads for group member → success", async () => {
      const { clubId, groupId } = await setupFullEnvironment();

      // Create a coach and add to group
      const coach = await createFullTestUser({
        email: `coach_${Date.now()}@test.com`,
        displayName: "Group Coach",
      });
      const db = getFirestore();
      const gDoc = await db
        .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
        .get();
      const gMembers = gDoc.data()?.members || [];
      gMembers.push({
        userId: coach.uid,
        name: coach.displayName,
        email: coach.email,
        roles: ["coach"],
        photoURL: "",
        isActive: true,
      });

      // Create a player and add to group
      const player = await createFullTestUser({
        email: `player_${Date.now()}@test.com`,
        displayName: "Player One",
      });
      gMembers.push({
        userId: player.uid,
        name: player.displayName,
        email: player.email,
        roles: ["player"],
        photoURL: "",
        isActive: true,
      });
      await db
        .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
        .update({ members: gMembers, memberCount: gMembers.length });

      // Coach uploads profile picture for player
      const result = await callFunction<{
        success: boolean;
        photoURL: string;
      }>("uploadProfilePictureForMember", coach.idToken, {
        targetUserId: player.uid,
        clubId,
        groupId,
        imageBase64: TINY_IMAGE_BASE64,
        contentType: "image/png",
      });

      expect(result.success).toBe(true);
      expect(result.photoURL).toBeDefined();
    });

    it("TC-P9: Regular member gets permission denied", async () => {
      const { clubId, groupId } = await setupFullEnvironment();

      const member1 = await createFullTestUser({
        email: `m1_${Date.now()}@test.com`,
      });
      const member2 = await createFullTestUser({
        email: `m2_${Date.now()}@test.com`,
      });

      // Add both as players in the group
      const db = getFirestore();
      const gDoc = await db
        .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
        .get();
      const gMembers = gDoc.data()?.members || [];
      gMembers.push(
        {
          userId: member1.uid,
          name: member1.displayName,
          email: member1.email,
          roles: ["player"],
          photoURL: "",
          isActive: true,
        },
        {
          userId: member2.uid,
          name: member2.displayName,
          email: member2.email,
          roles: ["player"],
          photoURL: "",
          isActive: true,
        },
      );
      await db
        .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
        .update({ members: gMembers, memberCount: gMembers.length });

      // member1 tries to upload for member2 → denied
      await expectFunctionError(
        "uploadProfilePictureForMember",
        member1.idToken,
        {
          targetUserId: member2.uid,
          clubId,
          groupId,
          imageBase64: TINY_IMAGE_BASE64,
          contentType: "image/png",
        },
        "permission-denied",
      );
    });

    it("TC-P10: Target must be in group for non-club-admin", async () => {
      const { clubId, groupId } = await setupFullEnvironment();

      // Create a coach and add to group
      const coach = await createFullTestUser({
        email: `coach_${Date.now()}@test.com`,
      });
      const db = getFirestore();
      const gDoc = await db
        .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
        .get();
      const gMembers = gDoc.data()?.members || [];
      gMembers.push({
        userId: coach.uid,
        name: coach.displayName,
        email: coach.email,
        roles: ["coach"],
        photoURL: "",
        isActive: true,
      });
      await db
        .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
        .update({ members: gMembers, memberCount: gMembers.length });

      // Create user NOT in the group
      const outsider = await createFullTestUser({
        email: `outsider_${Date.now()}@test.com`,
      });

      // Coach tries to upload for outsider → denied (not in group)
      await expectFunctionError(
        "uploadProfilePictureForMember",
        coach.idToken,
        {
          targetUserId: outsider.uid,
          clubId,
          groupId,
          imageBase64: TINY_IMAGE_BASE64,
          contentType: "image/png",
        },
        "permission-denied",
      );
    });
  });

  // ─── onProfilePictureResized — Firestore propagation ─────────

  describe("onProfilePictureResized — Firestore propagation", () => {
    it("TC-P11: photoURL propagated to user doc, club members, group members, and subgroup members", async () => {
      const {
        admin: adminUser,
        clubId,
        groupId,
        subGroupId,
      } = await setupFullEnvironment();

      // Create member and add to club, group, AND subgroup
      const member = await createFullTestUser({
        email: `member_${Date.now()}@test.com`,
        displayName: "Propagation Test Member",
      });
      await addMemberEverywhere(member, clubId, groupId, subGroupId);

      // Confirm initial state: no photoURL on user doc
      const userBefore = await getDocument(`users/${member.uid}`);
      expect(userBefore?.photoURL).toBeFalsy();

      // Simulate the Firebase Resize Extension completing:
      // upload a file at the exact path onProfilePictureResized monitors
      const bucket = getAdmin().storage().bucket(STORAGE_BUCKET);
      const resizedPath = `profilePictures/users/${member.uid}/customProfilePictures/profile_200x200.png`;
      await bucket
        .file(resizedPath)
        .save(Buffer.from(TINY_IMAGE_BASE64, "base64"), {
          metadata: { contentType: "image/png" },
        });

      // Poll until onProfilePictureResized propagates photoURL to user doc
      const propagated = await waitForFirestoreCondition(
        `users/${member.uid}`,
        (data) => !!data?.photoURL,
        15000,
      );
      expect(propagated).toBe(true);

      // ── 1. Verify user document ──
      const userDoc = await getDocument(`users/${member.uid}`);
      expect(userDoc!.photoURL).toBeDefined();
      expect(userDoc!.photoURL).toContain(
        `profilePictures/users/${member.uid}/customProfilePictures/profile_200x200`,
      );

      // ── 2. Verify club allMembers entry ──
      const clubMembers = await getDocument(
        `clubs/${clubId}/allMembers/members`,
      );
      const clubEntry = clubMembers!.members.find(
        (m: any) => m.userId === member.uid,
      );
      expect(clubEntry).toBeDefined();
      expect(clubEntry.photoURL).toBeDefined();
      expect(clubEntry.photoURL).toContain(
        `profilePictures/users/${member.uid}`,
      );

      // ── 3. Verify group allMembers entry ──
      const groupMembers = await getDocument(
        `clubs/${clubId}/groups/${groupId}/allMembers/members`,
      );
      const groupEntry = groupMembers!.members.find(
        (m: any) => m.userId === member.uid,
      );
      expect(groupEntry).toBeDefined();
      expect(groupEntry.photoURL).toBeDefined();
      expect(groupEntry.photoURL).toContain(
        `profilePictures/users/${member.uid}`,
      );

      // ── 4. Verify subgroup allMembers entry ──
      const subgroupMembers = await getDocument(
        `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}/allMembers/members`,
      );
      const subgroupEntry = subgroupMembers!.members.find(
        (m: any) => m.userId === member.uid,
      );
      expect(subgroupEntry).toBeDefined();
      expect(subgroupEntry.photoURL).toBeDefined();
      expect(subgroupEntry.photoURL).toContain(
        `profilePictures/users/${member.uid}`,
      );
    });
  });
});
