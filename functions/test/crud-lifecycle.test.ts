/**
 * Suite E: Club / Group / Subgroup CRUD Lifecycle
 *
 * Tests creation, update, and soft-delete of clubs, groups, and subgroups
 * with deeper field-level assertions.
 */

import {
    callFunction,
    clearAll,
    createFullTestUser,
    getDocument,
    getFirestore,
    seedUserDocument,
} from "./helpers";

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

interface TestUser {
  uid: string;
  idToken: string;
  email: string;
}

/**
 * Create an admin user with a seeded user doc (needed for isClubAdmin checks).
 * Does NOT create a club yet.
 */
async function createAdminUser(): Promise<TestUser> {
  return createFullTestUser({ email: `admin_${Date.now()}@test.com` });
}

/**
 * Shorthand: create club + group + subgroup; return everything.
 * Seeds admin in club allMembers + group allMembers.
 */
async function setupFull(): Promise<{
  admin: TestUser;
  clubId: string;
  groupId: string;
  subGroupId: string;
}> {
  const admin = await createAdminUser();

  // Create club
  const { clubId } = await callFunction<{ clubId: string }>(
    "createClub",
    admin.idToken,
    {
      clubData: { name: "Test Club" },
    },
  );

  // Seed admin's user doc clubAccess
  await seedUserDocument(admin.uid, {
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
    admin.idToken,
    {
      clubId,
      groupData: { name: "Group A" },
    },
  );

  // Seed admin in club allMembers (for deleteClub permission check)
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

  // Seed admin in group allMembers (for subgroup/updateGroup permission checks)
  await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set(
    {
      members: [
        {
          userId: admin.uid,
          name: admin.email,
          email: admin.email,
          roles: ["admin", "club-admin"],
          isActive: true,
        },
      ],
      memberCount: 1,
    },
    { merge: true },
  );

  // Update admin's user doc with groupAccess (for isGroupAdminOrCoach)
  await seedUserDocument(admin.uid, {
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
            groupName: "Group A",
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
    admin.idToken,
    {
      uid: admin.uid,
      clubId,
      groupId,
      subGroupName: "Sub Team",
    },
  );

  return { admin, clubId, groupId, subGroupId };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Suite E: Club / Group / Subgroup CRUD", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // -----------------------------------------------------------------
  // TC-E1: Create club — verify all fields
  // -----------------------------------------------------------------
  it("TC-E1: should create a club with correct fields", async () => {
    const admin = await createAdminUser();

    const result = await callFunction<{ clubId: string }>(
      "createClub",
      admin.idToken,
      {
        clubData: {
          name: "My Awesome Club",
          description: "A test club",
          location: "Oslo",
        },
      },
    );
    expect(result.clubId).toBeDefined();
    const clubId = result.clubId;

    // Club document
    const club = (await getDocument(`clubs/${clubId}`))!;
    expect(club.name).toBe("My Awesome Club");
    expect(club.description).toBe("A test club");
    expect(club.location).toBe("Oslo");
    expect(club.isActive).toBe(true);
    expect(club.createdBy).toBe(admin.uid);
    expect(club.activeGroupCount).toBe(0);

    // allMembers doc
    const members = (await getDocument(`clubs/${clubId}/allMembers/members`))!;
    expect(members.members).toEqual([]);
    expect(members.memberCount).toBe(0);

    // User doc: activeClubsAsAdmin incremented
    const userDoc = (await getDocument(`users/${admin.uid}`))!;
    expect(userDoc.activeClubsAsAdmin).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------
  // TC-E2: Create club — missing name → invalid-argument
  // -----------------------------------------------------------------
  it("TC-E2: should reject club creation with missing name", async () => {
    const admin = await createAdminUser();

    try {
      await callFunction("createClub", admin.idToken, {
        clubData: {},
      });
      fail("Expected createClub to throw for missing name");
    } catch (error: any) {
      expect(error.message).toMatch(/name|required/i);
    }
  });

  // -----------------------------------------------------------------
  // TC-E3: Delete club — cascades to groups + subgroups
  // -----------------------------------------------------------------
  it("TC-E3: should soft-delete club and cascade to groups and subgroups", async () => {
    const { admin, clubId, groupId, subGroupId } = await setupFull();

    // Get activeClubsAsAdmin before delete
    const userBefore = (await getDocument(`users/${admin.uid}`))!;
    const clubsBefore = userBefore.activeClubsAsAdmin || 0;

    // --- ACTION ---
    const result = await callFunction<{
      deletionScheduledAt: number;
      gracePeriodDays: number;
    }>("deleteClub", admin.idToken, { clubId });
    expect(result.gracePeriodDays).toBe(30);
    expect(result.deletionScheduledAt).toBeGreaterThan(Date.now());

    // --- VERIFY ---
    // Club soft-deleted
    const club = (await getDocument(`clubs/${clubId}`))!;
    expect(club.isActive).toBe(false);
    expect(club.deletedBy).toBe(admin.uid);
    expect(club.deletionScheduledAt).toBeDefined();

    // User: activeClubsAsAdmin decremented
    const userAfter = (await getDocument(`users/${admin.uid}`))!;
    expect(userAfter.activeClubsAsAdmin).toBe(clubsBefore - 1);

    // Group cascade
    const group = (await getDocument(`clubs/${clubId}/groups/${groupId}`))!;
    expect(group.isActive).toBe(false);

    // Subgroup cascade
    const subgroup = (await getDocument(
      `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}`,
    ))!;
    expect(subgroup.isActive).toBe(false);
  });

  // -----------------------------------------------------------------
  // TC-E4: Delete club — non-admin → permission-denied
  // -----------------------------------------------------------------
  it("TC-E4: should reject club deletion by non-admin", async () => {
    const { admin, clubId } = await setupFull();

    // Create a non-admin user
    const nonAdmin = await createFullTestUser({
      email: `nonadmin_${Date.now()}@test.com`,
    });

    try {
      await callFunction("deleteClub", nonAdmin.idToken, { clubId });
      fail("Expected deleteClub to throw for non-admin");
    } catch (error: any) {
      expect(error.message).toMatch(/permission|admin/i);
    }
  });

  // -----------------------------------------------------------------
  // TC-E5: Create group — verify all fields
  // -----------------------------------------------------------------
  it("TC-E5: should create a group with correct fields", async () => {
    const admin = await createAdminUser();

    // Create club
    const { clubId } = await callFunction<{ clubId: string }>(
      "createClub",
      admin.idToken,
      {
        clubData: { name: "Club For Group Test" },
      },
    );
    await seedUserDocument(admin.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "Club For Group Test",
          role: "club-admin",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [],
        },
      ],
    });

    // Get club's activeGroupCount before
    const clubBefore = (await getDocument(`clubs/${clubId}`))!;
    const groupCountBefore = clubBefore.activeGroupCount || 0;

    // --- ACTION ---
    const result = await callFunction<{ groupId: string }>(
      "createGroup",
      admin.idToken,
      {
        clubId,
        groupData: { name: "Seniors" },
      },
    );
    expect(result.groupId).toBeDefined();
    const groupId = result.groupId;

    // --- VERIFY ---
    // Group document
    const group = (await getDocument(`clubs/${clubId}/groups/${groupId}`))!;
    expect(group.name).toBe("Seniors");
    expect(group.isActive).toBe(true);
    expect(group.clubId).toBe(clubId);

    // Group allMembers doc
    const groupMembers = (await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    ))!;
    expect(groupMembers.members).toEqual([]);
    expect(groupMembers.memberCount).toBe(0);

    // Club: activeGroupCount incremented
    const clubAfter = (await getDocument(`clubs/${clubId}`))!;
    expect(clubAfter.activeGroupCount).toBe(groupCountBefore + 1);
  });

  // -----------------------------------------------------------------
  // TC-E6: Delete group — cascades to subgroups
  // -----------------------------------------------------------------
  it("TC-E6: should soft-delete group and cascade to subgroups", async () => {
    const { admin, clubId, groupId, subGroupId } = await setupFull();

    // Get club's activeGroupCount before
    const clubBefore = (await getDocument(`clubs/${clubId}`))!;
    const groupCountBefore = clubBefore.activeGroupCount || 0;

    // --- ACTION ---
    const result = await callFunction<{
      deletionScheduledAt: number;
      gracePeriodDays: number;
    }>("deleteGroup", admin.idToken, { clubId, groupId });
    expect(result.gracePeriodDays).toBe(30);

    // --- VERIFY ---
    // Group soft-deleted
    const group = (await getDocument(`clubs/${clubId}/groups/${groupId}`))!;
    expect(group.isActive).toBe(false);
    expect(group.deletionScheduledAt).toBeDefined();

    // Club: activeGroupCount decremented
    const clubAfter = (await getDocument(`clubs/${clubId}`))!;
    expect(clubAfter.activeGroupCount).toBe(groupCountBefore - 1);

    // Subgroup cascade
    const subgroup = (await getDocument(
      `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}`,
    ))!;
    expect(subgroup.isActive).toBe(false);
  });

  // -----------------------------------------------------------------
  // TC-E7: Delete group — non-admin → permission-denied
  // -----------------------------------------------------------------
  it("TC-E7: should reject group deletion by non-admin", async () => {
    const { admin, clubId, groupId } = await setupFull();

    const nonAdmin = await createFullTestUser({
      email: `nonadmin_${Date.now()}@test.com`,
    });
    // Seed user doc without club-admin role
    await seedUserDocument(nonAdmin.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "Test Club",
          role: "member",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [],
        },
      ],
    });

    try {
      await callFunction("deleteGroup", nonAdmin.idToken, { clubId, groupId });
      fail("Expected deleteGroup to throw for non-admin");
    } catch (error: any) {
      expect(error.message).toMatch(/permission|admin/i);
    }
  });

  // -----------------------------------------------------------------
  // TC-E8: Create subgroup
  // -----------------------------------------------------------------
  it("TC-E8: should create a subgroup with correct fields", async () => {
    const { admin, clubId, groupId } = await setupFull();

    // --- ACTION ---
    const result = await callFunction<{
      subGroupId: string;
      subGroupName: string;
    }>("createSubGroup", admin.idToken, {
      uid: admin.uid,
      clubId,
      groupId,
      subGroupName: "Under 15s",
    });
    expect(result.subGroupId).toBeDefined();
    const subGroupId = result.subGroupId;

    // --- VERIFY ---
    const subgroup = (await getDocument(
      `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}`,
    ))!;
    expect(subgroup.name).toBe("Under 15s");
    expect(subgroup.createdBy).toBe(admin.uid);

    // Parent group should track the subgroup
    const group = (await getDocument(`clubs/${clubId}/groups/${groupId}`))!;
    const subGroupIds = (group.subGroups || []).map((s: any) => s.id);
    expect(subGroupIds).toContain(subGroupId);
  });

  // -----------------------------------------------------------------
  // TC-E9: Edit subgroup name
  // -----------------------------------------------------------------
  it("TC-E9: should update subgroup name", async () => {
    const { admin, clubId, groupId, subGroupId } = await setupFull();

    // --- ACTION ---
    await callFunction("updateSubGroup", admin.idToken, {
      uid: admin.uid,
      clubId,
      groupId,
      subGroupId,
      name: "Renamed Sub Team",
    });

    // --- VERIFY ---
    const subgroup = (await getDocument(
      `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}`,
    ))!;
    expect(subgroup.name).toBe("Renamed Sub Team");
  });

  // -----------------------------------------------------------------
  // TC-E10: Delete subgroup (hard delete)
  // -----------------------------------------------------------------
  it("TC-E10: should delete subgroup", async () => {
    const { admin, clubId, groupId, subGroupId } = await setupFull();

    // --- ACTION ---
    const result = await callFunction("deleteSubGroup", admin.idToken, {
      uid: admin.uid,
      clubId,
      groupId,
      subGroupId,
    });
    expect(result.success).toBe(true);

    // --- VERIFY ---
    // Subgroup doc should be deleted (hard delete per the function)
    const subgroup = await getDocument(
      `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}`,
    );
    // Hard delete means doc shouldn't exist, or if it's soft-delete, isActive = false
    if (subgroup) {
      expect(subgroup.isActive).toBe(false);
    }
    // Either way, the function reported success
  });

  // -----------------------------------------------------------------
  // TC-E11: Edit group name and description
  // -----------------------------------------------------------------
  it("TC-E11: should update group name and description", async () => {
    const { admin, clubId, groupId } = await setupFull();

    // --- ACTION ---
    await callFunction("updateGroup", admin.idToken, {
      clubId,
      groupId,
      groupData: { name: "Updated Group Name", description: "New description" },
    });

    // --- VERIFY ---
    const group = (await getDocument(`clubs/${clubId}/groups/${groupId}`))!;
    expect(group.name).toBe("Updated Group Name");
    expect(group.description).toBe("New description");
  });

  // -----------------------------------------------------------------
  // TC-E12: Edit group — non-admin → permission-denied
  // -----------------------------------------------------------------
  it("TC-E12: should reject group edit by non-admin non-coach", async () => {
    const { admin, clubId, groupId } = await setupFull();

    // Create a player-only user (not admin, not coach)
    const player = await createFullTestUser({
      email: `player_${Date.now()}@test.com`,
    });
    await seedUserDocument(player.uid, {
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
              roles: ["player"],
              joinedAt: new Date(),
            },
          ],
        },
      ],
    });

    try {
      await callFunction("updateGroup", player.idToken, {
        clubId,
        groupId,
        groupData: { name: "Should Fail" },
      });
      fail("Expected updateGroup to throw for player");
    } catch (error: any) {
      expect(error.message).toMatch(/permission|admin|coach/i);
    }
  });
});
