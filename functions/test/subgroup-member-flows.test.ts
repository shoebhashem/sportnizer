/**
 * Suite D: Subgroup Member Operations
 *
 * Tests:
 *   TC-D1: Add member to subgroup (copies from parent group)
 *   TC-D2: Remove member from subgroup (group membership unaffected)
 *   TC-D3: Add to subgroup when not in parent group → error
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
 * Create club + group + subgroup, seed admin in both club and group allMembers.
 */
async function setupClubGroupSubgroup(): Promise<{
  admin: TestUser;
  clubId: string;
  groupId: string;
  subGroupId: string;
}> {
  const admin = await createFullTestUser({
    email: `admin_${Date.now()}@test.com`,
  });

  // Create club
  const { clubId } = await callFunction<{ clubId: string }>(
    "createClub",
    admin.idToken,
    {
      clubData: { name: "Test Club" },
    },
  );

  // Seed admin user doc
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

  // Seed admin in club allMembers
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

  // Seed admin in group allMembers (needed for subgroup permission checks)
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

  // Create subgroup
  const { subGroupId } = await callFunction<{ subGroupId: string }>(
    "createSubGroup",
    admin.idToken,
    {
      uid: admin.uid,
      clubId,
      groupId,
      subGroupName: "Sub Team Alpha",
    },
  );

  return { admin, clubId, groupId, subGroupId };
}

/**
 * Add a player to club + group.
 */
async function addPlayerToClubAndGroup(
  adminUser: TestUser,
  email: string,
  clubId: string,
  groupId: string,
): Promise<TestUser> {
  const player = await createFullTestUser({ email });

  await callFunction("addMemberToClub", adminUser.idToken, {
    clubId,
    memberData: {
      userId: player.uid,
      roles: ["player"],
      name: player.email,
      email: player.email,
      addedBy: adminUser.uid,
      joinedAt: new Date().toISOString(),
    },
  });

  await callFunction("updateUserClubInfo", adminUser.idToken, {
    uid: player.uid,
    clubInfo: {
      clubId,
      clubName: "Test Club",
      role: "member",
      joinedAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    },
    role: "member",
  });

  await callFunction("addMemberToGroup", adminUser.idToken, {
    clubId,
    groupId,
    memberData: {
      userId: player.uid,
      roles: ["player"],
      name: player.email,
      email: player.email,
    },
  });

  await callFunction("updateUserGroupInfo", adminUser.idToken, {
    uid: player.uid,
    clubId,
    groupInfo: {
      groupId,
      groupName: "Group A",
      joinedAt: new Date().toISOString(),
    },
    roles: ["player"],
    operation: "add",
  });

  return player;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Suite D: Subgroup Member Operations", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // -----------------------------------------------------------------
  // TC-D1: Add member to subgroup
  // -----------------------------------------------------------------
  it("TC-D1: should add a group member to a subgroup", async () => {
    const { admin, clubId, groupId, subGroupId } =
      await setupClubGroupSubgroup();
    const player = await addPlayerToClubAndGroup(
      admin,
      `player_${Date.now()}@test.com`,
      clubId,
      groupId,
    );

    // --- ACTION ---
    const result = await callFunction("addMemberToSubGroup", admin.idToken, {
      clubId,
      groupId,
      subGroupId,
      userId: player.uid,
    });
    expect(result.success).toBe(true);

    // --- VERIFY ---
    const subgroupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}/allMembers/members`,
    );
    const member = (subgroupMembers?.members || []).find(
      (m: any) => m.userId === player.uid,
    );
    expect(member).toBeDefined();
    expect(member.roles).toContain("player");
    expect(member.name).toBe(player.email);
  });

  // -----------------------------------------------------------------
  // TC-D2: Remove member from subgroup
  // -----------------------------------------------------------------
  it("TC-D2: should remove member from subgroup without affecting group membership", async () => {
    const { admin, clubId, groupId, subGroupId } =
      await setupClubGroupSubgroup();
    const player = await addPlayerToClubAndGroup(
      admin,
      `player_${Date.now()}@test.com`,
      clubId,
      groupId,
    );

    // First add to subgroup
    await callFunction("addMemberToSubGroup", admin.idToken, {
      clubId,
      groupId,
      subGroupId,
      userId: player.uid,
    });

    // --- ACTION: Remove from subgroup ---
    const result = await callFunction(
      "removeMemberFromSubGroup",
      admin.idToken,
      {
        clubId,
        groupId,
        subGroupId,
        userId: player.uid,
      },
    );
    expect(result.success).toBe(true);

    // --- VERIFY ---
    // Subgroup: member removed
    const subgroupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}/allMembers/members`,
    );
    const inSubgroup = (subgroupMembers?.members || []).find(
      (m: any) => m.userId === player.uid,
    );
    expect(inSubgroup).toBeUndefined();

    // Group: member still present
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const inGroup = (groupMembers?.members || []).find(
      (m: any) => m.userId === player.uid,
    );
    expect(inGroup).toBeDefined();
    expect(inGroup.roles).toContain("player");
  });

  // -----------------------------------------------------------------
  // TC-D3: Add to subgroup — not in parent group → error
  // -----------------------------------------------------------------
  it("TC-D3: should reject adding to subgroup when user is not in parent group", async () => {
    const { admin, clubId, groupId, subGroupId } =
      await setupClubGroupSubgroup();

    // Create a user who is NOT in the group
    const outsider = await createFullTestUser({
      email: `outsider_${Date.now()}@test.com`,
    });

    // --- ACTION + VERIFY: should throw ---
    try {
      await callFunction("addMemberToSubGroup", admin.idToken, {
        clubId,
        groupId,
        subGroupId,
        userId: outsider.uid,
      });
      // If we get here, the function didn't throw — fail the test
      fail("Expected addMemberToSubGroup to throw for non-group member");
    } catch (error: any) {
      expect(error.message).toMatch(/not a member of this group/i);
    }
  });
});
