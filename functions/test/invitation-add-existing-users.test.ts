/**
 * Suite B: Add Member — Existing Users (Has Clubnizer Account)
 *
 * Level 1 Backend E2E Integration Tests
 *
 * Tests adding already-registered users to clubs/groups via invitation.
 * Covers: not-in-club, cross-group, role accumulation, club-admin upgrade,
 * and existing youth flows.
 *
 * Test cases: TC-B1 through TC-B8
 */

import {
    callFunction,
    clearAll,
    createFullTestUser,
    getDocument,
    getFirestore,
    seedUserDocument,
} from "./helpers";

// ─── Shared Setup ────────────────────────────────────────────

async function setupClubAndGroup() {
  const admin = await createFullTestUser({ displayName: "Club Admin" });

  const { clubId } = await callFunction("createClub", admin.idToken, {
    clubData: { name: `Test Club ${Date.now()}` },
  });

  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Test Club",
        role: "club-admin",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [],
      },
    ],
  });

  const { groupId } = await callFunction("createGroup", admin.idToken, {
    clubId,
    groupData: { name: "Group A" },
  });

  // Seed admin in club allMembers
  const db = getFirestore();
  await db.doc(`clubs/${clubId}/allMembers/members`).set(
    {
      members: [
        {
          userId: admin.uid,
          name: admin.displayName,
          email: admin.email,
          roles: ["club-admin"],
          isActive: true,
        },
      ],
      memberCount: 1,
    },
    { merge: true },
  );

  return { admin, clubId, groupId };
}

/**
 * Adds an existing user to a club + group via the full flow.
 * Used to set up preconditions for cross-group and accumulation tests.
 */
async function addExistingMemberToClubAndGroup(
  adminUser: { uid: string; idToken: string; displayName: string },
  targetUser: {
    uid: string;
    displayName: string;
    email: string;
    idToken: string;
  },
  clubId: string,
  groupId: string,
  groupName: string,
  role: string,
) {
  // Add to club
  await callFunction("addMemberToClub", adminUser.idToken, {
    clubId,
    memberData: {
      userId: targetUser.uid,
      roles: [role],
      name: targetUser.displayName,
      email: targetUser.email,
      addedBy: adminUser.uid,
      photoURL: "",
      joinedAt: new Date().toISOString(),
      needsGuardian: false,
      guardiansContacts: [],
      lastModifiedAt: new Date().toISOString(),
    },
  });

  // Update user club info
  await callFunction("updateUserClubInfo", adminUser.idToken, {
    uid: targetUser.uid,
    clubInfo: {
      clubId,
      clubName: "Test Club",
      role,
      joinedAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    },
    role,
  });

  // Add to group
  await callFunction("addMemberToGroup", adminUser.idToken, {
    clubId,
    groupId,
    memberData: {
      userId: targetUser.uid,
      roles: [role],
      name: targetUser.displayName,
      email: targetUser.email,
      needsGuardian: false,
      guardiansContacts: [],
      joinedAt: new Date().toISOString(),
      photoURL: "",
    },
  });

  // Update user group info
  await callFunction("updateUserGroupInfo", adminUser.idToken, {
    uid: targetUser.uid,
    clubId,
    groupInfo: {
      groupId,
      groupName,
      joinedAt: new Date().toISOString(),
    },
    roles: [role],
    operation: "add",
  });
}

// ═══════════════════════════════════════════════════════════════

