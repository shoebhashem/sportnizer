/// <reference types="jest" />

/**
 * getMemberContactDetails — Permission Integration Tests
 *
 * Verifies which callers are allowed (or denied) to fetch another member's
 * contact details.
 *
 * Permission matrix (all require a groupId unless noted):
 *  ✅ club-admin                         → allowed (club-level & group-level)
 *  ✅ group admin                         → allowed
 *  ✅ group coach                         → allowed
 *  ✅ group player (peer) viewing a peer  → allowed (NEW — peer-view feature)
 *  ❌ group player viewing a non-member   → denied
 *  ❌ completely unrelated user           → denied
 *  ❌ unauthenticated                     → denied
 *  ❌ groupId omitted, non-club-admin     → denied
 *
 * Runs against Firebase Emulators.
 */

import {
    callFunction,
    clearAll,
    createFullTestUser,
    expectFunctionError,
    getFirestore,
    seedUserDocument,
} from "./helpers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CLUB_ID = "test-club-contact";
const GROUP_ID = "test-group-contact";

/** Seed the group's allMembers/members document with the given uids */
async function seedGroupMembers(userIds: string[]) {
  const db = getFirestore();
  await db.doc(`clubs/${CLUB_ID}/groups/${GROUP_ID}/allMembers/members`).set({
    members: userIds.map((uid) => ({
      userId: uid,
      name: "Test Member",
      roles: ["player"],
      isActive: true,
    })),
  });
}

/** Build groupAccess entry for a user */
function groupAccessEntry(roles: string[], active = true) {
  return {
    groupId: GROUP_ID,
    groupName: "Test Group",
    roles,
    isActive: active,
  };
}

