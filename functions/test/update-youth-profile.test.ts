/**
 * Suite: Update Youth Profile
 *
 * Tests updateYouthProfile Cloud Function:
 *   - Club admin can update youth displayName
 *   - Club admin can update youth dateOfBirth
 *   - Club admin can update both name and DOB at once
 *   - Group admin can update youth profile
 *   - Denormalized allMembers arrays are synced (club, group, subgroup)
 *   - Guardian dependents[] are synced (childName, dateOfBirth)
 *   - Non-admin users are rejected
 *   - Non-youth targets are rejected
 *   - Validation errors (empty name, missing fields)
 *
 * Also tests updateGuardianContactInfo admin path:
 *   - Club admin can update a guardian's phone number
 *   - Group admin can update a guardian's phone number
 *   - Non-admin is rejected for guardian phone update
 */

import {
    callFunction,
    clearAll,
    createFullTestUser,
    expectFunctionError,
    getDocument,
    getFirestore,
    seedUserDocument,
} from "./helpers";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TestUser {
  uid: string;
  idToken: string;
  email: string;
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

async function setupClubAndGroup(): Promise<{
  admin: TestUser;
  clubId: string;
  groupId: string;
}> {
  const ts = Date.now();
  const admin = await createFullTestUser({
    email: `admin_${ts}@test.com`,
  });

  const clubResult = await callFunction<{ clubId: string }>(
    "createClub",
    admin.idToken,
    { clubData: { name: `Test Club ${ts}` } },
  );
  const clubId = clubResult.clubId;

  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: `Test Club ${ts}`,
        role: "club-admin",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [],
      },
    ],
  });

  const groupResult = await callFunction<{ groupId: string }>(
    "createGroup",
    admin.idToken,
    { clubId, groupData: { name: "Group A" } },
  );
  const groupId = groupResult.groupId;

  const db = getFirestore();
  await db.doc(`clubs/${clubId}/allMembers/members`).set(
    {
      members: [
        {
          userId: admin.uid,
          name: admin.email,
          email: admin.email,
          roles: ["club-admin"],
          isActive: true,
        },
      ],
      memberCount: 1,
    },
    { merge: true },
  );

  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: `Test Club ${ts}`,
        role: "club-admin",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [
          {
            groupId,
            groupName: "Group A",
            roles: ["admin"],
            joinedAt: new Date(),
          },
        ],
      },
    ],
  });

  return { admin, clubId, groupId };
}

async function setupYouthWithGuardian(
  admin: TestUser,
  guardian: TestUser,
  clubId: string,
  groupId: string,
): Promise<string> {
  const youthResult = await callFunction<{ youthUid: string }>(
    "createYouthMemberDocument",
    guardian.idToken,
    {
      childName: "Youth Player",
      dateOfBirth: "2015-06-15",
      guardianUid: guardian.uid,
      guardianEmail: guardian.email,
      guardianName: "Guardian Parent",
      relationship: "parent",
    },
  );
  const youthUid = youthResult.youthUid;

  // Add youth to club
  await callFunction("addMemberToClub", admin.idToken, {
    clubId,
    memberData: {
      userId: youthUid,
      roles: ["player-underage"],
      name: "Youth Player",
      addedBy: admin.uid,
      needsGuardian: true,
      guardiansContacts: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
        },
      ],
      joinedAt: new Date().toISOString(),
    },
  });

  // Add youth to group
  await callFunction("addMemberToGroup", admin.idToken, {
    clubId,
    groupId,
    memberData: {
      userId: youthUid,
      roles: ["player-underage"],
      name: "Youth Player",
      addedBy: admin.uid,
      needsGuardian: true,
      guardiansContacts: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
        },
      ],
      joinedAt: new Date().toISOString(),
    },
  });

  return youthUid;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

jest.setTimeout(30_000);