describe("Suite B: Add Member — Existing Users", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── TC-B1: Existing Player (not in club) ──────────────────

  it("TC-B1: should add an existing user as player to club and group", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Create target user (already has Clubnizer account but NOT in this club)
    const player = await createFullTestUser({
      email: "existingplayer@test.com",
      displayName: "Existing Player",
    });

    // Step 1: Send invitation
    const sendResult = await callFunction(
      "sendGroupInvitation",
      admin.idToken,
      {
        emails: [player.email],
        clubId,
        clubName: "Test Club",
        groupId,
        groupName: "Group A",
        inviterName: admin.displayName,
        role: "player",
      },
    );
    expect(sendResult.success).toBe(true);
    const token = sendResult.results[0].invitationToken;

    // Step 2: Check membership — should be false/false
    const membership = await callFunction("checkMembership", player.idToken, {
      userId: player.uid,
      clubId,
      groupId,
    });
    expect(membership.isClubMember).toBe(false);
    expect(membership.isGroupMember).toBe(false);

    // Steps 3-6: Full add flow
    await addExistingMemberToClubAndGroup(
      admin,
      player,
      clubId,
      groupId,
      "Group A",
      "player",
    );

    // Step 7: Mark invitation used
    await callFunction("markInvitationUsed", admin.idToken, {
      invitationToken: token,
      userId: player.uid,
      status: "accepted",
    });

    // ── Assertions ──

    // Club allMembers
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const clubMember = clubMembers!.members.find(
      (m: any) => m.userId === player.uid,
    );
    expect(clubMember).toBeDefined();
    expect(clubMember.roles).toContain("player");

    // Group allMembers
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const groupMember = groupMembers!.members.find(
      (m: any) => m.userId === player.uid,
    );
    expect(groupMember).toBeDefined();
    expect(groupMember.roles).toContain("player");

    // User document — clubAccess
    const userDoc = await getDocument(`users/${player.uid}`);
    const clubEntry = userDoc!.clubAccess.find((c: any) => c.clubId === clubId);
    expect(clubEntry).toBeDefined();
    expect(clubEntry.role).toBe("member"); // permission-level
    const groupEntry = clubEntry.groupAccess.find(
      (g: any) => g.groupId === groupId,
    );
    expect(groupEntry).toBeDefined();
    expect(groupEntry.roles).toContain("player");
  });

  // ─── TC-B2: Existing Coach (not in club) ───────────────────

  it("TC-B2: should add an existing user as coach to club and group", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const coach = await createFullTestUser({
      email: "existingcoach@test.com",
      displayName: "Existing Coach",
    });

    const sendResult = await callFunction(
      "sendGroupInvitation",
      admin.idToken,
      {
        emails: [coach.email],
        clubId,
        clubName: "Test Club",
        groupId,
        groupName: "Group A",
        inviterName: admin.displayName,
        role: "coach",
      },
    );
    const token = sendResult.results[0].invitationToken;

    const membership = await callFunction("checkMembership", coach.idToken, {
      userId: coach.uid,
      clubId,
      groupId,
    });
    expect(membership.isClubMember).toBe(false);

    await addExistingMemberToClubAndGroup(
      admin,
      coach,
      clubId,
      groupId,
      "Group A",
      "coach",
    );

    await callFunction("markInvitationUsed", admin.idToken, {
      invitationToken: token,
      userId: coach.uid,
      status: "accepted",
    });

    // Assertions
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    expect(
      clubMembers!.members.find((m: any) => m.userId === coach.uid).roles,
    ).toContain("coach");

    const userDoc = await getDocument(`users/${coach.uid}`);
    const clubEntry = userDoc!.clubAccess.find((c: any) => c.clubId === clubId);
    expect(clubEntry.role).toBe("member"); // permission-level
    expect(clubEntry.groupAccess[0].roles).toContain("coach");
  });

  // ─── TC-B3: Existing Admin (not in club) ───────────────────

  it("TC-B3: should add an existing user as group admin to club and group", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const groupAdmin = await createFullTestUser({
      email: "existingadmin@test.com",
      displayName: "Existing Admin",
    });

    const sendResult = await callFunction(
      "sendGroupInvitation",
      admin.idToken,
      {
        emails: [groupAdmin.email],
        clubId,
        clubName: "Test Club",
        groupId,
        groupName: "Group A",
        inviterName: admin.displayName,
        role: "admin",
      },
    );
    const token = sendResult.results[0].invitationToken;

    const membership = await callFunction(
      "checkMembership",
      groupAdmin.idToken,
      { userId: groupAdmin.uid, clubId, groupId },
    );
    expect(membership.isClubMember).toBe(false);

    await addExistingMemberToClubAndGroup(
      admin,
      groupAdmin,
      clubId,
      groupId,
      "Group A",
      "admin",
    );

    await callFunction("markInvitationUsed", admin.idToken, {
      invitationToken: token,
      userId: groupAdmin.uid,
      status: "accepted",
    });

    // Assertions
    const userDoc = await getDocument(`users/${groupAdmin.uid}`);
    const clubEntry = userDoc!.clubAccess.find((c: any) => c.clubId === clubId);
    expect(clubEntry.role).toBe("member"); // permission-level
    expect(clubEntry.groupAccess[0].roles).toContain("admin");
  });

  // ─── TC-B4: Existing Club Admin (not in club) ─────────────

  it("TC-B4: should add an existing user as club admin (no group ops)", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const newClubAdmin = await createFullTestUser({
      email: "existingclubadmin@test.com",
      displayName: "Existing Club Admin",
    });

    // Send club-admin invitation
    const sendResult = await callFunction(
      "sendGroupInvitation",
      admin.idToken,
      {
        emails: [newClubAdmin.email],
        clubId,
        clubName: "Test Club",
        groupId,
        groupName: "Group A",
        inviterName: admin.displayName,
        role: "club-admin",
        invitationType: "club_admin",
      },
    );
    const token = sendResult.results[0].invitationToken;

    // Check membership
    const membership = await callFunction(
      "checkMembership",
      newClubAdmin.idToken,
      { userId: newClubAdmin.uid, clubId },
    );
    expect(membership.isClubMember).toBe(false);

    // Add to club only (no group ops for club-admin)
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: newClubAdmin.uid,
        roles: ["club-admin"],
        name: newClubAdmin.displayName,
        email: newClubAdmin.email,
        addedBy: admin.uid,
        photoURL: "",
        joinedAt: new Date().toISOString(),
        needsGuardian: false,
        guardiansContacts: [],
        lastModifiedAt: new Date().toISOString(),
      },
    });

    await callFunction("updateUserClubInfo", admin.idToken, {
      uid: newClubAdmin.uid,
      clubInfo: {
        clubId,
        clubName: "Test Club",
        role: "club-admin",
        joinedAt: new Date().toISOString(),
        lastModifiedAt: new Date().toISOString(),
      },
      role: "club-admin",
    });

    await callFunction("markInvitationUsed", admin.idToken, {
      invitationToken: token,
      userId: newClubAdmin.uid,
      status: "accepted",
    });

    // Assertions
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const clubMember = clubMembers!.members.find(
      (m: any) => m.userId === newClubAdmin.uid,
    );
    expect(clubMember).toBeDefined();
    expect(clubMember.roles).toContain("club-admin");

    const userDoc = await getDocument(`users/${newClubAdmin.uid}`);
    const clubEntry = userDoc!.clubAccess.find((c: any) => c.clubId === clubId);
    expect(clubEntry.role).toBe("club-admin");
    expect(clubEntry.groupAccess || []).toHaveLength(0);

    // Should NOT be in group
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const groupMember = (groupMembers?.members || []).find(
      (m: any) => m.userId === newClubAdmin.uid,
    );
    expect(groupMember).toBeUndefined();
  });

  // ─── TC-B5: Already in club, adding to NEW group ──────────

  it("TC-B5: should add existing club member to a second group without re-adding to club", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Create player and add to club + Group A
    const player = await createFullTestUser({
      email: "crossgroup@test.com",
      displayName: "Cross Group Player",
    });
    await addExistingMemberToClubAndGroup(
      admin,
      player,
      clubId,
      groupId,
      "Group A",
      "player",
    );

    // Create Group B
    const { groupId: groupBId } = await callFunction(
      "createGroup",
      admin.idToken,
      { clubId, groupData: { name: "Group B" } },
    );

    // Send invitation for Group B
    const sendResult = await callFunction(
      "sendGroupInvitation",
      admin.idToken,
      {
        emails: [player.email],
        clubId,
        clubName: "Test Club",
        groupId: groupBId,
        groupName: "Group B",
        inviterName: admin.displayName,
        role: "player",
      },
    );
    const token = sendResult.results[0].invitationToken;

    // Check membership — isClubMember: true, isGroupMember: false
    const membership = await callFunction("checkMembership", player.idToken, {
      userId: player.uid,
      clubId,
      groupId: groupBId,
    });
    expect(membership.isClubMember).toBe(true);
    expect(membership.isGroupMember).toBe(false);

    // Skip addMemberToClub — add to Group B only
    await callFunction("addMemberToGroup", admin.idToken, {
      clubId,
      groupId: groupBId,
      memberData: {
        userId: player.uid,
        roles: ["player"],
        name: player.displayName,
        email: player.email,
        needsGuardian: false,
        guardiansContacts: [],
        joinedAt: new Date().toISOString(),
        photoURL: "",
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
      updateClubMemberListRoles: true,
    });

    await callFunction("markInvitationUsed", admin.idToken, {
      invitationToken: token,
      userId: player.uid,
      status: "accepted",
    });

    // ── Assertions ──

    // Club allMembers — unchanged, still has player
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const clubMember = clubMembers!.members.find(
      (m: any) => m.userId === player.uid,
    );
    expect(clubMember).toBeDefined();
    expect(clubMember.roles).toContain("player");

    // Group B allMembers — contains player
    const groupBMembers = await getDocument(
      `clubs/${clubId}/groups/${groupBId}/allMembers/members`,
    );
    const groupBMember = groupBMembers!.members.find(
      (m: any) => m.userId === player.uid,
    );
    expect(groupBMember).toBeDefined();
    expect(groupBMember.roles).toContain("player");

    // User document — groupAccess has TWO entries
    const userDoc = await getDocument(`users/${player.uid}`);
    const clubEntry = userDoc!.clubAccess.find((c: any) => c.clubId === clubId);
    expect(clubEntry.groupAccess).toHaveLength(2);
    const groupIds = clubEntry.groupAccess.map((g: any) => g.groupId);
    expect(groupIds).toContain(groupId);
    expect(groupIds).toContain(groupBId);
  });

  // ─── TC-B6: Same group, different role (accumulation) ──────

  it("TC-B6: should accumulate roles when adding existing group member with new role", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Create player and add to club + Group A as player
    const player = await createFullTestUser({
      email: "accumulate@test.com",
      displayName: "Role Accumulator",
    });
    await addExistingMemberToClubAndGroup(
      admin,
      player,
      clubId,
      groupId,
      "Group A",
      "player",
    );

    // Send invitation for same group with "coach" role
    const sendResult = await callFunction(
      "sendGroupInvitation",
      admin.idToken,
      {
        emails: [player.email],
        clubId,
        clubName: "Test Club",
        groupId,
        groupName: "Group A",
        inviterName: admin.displayName,
        role: "coach",
      },
    );
    const token = sendResult.results[0].invitationToken;

    // Check membership — already in group with ["player"]
    const membership = await callFunction("checkMembership", player.idToken, {
      userId: player.uid,
      clubId,
      groupId,
    });
    expect(membership.isGroupMember).toBe(true);
    expect(membership.currentRoles).toContain("player");

    // Add coach role via updateMemberRole
    const roleResult = await callFunction("updateMemberRole", admin.idToken, {
      clubId,
      groupId,
      userId: player.uid,
      operation: "add",
      roleToAdd: "coach",
    });
    expect(roleResult.success).toBe(true);

    await callFunction("markInvitationUsed", admin.idToken, {
      invitationToken: token,
      userId: player.uid,
      status: "accepted",
    });

    // ── Assertions ──

    // Group allMembers — roles: ["player", "coach"]
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const groupMember = groupMembers!.members.find(
      (m: any) => m.userId === player.uid,
    );
    expect(groupMember.roles).toContain("player");
    expect(groupMember.roles).toContain("coach");

    // Club allMembers — roles contain both
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const clubMember = clubMembers!.members.find(
      (m: any) => m.userId === player.uid,
    );
    expect(clubMember.roles).toContain("player");
    expect(clubMember.roles).toContain("coach");

    // User document — groupAccess[0].roles has both
    const userDoc = await getDocument(`users/${player.uid}`);
    const clubEntry = userDoc!.clubAccess.find((c: any) => c.clubId === clubId);
    const groupEntry = clubEntry.groupAccess.find(
      (g: any) => g.groupId === groupId,
    );
    expect(groupEntry.roles).toContain("player");
    expect(groupEntry.roles).toContain("coach");
  });

  // ─── TC-B7: Club-admin upgrade (already in club as player) ─

  it("TC-B7: should upgrade existing player to club-admin via role accumulation", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Create player and add to club + Group A
    const player = await createFullTestUser({
      email: "upgrade@test.com",
      displayName: "Upgrade To Admin",
    });
    await addExistingMemberToClubAndGroup(
      admin,
      player,
      clubId,
      groupId,
      "Group A",
      "player",
    );

    // Send club-admin invitation
    const sendResult = await callFunction(
      "sendGroupInvitation",
      admin.idToken,
      {
        emails: [player.email],
        clubId,
        clubName: "Test Club",
        groupId,
        groupName: "Group A",
        inviterName: admin.displayName,
        role: "club-admin",
        invitationType: "club_admin",
      },
    );
    const token = sendResult.results[0].invitationToken;

    // Check membership — already in club
    const membership = await callFunction("checkMembership", player.idToken, {
      userId: player.uid,
      clubId,
    });
    expect(membership.isClubMember).toBe(true);

    // Add club-admin role at club level
    await callFunction("updateClubMemberRole", admin.idToken, {
      clubId,
      userId: player.uid,
      operation: "add",
      roleToAdd: "club-admin",
    });

    // Update user club info to reflect club-admin
    await callFunction("updateUserClubInfo", admin.idToken, {
      uid: player.uid,
      clubInfo: {
        clubId,
        clubName: "Test Club",
        role: "club-admin",
        joinedAt: new Date().toISOString(),
        lastModifiedAt: new Date().toISOString(),
      },
      role: "club-admin",
    });

    await callFunction("markInvitationUsed", admin.idToken, {
      invitationToken: token,
      userId: player.uid,
      status: "accepted",
    });

    // ── Assertions ──

    // Club allMembers — roles contain BOTH "player" AND "club-admin"
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const clubMember = clubMembers!.members.find(
      (m: any) => m.userId === player.uid,
    );
    expect(clubMember.roles).toContain("player");
    expect(clubMember.roles).toContain("club-admin");

    // User document — clubAccess[0].role === "club-admin" (upgraded)
    const userDoc = await getDocument(`users/${player.uid}`);
    const clubEntry = userDoc!.clubAccess.find((c: any) => c.clubId === clubId);
    expect(clubEntry.role).toBe("club-admin");
  });

  // ─── TC-B8: Existing Youth — adding to new group ──────────

  it("TC-B8: should add existing youth to a second group", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // ── Setup: Create youth in Group A (replays TC-A5 setup) ──

    // Create guardian
    const guardian = await createFullTestUser({
      email: "youthparent@test.com",
      displayName: "Youth Parent",
    });

    // Create youth doc
    const youthResult = await callFunction(
      "createYouthMemberDocument",
      guardian.idToken,
      {
        childName: "Youth B8",
        dateOfBirth: "2014-09-20",
        guardianUid: guardian.uid,
        guardianEmail: guardian.email,
        guardianName: guardian.displayName,
        relationship: "parent",
      },
    );
    const youthUid = youthResult.youthUid!;

    // Add youth to club
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: youthUid,
        roles: ["player-underage"],
        name: "Youth B8",
        addedBy: admin.uid,
        photoURL: "",
        joinedAt: new Date().toISOString(),
        needsGuardian: true,
        guardiansContacts: [
          { name: guardian.displayName, email: guardian.email, phone: "" },
        ],
        lastModifiedAt: new Date().toISOString(),
      },
    });

    // Add guardian to club
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: guardian.uid,
        roles: ["guardian"],
        name: guardian.displayName,
        email: guardian.email,
        addedBy: admin.uid,
        photoURL: "",
        joinedAt: new Date().toISOString(),
        needsGuardian: false,
        guardiansContacts: [],
        lastModifiedAt: new Date().toISOString(),
      },
    });

    // Update club info for guardian and youth
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

    // Add youth to Group A
    await callFunction("addMemberToGroup", admin.idToken, {
      clubId,
      groupId,
      memberData: {
        userId: youthUid,
        roles: ["player-underage"],
        name: "Youth B8",
        needsGuardian: true,
        guardiansContacts: [
          { name: guardian.displayName, email: guardian.email, phone: "" },
        ],
        joinedAt: new Date().toISOString(),
        photoURL: "",
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

    await callFunction("updateGuardianDependentAccess", guardian.idToken, {
      youthUid,
      guardianUid: guardian.uid,
    });

    // ── Now test: Add youth to Group B ──

    // Create Group B
    const { groupId: groupBId } = await callFunction(
      "createGroup",
      admin.idToken,
      { clubId, groupData: { name: "Group B" } },
    );

    // Send invitation for Group B
    const sendResult = await callFunction(
      "sendGroupInvitation",
      admin.idToken,
      {
        emails: [guardian.email],
        clubId,
        clubName: "Test Club",
        groupId: groupBId,
        groupName: "Group B",
        inviterName: admin.displayName,
        role: "player-underage",
        invitationType: "youth_member_existing",
        existingYouthData: { youthUid },
      },
    );
    const token = sendResult.results[0].invitationToken;

    // Check membership — youth in club but not in Group B
    const membership = await callFunction("checkMembership", guardian.idToken, {
      userId: youthUid,
      clubId,
      groupId: groupBId,
    });
    expect(membership.isClubMember).toBe(true);
    expect(membership.isGroupMember).toBe(false);

    // Add youth to Group B
    await callFunction("addMemberToGroup", admin.idToken, {
      clubId,
      groupId: groupBId,
      memberData: {
        userId: youthUid,
        roles: ["player-underage"],
        name: "Youth B8",
        needsGuardian: true,
        guardiansContacts: [
          { name: guardian.displayName, email: guardian.email, phone: "" },
        ],
        joinedAt: new Date().toISOString(),
        photoURL: "",
      },
    });

    // Update youth's group info
    await callFunction("updateUserGroupInfo", admin.idToken, {
      uid: youthUid,
      clubId,
      groupInfo: {
        groupId: groupBId,
        groupName: "Group B",
        joinedAt: new Date().toISOString(),
      },
      roles: ["player-underage"],
      operation: "add",
    });

    // Update guardian dependent access
    await callFunction("updateGuardianDependentAccess", guardian.idToken, {
      youthUid,
      guardianUid: guardian.uid,
    });

    await callFunction("markInvitationUsed", admin.idToken, {
      invitationToken: token,
      userId: guardian.uid,
      status: "accepted",
    });

    // ── Assertions ──

    // Group B allMembers — contains youth
    const groupBMembers = await getDocument(
      `clubs/${clubId}/groups/${groupBId}/allMembers/members`,
    );
    const groupBMember = groupBMembers!.members.find(
      (m: any) => m.userId === youthUid,
    );
    expect(groupBMember).toBeDefined();
    expect(groupBMember.roles).toContain("player-underage");

    // Youth user doc — groupAccess has BOTH Group A and Group B
    const youthDoc = await getDocument(`users/${youthUid}`);
    const clubEntry = youthDoc!.clubAccess.find(
      (c: any) => c.clubId === clubId,
    );
    expect(clubEntry.role).toBe("member"); // permission-level
    expect(clubEntry.groupAccess).toHaveLength(2);
    const groupIds = clubEntry.groupAccess.map((g: any) => g.groupId);
    expect(groupIds).toContain(groupId);
    expect(groupIds).toContain(groupBId);

    // Guardian dependents — clubAccess updated
    const guardianDoc = await getDocument(`users/${guardian.uid}`);
    const dependent = guardianDoc!.dependents.find(
      (d: any) => d.uid === youthUid,
    );
    expect(dependent).toBeDefined();
    expect(dependent.clubAccess).toBeDefined();
  });
});