/** Seed a user document with the given club + group roles */
async function seedMember(
  uid: string,
  email: string,
  clubRole: string,
  groupRoles: string[],
) {
  await seedUserDocument(uid, {
    fullName: "Test Member",
    email,
    phoneNumber: "+46701234567",
    clubAccess: [
      {
        clubId: CLUB_ID,
        clubName: "Test Club",
        role: clubRole,
        isActive: true,
        groupAccess:
          groupRoles.length > 0 ? [groupAccessEntry(groupRoles)] : [],
      },
    ],
  });
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("getMemberContactDetails — permissions", () => {
  // We re-use the same users across the whole suite for efficiency.
  // clearAll() is only called once before the suite to avoid inter-suite
  // pollution while keeping tests fast.
  let clubAdmin: Awaited<ReturnType<typeof createFullTestUser>>;
  let groupAdminUser: Awaited<ReturnType<typeof createFullTestUser>>;
  let groupCoach: Awaited<ReturnType<typeof createFullTestUser>>;
  let playerA: Awaited<ReturnType<typeof createFullTestUser>>;
  let playerB: Awaited<ReturnType<typeof createFullTestUser>>;
  let outsider: Awaited<ReturnType<typeof createFullTestUser>>;

  beforeAll(async () => {
    await clearAll();

    // Create Auth + base Firestore docs
    clubAdmin = await createFullTestUser({ displayName: "Club Admin" });
    groupAdminUser = await createFullTestUser({ displayName: "Group Admin" });
    groupCoach = await createFullTestUser({ displayName: "Group Coach" });
    playerA = await createFullTestUser({ displayName: "Player A" });
    playerB = await createFullTestUser({ displayName: "Player B" });
    outsider = await createFullTestUser({ displayName: "Outsider" });

    // Seed user documents with roles
    await seedMember(clubAdmin.uid, clubAdmin.email, "club-admin", []);
    await seedMember(groupAdminUser.uid, groupAdminUser.email, "member", [
      "admin",
    ]);
    await seedMember(groupCoach.uid, groupCoach.email, "member", ["coach"]);
    await seedMember(playerA.uid, playerA.email, "member", ["player"]);
    await seedMember(playerB.uid, playerB.email, "member", ["player"]);
    await seedUserDocument(outsider.uid, {
      fullName: "Outsider",
      email: outsider.email,
      clubAccess: [],
    });

    // Both players and the coach are in the group; adminUser is in the group too
    await seedGroupMembers([
      groupAdminUser.uid,
      groupCoach.uid,
      playerA.uid,
      playerB.uid,
    ]);
  });

  afterAll(async () => {
    await clearAll();
  });

  // ── Allowed callers ─────────────────────────────────────────

  it("club-admin can fetch any member's details (group-level)", async () => {
    const result = await callFunction(
      "getMemberContactDetails",
      clubAdmin.idToken,
      { userId: playerA.uid, clubId: CLUB_ID, groupId: GROUP_ID },
    );
    expect(result.success).toBe(true);
    expect(result.member.phoneNumber).toBe("+46701234567");
  });

  it("club-admin can fetch details without a groupId (club-level)", async () => {
    const result = await callFunction(
      "getMemberContactDetails",
      clubAdmin.idToken,
      { userId: playerA.uid, clubId: CLUB_ID },
    );
    expect(result.success).toBe(true);
    expect(result.member).toBeDefined();
  });

  it("group admin can fetch a member's details", async () => {
    const result = await callFunction(
      "getMemberContactDetails",
      groupAdminUser.idToken,
      { userId: playerA.uid, clubId: CLUB_ID, groupId: GROUP_ID },
    );
    expect(result.success).toBe(true);
    expect(result.member.phoneNumber).toBe("+46701234567");
  });

  it("group coach can fetch a member's details", async () => {
    const result = await callFunction(
      "getMemberContactDetails",
      groupCoach.idToken,
      { userId: playerA.uid, clubId: CLUB_ID, groupId: GROUP_ID },
    );
    expect(result.success).toBe(true);
    expect(result.member.phoneNumber).toBe("+46701234567");
  });

  // ── NEW: peer-view permission ───────────────────────────────

  it("player (peer) can fetch another player's details when both are in the group", async () => {
    const result = await callFunction(
      "getMemberContactDetails",
      playerA.idToken,
      { userId: playerB.uid, clubId: CLUB_ID, groupId: GROUP_ID },
    );
    expect(result.success).toBe(true);
    // Phone must be returned so the WhatsApp deep link can be built
    expect(result.member.phoneNumber).toBe("+46701234567");
  });

  it("player can also fetch an admin/coach's details (both are group members)", async () => {
    const result = await callFunction(
      "getMemberContactDetails",
      playerA.idToken,
      { userId: groupCoach.uid, clubId: CLUB_ID, groupId: GROUP_ID },
    );
    expect(result.success).toBe(true);
  });

  // ── NEW: guardian-in-group permission ────────────────────────

  it("guardian with a dependent in the group can fetch another member's details", async () => {
    const db = getFirestore();

    // Create a youth player and a guardian
    const youthPlayer = await createFullTestUser({
      displayName: "Youth Player",
    });
    const guardianUser = await createFullTestUser({ displayName: "Guardian" });

    // Seed youth player as a group member with needsGuardian flag
    await seedUserDocument(youthPlayer.uid, {
      fullName: "Youth Player",
      email: youthPlayer.email,
      phoneNumber: null,
      isYouth: true,
      clubAccess: [
        {
          clubId: CLUB_ID,
          clubName: "Test Club",
          role: "member",
          isActive: true,
          groupAccess: [],
        },
      ],
    });

    // Seed guardian with dependent link and guardian club role (no groupAccess)
    await seedUserDocument(guardianUser.uid, {
      fullName: "Guardian",
      email: guardianUser.email,
      phoneNumber: "+46709876543",
      clubAccess: [
        {
          clubId: CLUB_ID,
          clubName: "Test Club",
          role: "guardian",
          isActive: true,
          groupAccess: [],
        },
      ],
      dependents: [{ uid: youthPlayer.uid, name: "Youth Player" }],
    });

    // Add the youth player to the group members doc
    const membersRef = db.doc(
      `clubs/${CLUB_ID}/groups/${GROUP_ID}/allMembers/members`,
    );
    const snap = await membersRef.get();
    const currentMembers: any[] = snap.data()?.members || [];
    await membersRef.set({
      members: [
        ...currentMembers,
        {
          userId: youthPlayer.uid,
          name: "Youth Player",
          roles: ["player-underage"],
          isActive: true,
          needsGuardian: true,
        },
      ],
    });

    // Guardian should now be able to view playerA's contact details
    const result = await callFunction(
      "getMemberContactDetails",
      guardianUser.idToken,
      { userId: playerA.uid, clubId: CLUB_ID, groupId: GROUP_ID },
    );
    expect(result.success).toBe(true);
    expect(result.member.phoneNumber).toBe("+46701234567");
  });

  it("guardian whose dependent is NOT in the group is denied", async () => {
    const db = getFirestore();
    const DIFFERENT_GROUP = "different-group-xyz";

    const isolatedYouth = await createFullTestUser({
      displayName: "Isolated Youth",
    });
    const isolatedGuardian = await createFullTestUser({
      displayName: "Isolated Guardian",
    });

    await seedUserDocument(isolatedYouth.uid, {
      fullName: "Isolated Youth",
      email: isolatedYouth.email,
      isYouth: true,
      clubAccess: [],
    });

    await seedUserDocument(isolatedGuardian.uid, {
      fullName: "Isolated Guardian",
      email: isolatedGuardian.email,
      clubAccess: [
        {
          clubId: CLUB_ID,
          clubName: "Test Club",
          role: "guardian",
          isActive: true,
          groupAccess: [],
        },
      ],
      dependents: [{ uid: isolatedYouth.uid, name: "Isolated Youth" }],
    });

    // Dependent is only in DIFFERENT_GROUP, not in GROUP_ID
    await db
      .doc(`clubs/${CLUB_ID}/groups/${DIFFERENT_GROUP}/allMembers/members`)
      .set({
        members: [
          {
            userId: isolatedYouth.uid,
            name: "Isolated Youth",
            roles: ["player-underage"],
            isActive: true,
          },
        ],
      });

    await expectFunctionError(
      callFunction("getMemberContactDetails", isolatedGuardian.idToken, {
        userId: playerA.uid,
        clubId: CLUB_ID,
        groupId: GROUP_ID,
      }),
      "permission-denied",
    );
  });

  // ── Denied callers ──────────────────────────────────────────

  it("player is denied when target is NOT in the group", async () => {
    // Outsider's uid is not in the seeded group members list
    await expectFunctionError(
      callFunction("getMemberContactDetails", playerA.idToken, {
        userId: outsider.uid,
        clubId: CLUB_ID,
        groupId: GROUP_ID,
      }),
      "permission-denied",
    );
  });

  it("unrelated user (no club access) is denied", async () => {
    await expectFunctionError(
      callFunction("getMemberContactDetails", outsider.idToken, {
        userId: playerA.uid,
        clubId: CLUB_ID,
        groupId: GROUP_ID,
      }),
      "permission-denied",
    );
  });

  it("unauthenticated call is denied", async () => {
    await expectFunctionError(
      callFunction("getMemberContactDetails", "", {
        userId: playerA.uid,
        clubId: CLUB_ID,
        groupId: GROUP_ID,
      }),
      "unauthenticated",
    );
  });

  it("non-club-admin is denied when groupId is omitted", async () => {
    // A player trying club-level access without being a club-admin
    await expectFunctionError(
      callFunction("getMemberContactDetails", playerA.idToken, {
        userId: playerB.uid,
        clubId: CLUB_ID,
        // no groupId
      }),
      "permission-denied",
    );
  });

  // ── Data shape ──────────────────────────────────────────────

  it("returned member object contains expected fields", async () => {
    const result = await callFunction(
      "getMemberContactDetails",
      clubAdmin.idToken,
      { userId: playerA.uid, clubId: CLUB_ID, groupId: GROUP_ID },
    );
    expect(result.member).toMatchObject({
      displayName: expect.any(String),
      email: expect.any(String),
      isYouth: expect.any(Boolean),
    });
    // phoneNumber can be string or null
    expect(
      result.member.phoneNumber === null ||
        typeof result.member.phoneNumber === "string",
    ).toBe(true);
  });
});
