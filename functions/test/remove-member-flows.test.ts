/**
 * Suite C: Remove Member Flows
 *
 * Tests the removal orchestration:
 *   removeMemberFromGroup → (if last group) removeMemberFromClub → updateUserClubRemoval
 *
 * Also tests role de-accumulation and club-admin role removal.
 */

import {
    callFunction,
    clearAll,
    createFullTestUser,
    getDocument,
    getFirestore,
    seedUserDocument
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
 * Create club + group, seed admin user doc with proper permissions.
 * Also seeds admin in club allMembers for permission checks in removeMemberFromGroup.
 * Returns admin user, clubId, groupId.
 */
async function setupClubAndGroup(): Promise<{
  admin: TestUser;
  clubId: string;
  groupId: string;
}> {
  const admin = await createFullTestUser({
    email: `admin_${Date.now()}@test.com`,
  });

  const clubResult = await callFunction<{ clubId: string }>(
    "createClub",
    admin.idToken,
    {
      clubData: { name: "Test Club" },
    },
  );
  const clubId = clubResult.clubId;

  // Seed admin's user doc so removeMemberFromGroup recognises them as club-admin
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

  const groupResult = await callFunction<{ groupId: string }>(
    "createGroup",
    admin.idToken,
    {
      clubId,
      groupData: { name: "Group A" },
    },
  );
  const groupId = groupResult.groupId;

  // Seed admin in club allMembers (required for permission checks in removeMemberFromGroup)
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

  // Update admin's user doc with groupAccess
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

  return { admin, clubId, groupId };
}

/**
 * Full flow to add a member to club + group with the given roles[] array.
 * Returns the member's TestUser.
 */
async function addMemberToClubAndGroup(
  adminUser: TestUser,
  email: string,
  clubId: string,
  groupId: string,
  roles: string[],
  extra?: { needsGuardian?: boolean; guardiansContacts?: any[] },
): Promise<TestUser> {
  const member = await createFullTestUser({ email });

  // Determine club-level role
  const clubRole = roles.includes("club-admin") ? "club-admin" : "member";

  // Add to club allMembers
  await callFunction("addMemberToClub", adminUser.idToken, {
    clubId,
    memberData: {
      userId: member.uid,
      roles,
      name: member.email,
      email: member.email,
      addedBy: adminUser.uid,
      joinedAt: new Date().toISOString(),
      ...(extra || {}),
    },
  });

  // Update user's clubAccess
  await callFunction("updateUserClubInfo", adminUser.idToken, {
    uid: member.uid,
    clubInfo: {
      clubId,
      clubName: "Test Club",
      role: clubRole,
      joinedAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    },
    role: clubRole,
  });

  // Add to group allMembers
  await callFunction("addMemberToGroup", adminUser.idToken, {
    clubId,
    groupId,
    memberData: {
      userId: member.uid,
      roles,
      name: member.email,
      email: member.email,
      ...(extra || {}),
    },
  });

  // Update user's groupAccess
  await callFunction("updateUserGroupInfo", adminUser.idToken, {
    uid: member.uid,
    clubId,
    groupInfo: {
      groupId,
      groupName: "Group A",
      joinedAt: new Date().toISOString(),
    },
    roles,
    operation: "add",
  });

  return member;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Suite C: Remove Member Flows", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // -----------------------------------------------------------------
  // TC-C1: Remove player from group — still in another group
  // -----------------------------------------------------------------
  it("TC-C1: should remove player from one group while keeping them in another", async () => {
    const { admin, clubId, groupId: groupAId } = await setupClubAndGroup();

    // Create a second group
    const groupBResult = await callFunction<{ groupId: string }>(
      "createGroup",
      admin.idToken,
      {
        clubId,
        groupData: { name: "Group B" },
      },
    );
    const groupBId = groupBResult.groupId;

    // Update admin's groupAccess to include both groups
    await seedUserDocument(admin.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "Test Club",
          role: "club-admin",
          isActive: true,
          joinedAt: new Date().toISOString(),
          lastModifiedAt: new Date().toISOString(),
          groupAccess: [
            {
              groupId: groupAId,
              groupName: "Group A",
              roles: ["admin"],
              joinedAt: new Date().toISOString(),
            },
            {
              groupId: groupBId,
              groupName: "Group B",
              roles: ["admin"],
              joinedAt: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    // Add player to both groups
    const player = await addMemberToClubAndGroup(
      admin,
      `player_${Date.now()}@test.com`,
      clubId,
      groupAId,
      ["player"],
    );

    // Also add to Group B
    await callFunction("addMemberToGroup", admin.idToken, {
      clubId,
      groupId: groupBId,
      memberData: {
        userId: player.uid,
        roles: ["player"],
        name: player.email,
        email: player.email,
      },
    });
    await callFunction("updateUserGroupInfo", admin.idToken, {
      uid: player.uid,
      clubId,
      groupInfo: {
        groupId: groupBId,
        groupName: "Group B",
        joinedAt: new Date().toISOString(),
      },
      roles: ["player"],
      operation: "add",
    });
    // Add player role again in club member list for accumulation
    await callFunction("updateClubMemberRole", admin.idToken, {
      clubId,
      userId: player.uid,
      operation: "add",
      roleToAdd: "player",
    });

    // --- ACTION: Remove from Group A only ---
    await callFunction("removeMemberFromGroup", admin.idToken, {
      clubId,
      groupId: groupAId,
      userId: player.uid,
    });

    // Belt-and-suspenders user doc update (mirrors orchestrator)
    await callFunction("updateUserGroupRemoval", admin.idToken, {
      userId: player.uid,
      clubId,
      groupId: groupAId,
    });

    // --- VERIFY ---
    // Group A: player removed
    const groupAMembers = await getDocument(
      `clubs/${clubId}/groups/${groupAId}/allMembers/members`,
    );
    const inGroupA = (groupAMembers?.members || []).find(
      (m: any) => m.userId === player.uid && m.isActive !== false,
    );
    expect(inGroupA).toBeUndefined();

    // Group B: player still present
    const groupBMembers = await getDocument(
      `clubs/${clubId}/groups/${groupBId}/allMembers/members`,
    );
    const inGroupB = (groupBMembers?.members || []).find(
      (m: any) => m.userId === player.uid,
    );
    expect(inGroupB).toBeDefined();
    expect(inGroupB.roles).toContain("player");

    // Club: player still present (still in Group B)
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const inClub = (clubMembers?.members || []).find(
      (m: any) => m.userId === player.uid,
    );
    expect(inClub).toBeDefined();

    // User doc: only Group B in groupAccess
    const userDoc = await getDocument(`users/${player.uid}`);
    const clubEntry = (userDoc?.clubAccess || []).find(
      (c: any) => c.clubId === clubId,
    );
    expect(clubEntry).toBeDefined();
    const groupIds = (clubEntry.groupAccess || []).map((g: any) => g.groupId);
    expect(groupIds).not.toContain(groupAId);
    expect(groupIds).toContain(groupBId);
  });

  // -----------------------------------------------------------------
  // TC-C2: Remove player from last group → remove from club
  // -----------------------------------------------------------------
  it("TC-C2: should remove player from group and club when it is the last group", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const player = await addMemberToClubAndGroup(
      admin,
      `player_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    // --- ACTION: Remove from group ---
    await callFunction("removeMemberFromGroup", admin.idToken, {
      clubId,
      groupId,
      userId: player.uid,
    });

    // Remove from club entirely
    await callFunction("removeMemberFromClub", admin.idToken, {
      clubId,
      userId: player.uid,
    });

    // Remove club from user doc
    await callFunction("updateUserClubRemoval", admin.idToken, {
      userId: player.uid,
      clubId,
    });

    // --- VERIFY ---
    // Group: player removed
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const inGroup = (groupMembers?.members || []).find(
      (m: any) => m.userId === player.uid && m.isActive !== false,
    );
    expect(inGroup).toBeUndefined();

    // Club: player removed
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const inClub = (clubMembers?.members || []).find(
      (m: any) => m.userId === player.uid,
    );
    expect(inClub).toBeUndefined();

    // User doc: no active club access
    const userDoc = await getDocument(`users/${player.uid}`);
    const clubEntry = (userDoc?.clubAccess || []).find(
      (c: any) => c.clubId === clubId,
    );
    expect(clubEntry).toBeUndefined();
  });

  // -----------------------------------------------------------------
  // TC-C3: Remove coach from last group → full removal
  // -----------------------------------------------------------------
  it("TC-C3: should remove coach from group and club (last group)", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const coach = await addMemberToClubAndGroup(
      admin,
      `coach_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["coach"],
    );

    // --- ACTION ---
    await callFunction("removeMemberFromGroup", admin.idToken, {
      clubId,
      groupId,
      userId: coach.uid,
    });
    await callFunction("removeMemberFromClub", admin.idToken, {
      clubId,
      userId: coach.uid,
    });
    await callFunction("updateUserClubRemoval", admin.idToken, {
      userId: coach.uid,
      clubId,
    });

    // --- VERIFY ---
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const inGroup = (groupMembers?.members || []).find(
      (m: any) => m.userId === coach.uid && m.isActive !== false,
    );
    expect(inGroup).toBeUndefined();

    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const inClub = (clubMembers?.members || []).find(
      (m: any) => m.userId === coach.uid,
    );
    expect(inClub).toBeUndefined();

    const userDoc = await getDocument(`users/${coach.uid}`);
    const clubEntry = (userDoc?.clubAccess || []).find(
      (c: any) => c.clubId === clubId,
    );
    expect(clubEntry).toBeUndefined();
  });

  // -----------------------------------------------------------------
  // TC-C4: Remove admin from last group → full removal
  // -----------------------------------------------------------------
  it("TC-C4: should remove group admin from group and club (last group)", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const groupAdmin = await addMemberToClubAndGroup(
      admin,
      `gadmin_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["admin"],
    );

    // --- ACTION ---
    await callFunction("removeMemberFromGroup", admin.idToken, {
      clubId,
      groupId,
      userId: groupAdmin.uid,
    });
    await callFunction("removeMemberFromClub", admin.idToken, {
      clubId,
      userId: groupAdmin.uid,
    });
    await callFunction("updateUserClubRemoval", admin.idToken, {
      userId: groupAdmin.uid,
      clubId,
    });

    // --- VERIFY ---
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const inGroup = (groupMembers?.members || []).find(
      (m: any) => m.userId === groupAdmin.uid && m.isActive !== false,
    );
    expect(inGroup).toBeUndefined();

    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const inClub = (clubMembers?.members || []).find(
      (m: any) => m.userId === groupAdmin.uid,
    );
    expect(inClub).toBeUndefined();

    const userDoc = await getDocument(`users/${groupAdmin.uid}`);
    const clubEntry = (userDoc?.clubAccess || []).find(
      (c: any) => c.clubId === clubId,
    );
    expect(clubEntry).toBeUndefined();
  });

  // -----------------------------------------------------------------
  // TC-C5: Remove youth from group + club + guardian cleanup
  // -----------------------------------------------------------------
  it("TC-C5: should remove youth member and update guardian tracking", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Create guardian user
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
    });

    // Create youth doc via createYouthMemberDocument
    const youthResult = await callFunction<{ youthUid: string }>(
      "createYouthMemberDocument",
      guardian.idToken,
      {
        childName: "Youth Player",
        dateOfBirth: "2015-06-15",
        guardianUid: guardian.uid,
        guardianEmail: guardian.email,
        guardianName: "Guardian",
        relationship: "parent",
      },
    );
    const youthUid = youthResult.youthUid;

    // Add guardian to club + group as guardian
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: guardian.uid,
        roles: ["guardian"],
        name: guardian.email,
        email: guardian.email,
        addedBy: admin.uid,
        joinedAt: new Date().toISOString(),
      },
    });
    await callFunction("updateUserClubInfo", admin.idToken, {
      uid: guardian.uid,
      clubInfo: {
        clubId,
        clubName: "Test Club",
        role: "guardian",
        joinedAt: new Date().toISOString(),
        lastModifiedAt: new Date().toISOString(),
      },
      role: "guardian",
    });

    // Add youth to club + group
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
            guardianName: "Guardian",
            guardianEmail: guardian.email,
          },
        ],
        joinedAt: new Date().toISOString(),
      },
    });
    await callFunction("updateUserClubInfo", admin.idToken, {
      uid: youthUid,
      clubInfo: {
        clubId,
        clubName: "Test Club",
        role: "player-underage",
        joinedAt: new Date().toISOString(),
        lastModifiedAt: new Date().toISOString(),
      },
      role: "player-underage",
    });
    await callFunction("addMemberToGroup", admin.idToken, {
      clubId,
      groupId,
      memberData: {
        userId: youthUid,
        roles: ["player-underage"],
        name: "Youth Player",
        needsGuardian: true,
        guardiansContacts: [
          {
            guardianUid: guardian.uid,
            guardianName: "Guardian",
            guardianEmail: guardian.email,
          },
        ],
      },
    });
    await callFunction("updateUserGroupInfo", admin.idToken, {
      uid: youthUid,
      clubId,
      groupInfo: {
        groupId,
        groupName: "Group A",
        joinedAt: new Date().toISOString(),
      },
      roles: ["player-underage"],
      operation: "add",
    });

    // Seed guardian's dependents array so cleanup functions find it
    await seedUserDocument(guardian.uid, {
      dependents: [
        {
          uid: youthUid,
          name: "Youth Player",
          clubAccess: [
            { clubId, clubName: "Test Club", role: "player-underage" },
          ],
        },
      ],
    });

    // --- ACTION: Remove youth ---
    await callFunction("removeMemberFromGroup", admin.idToken, {
      clubId,
      groupId,
      userId: youthUid,
    });
    await callFunction("removeMemberFromClub", admin.idToken, {
      clubId,
      userId: youthUid,
    });
    await callFunction("updateUserClubRemoval", admin.idToken, {
      userId: youthUid,
      clubId,
    });

    // Guardian-specific cleanup
    await callFunction("updateGuardianDependentClubRemoval", admin.idToken, {
      guardianUid: guardian.uid,
      youthUid,
      clubId,
    });
    await callFunction("checkAndMarkGuardianInactive", admin.idToken, {
      guardianUid: guardian.uid,
    });

    // --- VERIFY ---
    // Group: youth removed
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const youthInGroup = (groupMembers?.members || []).find(
      (m: any) => m.userId === youthUid && m.isActive !== false,
    );
    expect(youthInGroup).toBeUndefined();

    // Club: youth removed
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const youthInClub = (clubMembers?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthInClub).toBeUndefined();

    // User doc: youth has no active club access
    const youthDoc = await getDocument(`users/${youthUid}`);
    const youthClubEntry = (youthDoc?.clubAccess || []).find(
      (c: any) => c.clubId === clubId,
    );
    expect(youthClubEntry).toBeUndefined();

    // Guardian: dependent's clubAccess for this club removed
    const guardianDoc = await getDocument(`users/${guardian.uid}`);
    const dep = (guardianDoc?.dependents || []).find(
      (d: any) => d.uid === youthUid,
    );
    if (dep) {
      const depClub = (dep.clubAccess || []).find(
        (c: any) => c.clubId === clubId,
      );
      expect(depClub).toBeUndefined();
    }
  });

  // -----------------------------------------------------------------
  // TC-C6: Remove one role from multi-role member (de-accumulation)
  // -----------------------------------------------------------------
  it("TC-C6: should remove one role from a multi-role member (de-accumulation)", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Add player first
    const member = await addMemberToClubAndGroup(
      admin,
      `multirole_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    // Accumulate a second role: coach
    await callFunction("updateMemberRole", admin.idToken, {
      clubId,
      groupId,
      userId: member.uid,
      operation: "add",
      roleToAdd: "coach",
    });

    // Verify both roles present
    const beforeGroupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const beforeMember = (beforeGroupMembers?.members || []).find(
      (m: any) => m.userId === member.uid,
    );
    expect(beforeMember.roles).toContain("player");
    expect(beforeMember.roles).toContain("coach");

    // --- ACTION: Remove coach role only ---
    await callFunction("removeMemberFromGroup", admin.idToken, {
      clubId,
      groupId,
      userId: member.uid,
      roleToRemove: "coach",
    });

    // --- VERIFY ---
    // Group: still has player, no longer has coach
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const afterMember = (groupMembers?.members || []).find(
      (m: any) => m.userId === member.uid,
    );
    expect(afterMember).toBeDefined();
    expect(afterMember.roles).toContain("player");
    expect(afterMember.roles).not.toContain("coach");

    // Club member list: player role present, coach removed
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const clubMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === member.uid,
    );
    expect(clubMember).toBeDefined();
    expect(clubMember.roles).toContain("player");
    expect(clubMember.roles).not.toContain("coach");

    // User doc: groupAccess roles show player only
    const userDoc = await getDocument(`users/${member.uid}`);
    const clubEntry = (userDoc?.clubAccess || []).find(
      (c: any) => c.clubId === clubId,
    );
    const groupEntry = (clubEntry?.groupAccess || []).find(
      (g: any) => g.groupId === groupId,
    );
    expect(groupEntry).toBeDefined();
    expect(groupEntry.roles).toContain("player");
    expect(groupEntry.roles).not.toContain("coach");
  });

  // -----------------------------------------------------------------
  // TC-C7: Remove club-admin role
  // -----------------------------------------------------------------
  it("TC-C7: should remove club-admin role and downgrade user", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Add a member as player
    const member = await addMemberToClubAndGroup(
      admin,
      `clubadmin_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    // Promote to club-admin via updateClubMemberRole
    await callFunction("updateClubMemberRole", admin.idToken, {
      clubId,
      userId: member.uid,
      operation: "add",
      roleToAdd: "club-admin",
    });

    // Verify club-admin role present
    const beforeClubMembers = await getDocument(
      `clubs/${clubId}/allMembers/members`,
    );
    const beforeMember = (beforeClubMembers?.members || []).find(
      (m: any) => m.userId === member.uid,
    );
    expect(beforeMember.roles).toContain("club-admin");
    expect(beforeMember.roles).toContain("player");

    // --- ACTION: Remove club-admin role ---
    await callFunction("updateClubMemberRole", admin.idToken, {
      clubId,
      userId: member.uid,
      operation: "remove",
      roleToRemove: "club-admin",
    });

    // --- VERIFY ---
    // Club member list: only player left
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const afterMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === member.uid,
    );
    expect(afterMember).toBeDefined();
    expect(afterMember.roles).toContain("player");
    expect(afterMember.roles).not.toContain("club-admin");

    // Note: updateClubMemberRole does NOT update user doc — club-level only
    // User doc role downgrade would require a separate updateUserClubInfo call (not tested here)
  });
});