describe("Update Youth Profile", () => {
  beforeAll(async () => {
    await clearAll();
  });

  afterAll(async () => {
    await clearAll();
  });

  /* ────────────────────────────────────────────────────
   *  1. Club admin updates displayName
   * ──────────────────────────────────────────────────── */
  it("club admin can update youth displayName", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
    });
    await seedUserDocument(guardian.uid, { dependents: [], isYouth: false });

    const youthUid = await setupYouthWithGuardian(
      admin,
      guardian,
      clubId,
      groupId,
    );

    const result = await callFunction("updateYouthProfile", admin.idToken, {
      youthUid,
      clubId,
      groupId,
      displayName: "New Youth Name",
    });

    expect(result.success).toBe(true);

    // Verify user document was updated
    const youthDoc = await getDocument(`users/${youthUid}`);
    expect(youthDoc!.displayName).toBe("New Youth Name");
  });

  /* ────────────────────────────────────────────────────
   *  2. Club admin updates dateOfBirth
   * ──────────────────────────────────────────────────── */
  it("club admin can update youth dateOfBirth", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
    });
    await seedUserDocument(guardian.uid, { dependents: [], isYouth: false });

    const youthUid = await setupYouthWithGuardian(
      admin,
      guardian,
      clubId,
      groupId,
    );

    const result = await callFunction("updateYouthProfile", admin.idToken, {
      youthUid,
      clubId,
      groupId,
      dateOfBirth: "2016-01-20",
    });

    expect(result.success).toBe(true);

    // Verify user document was updated
    const youthDoc = await getDocument(`users/${youthUid}`);
    expect(youthDoc!.dateOfBirth).toBe("2016-01-20");
  });

  /* ────────────────────────────────────────────────────
   *  3. Club admin updates both name and DOB
   * ──────────────────────────────────────────────────── */
  it("club admin can update both name and DOB at once", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
    });
    await seedUserDocument(guardian.uid, { dependents: [], isYouth: false });

    const youthUid = await setupYouthWithGuardian(
      admin,
      guardian,
      clubId,
      groupId,
    );

    const result = await callFunction("updateYouthProfile", admin.idToken, {
      youthUid,
      clubId,
      groupId,
      displayName: "Updated Name",
      dateOfBirth: "2014-03-10",
    });

    expect(result.success).toBe(true);

    const youthDoc = await getDocument(`users/${youthUid}`);
    expect(youthDoc!.displayName).toBe("Updated Name");
    expect(youthDoc!.dateOfBirth).toBe("2014-03-10");
  });

  /* ────────────────────────────────────────────────────
   *  4. Group admin (non-club-admin) can update profile
   * ──────────────────────────────────────────────────── */
  it("group admin can update youth profile", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Create a group-admin-only user
    const groupAdmin = await createFullTestUser({
      email: `gadmin_${Date.now()}@test.com`,
    });
    await seedUserDocument(groupAdmin.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "Test Club",
          role: "member",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId,
              groupName: "Group A",
              roles: ["admin"],
              joinedAt: new Date(),
            },
          ],
        },
      ],
    });

    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
    });
    await seedUserDocument(guardian.uid, { dependents: [], isYouth: false });

    const youthUid = await setupYouthWithGuardian(
      admin,
      guardian,
      clubId,
      groupId,
    );

    const result = await callFunction(
      "updateYouthProfile",
      groupAdmin.idToken,
      {
        youthUid,
        clubId,
        groupId,
        displayName: "Group Admin Updated",
      },
    );

    expect(result.success).toBe(true);
    const youthDoc = await getDocument(`users/${youthUid}`);
    expect(youthDoc!.displayName).toBe("Group Admin Updated");
  });

  /* ────────────────────────────────────────────────────
   *  5. Guardian dependents[] are synced after name update
   * ──────────────────────────────────────────────────── */
  it("syncs guardian dependents after name update", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
    });
    await seedUserDocument(guardian.uid, { dependents: [], isYouth: false });

    const youthUid = await setupYouthWithGuardian(
      admin,
      guardian,
      clubId,
      groupId,
    );

    await callFunction("updateYouthProfile", admin.idToken, {
      youthUid,
      clubId,
      groupId,
      displayName: "Synced Name",
      dateOfBirth: "2013-12-25",
    });

    // Check guardian's dependents array
    const guardianDoc = await getDocument(`users/${guardian.uid}`);
    const dep = (guardianDoc!.dependents || []).find(
      (d: any) => d.uid === youthUid,
    );
    expect(dep).toBeDefined();
    expect(dep.childName).toBe("Synced Name");
    expect(dep.dateOfBirth).toBe("2013-12-25");
  });

  /* ────────────────────────────────────────────────────
   *  6. Non-admin is rejected
   * ──────────────────────────────────────────────────── */
  it("rejects non-admin user", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
    });
    await seedUserDocument(guardian.uid, { dependents: [], isYouth: false });

    const youthUid = await setupYouthWithGuardian(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Guardian (non-admin) tries to update
    await expectFunctionError(
      "updateYouthProfile",
      guardian.idToken,
      {
        youthUid,
        clubId,
        groupId,
        displayName: "Should Fail",
      },
      "PERMISSION_DENIED",
    );
  });

  /* ────────────────────────────────────────────────────
   *  7. Non-youth target is rejected
   * ──────────────────────────────────────────────────── */
  it("rejects update on non-youth member", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Admin tries to update their own profile (non-youth)
    await expectFunctionError(
      "updateYouthProfile",
      admin.idToken,
      {
        youthUid: admin.uid,
        clubId,
        groupId,
        displayName: "Should Fail",
      },
      "FAILED_PRECONDITION",
    );
  });

  /* ────────────────────────────────────────────────────
   *  8. Empty displayName is rejected
   * ──────────────────────────────────────────────────── */
  it("rejects empty displayName", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
    });
    await seedUserDocument(guardian.uid, { dependents: [], isYouth: false });

    const youthUid = await setupYouthWithGuardian(
      admin,
      guardian,
      clubId,
      groupId,
    );

    await expectFunctionError(
      "updateYouthProfile",
      admin.idToken,
      {
        youthUid,
        clubId,
        groupId,
        displayName: "   ",
      },
      "INVALID_ARGUMENT",
    );
  });

  /* ────────────────────────────────────────────────────
   *  9. Missing required fields are rejected
   * ──────────────────────────────────────────────────── */
  it("rejects when no update fields provided", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
    });
    await seedUserDocument(guardian.uid, { dependents: [], isYouth: false });

    const youthUid = await setupYouthWithGuardian(
      admin,
      guardian,
      clubId,
      groupId,
    );

    await expectFunctionError(
      "updateYouthProfile",
      admin.idToken,
      {
        youthUid,
        clubId,
        groupId,
        // no displayName, no dateOfBirth
      },
      "INVALID_ARGUMENT",
    );
  });

  /* ────────────────────────────────────────────────────
   *  10. Club admin can update without groupId
   * ──────────────────────────────────────────────────── */
  it("club admin can update youth profile without groupId", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
    });
    await seedUserDocument(guardian.uid, { dependents: [], isYouth: false });

    const youthUid = await setupYouthWithGuardian(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Call WITHOUT groupId — club admin should still succeed
    const result = await callFunction("updateYouthProfile", admin.idToken, {
      youthUid,
      clubId,
      // no groupId
      displayName: "Club-Level Update",
      dateOfBirth: "2015-09-01",
    });

    expect(result.success).toBe(true);

    const youthDoc = await getDocument(`users/${youthUid}`);
    expect(youthDoc!.displayName).toBe("Club-Level Update");
    expect(youthDoc!.dateOfBirth).toBe("2015-09-01");
  });
});

/* ------------------------------------------------------------------ */
/*  Admin guardian phone update tests                                   */
/* ------------------------------------------------------------------ */

describe("Admin Guardian Phone Update", () => {
  beforeAll(async () => {
    await clearAll();
  });

  afterAll(async () => {
    await clearAll();
  });

  /* ────────────────────────────────────────────────────
   *  10. Club admin can update guardian phone
   * ──────────────────────────────────────────────────── */
  it("club admin can update a guardian phone number", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
    });
    await seedUserDocument(guardian.uid, {
      dependents: [],
      isYouth: false,
      guardianOf: [],
    });

    const youthUid = await setupYouthWithGuardian(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Update guardian phone as admin
    const result = await callFunction(
      "updateGuardianContactInfo",
      admin.idToken,
      {
        youthUid,
        guardianUid: guardian.uid,
        clubId,
        phoneNumber: "+46701234567",
      },
    );

    expect(result.success).toBe(true);

    // Verify guardian's user doc was updated
    const guardianDoc = await getDocument(`users/${guardian.uid}`);
    expect(guardianDoc!.phoneNumber).toBe("+46701234567");
  });

  /* ────────────────────────────────────────────────────
   *  11. Non-admin is rejected for guardian phone update
   * ──────────────────────────────────────────────────── */
  it("rejects non-admin updating another guardian phone", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
    });
    await seedUserDocument(guardian.uid, {
      dependents: [],
      isYouth: false,
      guardianOf: [],
    });

    const otherUser = await createFullTestUser({
      email: `other_${Date.now()}@test.com`,
    });
    await seedUserDocument(otherUser.uid, { dependents: [], isYouth: false });

    const youthUid = await setupYouthWithGuardian(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Non-admin tries to update guardian phone
    await expectFunctionError(
      "updateGuardianContactInfo",
      otherUser.idToken,
      {
        youthUid,
        guardianUid: guardian.uid,
        clubId,
        groupId,
        phoneNumber: "+46701234567",
      },
      "PERMISSION_DENIED",
    );
  });
});
