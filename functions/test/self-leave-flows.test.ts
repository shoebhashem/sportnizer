/**
 * Self-Leave Flows
 *
 * Tests the self-leave path in removeMemberFromGroup:
 *   - Player can leave a group by calling removeMemberFromGroup on themselves
 *   - Coach can self-leave
 *   - Admin can self-leave
 *   - Non-member / unauthenticated rejected
 *   - Self-leave without roleToRemove rejected
 *   - Player-underage cannot self-leave
 *
 * Also tests fee cleanup when a member is removed from a group.
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
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

interface TestUser {
  uid: string;
  idToken: string;
  email: string;
  displayName: string;
}

/**
 * Create club + group, seed admin user doc with proper permissions.
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
    { clubData: { name: "Test Club" } },
  );
  const clubId = clubResult.clubId;

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
    { clubId, groupData: { name: "Group A" } },
  );
  const groupId = groupResult.groupId;

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
 * Add a member to both club and group with the given roles.
 */
async function addMemberToClubAndGroup(
  adminUser: TestUser,
  email: string,
  clubId: string,
  groupId: string,
  roles: string[],
): Promise<TestUser> {
  const member = await createFullTestUser({ email });

  const clubRole = roles.includes("club-admin") ? "club-admin" : "member";

  await callFunction("addMemberToClub", adminUser.idToken, {
    clubId,
    memberData: {
      userId: member.uid,
      roles,
      name: member.email,
      email: member.email,
      addedBy: adminUser.uid,
      joinedAt: new Date().toISOString(),
    },
  });

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

  await callFunction("addMemberToGroup", adminUser.idToken, {
    clubId,
    groupId,
    memberData: {
      userId: member.uid,
      roles,
      name: member.email,
      email: member.email,
    },
  });

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

describe("Self-Leave Flows", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // -----------------------------------------------------------------
  // SL-1: Player self-leave succeeds
  // -----------------------------------------------------------------
  it("SL-1: should allow a player to self-leave a group", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const player = await addMemberToClubAndGroup(
      admin,
      `player_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    // Player calls removeMemberFromGroup on themselves
    const result = await callFunction("removeMemberFromGroup", player.idToken, {
      clubId,
      groupId,
      userId: player.uid,
      roleToRemove: "player",
    });

    expect(result.success).toBe(true);

    // Verify player is no longer active in group
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const inGroup = (groupMembers?.members || []).find(
      (m: any) => m.userId === player.uid && m.isActive !== false,
    );
    expect(inGroup).toBeUndefined();
  });

  // -----------------------------------------------------------------
  // SL-2: Coach self-leave succeeds
  // -----------------------------------------------------------------
  it("SL-2: should allow a coach to self-leave a group", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const coach = await addMemberToClubAndGroup(
      admin,
      `coach_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["coach"],
    );

    const result = await callFunction("removeMemberFromGroup", coach.idToken, {
      clubId,
      groupId,
      userId: coach.uid,
      roleToRemove: "coach",
    });

    expect(result.success).toBe(true);

    // Verify coach is no longer active in group
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const inGroup = (groupMembers?.members || []).find(
      (m: any) => m.userId === coach.uid && m.isActive !== false,
    );
    expect(inGroup).toBeUndefined();
  });

  // -----------------------------------------------------------------
  // SL-3: Group admin self-leave succeeds
  // -----------------------------------------------------------------
  it("SL-3: should allow a group admin to self-leave", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const groupAdmin = await addMemberToClubAndGroup(
      admin,
      `gadmin_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["admin"],
    );

    const result = await callFunction(
      "removeMemberFromGroup",
      groupAdmin.idToken,
      {
        clubId,
        groupId,
        userId: groupAdmin.uid,
        roleToRemove: "admin",
      },
    );

    expect(result.success).toBe(true);

    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const inGroup = (groupMembers?.members || []).find(
      (m: any) => m.userId === groupAdmin.uid && m.isActive !== false,
    );
    expect(inGroup).toBeUndefined();
  });

  // -----------------------------------------------------------------
  // SL-4: Self-leave without roleToRemove is rejected
  // -----------------------------------------------------------------
  it("SL-4: should reject self-leave without roleToRemove", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const player = await addMemberToClubAndGroup(
      admin,
      `player_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    await expectFunctionError(
      "removeMemberFromGroup",
      player.idToken,
      {
        clubId,
        groupId,
        userId: player.uid,
        // Missing roleToRemove
      },
      "invalid-argument",
    );
  });

  // -----------------------------------------------------------------
  // SL-5: Player-underage cannot self-leave
  // -----------------------------------------------------------------
  it("SL-5: should reject self-leave for player-underage role", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const youth = await addMemberToClubAndGroup(
      admin,
      `youth_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player-underage"],
    );

    await expectFunctionError(
      "removeMemberFromGroup",
      youth.idToken,
      {
        clubId,
        groupId,
        userId: youth.uid,
        roleToRemove: "player-underage",
      },
      "permission-denied",
    );
  });

  // -----------------------------------------------------------------
  // SL-6: Cannot self-leave with a role you don't have
  // -----------------------------------------------------------------
  it("SL-6: should reject self-leave for a role the user does not have", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const player = await addMemberToClubAndGroup(
      admin,
      `player_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    await expectFunctionError(
      "removeMemberFromGroup",
      player.idToken,
      {
        clubId,
        groupId,
        userId: player.uid,
        roleToRemove: "coach", // Player doesn't have coach role
      },
      "not-found",
    );
  });

  // -----------------------------------------------------------------
  // SL-7: Unauthenticated self-leave is rejected
  // -----------------------------------------------------------------
  it("SL-7: should reject unauthenticated self-leave", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const player = await addMemberToClubAndGroup(
      admin,
      `player_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    await expectFunctionError(
      "removeMemberFromGroup",
      "", // no auth token
      {
        clubId,
        groupId,
        userId: player.uid,
        roleToRemove: "player",
      },
      "unauthenticated",
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Fee Cleanup on Member Removal                                      */
/* ------------------------------------------------------------------ */

describe("Fee Cleanup on Member Removal", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // -----------------------------------------------------------------
  // FC-1: Member removal cleans up active membership fees
  // -----------------------------------------------------------------
  it("FC-1: should remove member from includedMembers and decrement totalExpected", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const player = await addMemberToClubAndGroup(
      admin,
      `feeplayer_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    // Seed an active membership fee that includes this player
    const db = getFirestore();
    const feeRef = db.collection("membershipFees").doc();
    await feeRef.set({
      clubId,
      groupId,
      title: "Monthly Fee",
      amount: 50000,
      currency: "sek",
      status: "active",
      includedMembers: [admin.uid, player.uid],
      totalExpected: 2,
      totalPaid: 0,
      createdAt: new Date(),
    });

    // Also seed paymentStatus on the group member
    const groupMembersRef = db.doc(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const groupMembersDoc = await groupMembersRef.get();
    const members = groupMembersDoc.data()?.members || [];
    const playerIdx = members.findIndex((m: any) => m.userId === player.uid);
    if (playerIdx >= 0) {
      members[playerIdx].paymentStatus = {
        [feeRef.id]: { status: "pending", amount: 50000 },
      };
      await groupMembersRef.update({ members });
    }

    // Remove the player from the group (admin removing player)
    await callFunction("removeMemberFromGroup", admin.idToken, {
      clubId,
      groupId,
      userId: player.uid,
    });

    // Verify fee document updated
    const feeDoc = await getDocument(`membershipFees/${feeRef.id}`);
    expect(feeDoc).toBeDefined();
    expect(feeDoc!.includedMembers).not.toContain(player.uid);
    expect(feeDoc!.includedMembers).toContain(admin.uid);
    expect(feeDoc!.totalExpected).toBe(1);
  });

  // -----------------------------------------------------------------
  // FC-2: Self-leave also triggers fee cleanup
  // -----------------------------------------------------------------
  it("FC-2: should clean up fees when player self-leaves", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const player = await addMemberToClubAndGroup(
      admin,
      `selfleave_fee_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    // Seed an active membership fee that includes this player
    const db = getFirestore();
    const feeRef = db.collection("membershipFees").doc();
    await feeRef.set({
      clubId,
      groupId,
      title: "Training Fee",
      amount: 30000,
      currency: "sek",
      status: "active",
      includedMembers: [player.uid],
      totalExpected: 1,
      totalPaid: 0,
      createdAt: new Date(),
    });

    // Self-leave
    await callFunction("removeMemberFromGroup", player.idToken, {
      clubId,
      groupId,
      userId: player.uid,
      roleToRemove: "player",
    });

    // Verify fee updated
    const feeDoc = await getDocument(`membershipFees/${feeRef.id}`);
    expect(feeDoc).toBeDefined();
    expect(feeDoc!.includedMembers).not.toContain(player.uid);
    expect(feeDoc!.totalExpected).toBe(0);
  });

  // -----------------------------------------------------------------
  // FC-3: Non-active fees are not affected
  // -----------------------------------------------------------------
  it("FC-3: should not modify non-active fees", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const player = await addMemberToClubAndGroup(
      admin,
      `closfee_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    // Seed a closed fee (should not be modified)
    const db = getFirestore();
    const feeRef = db.collection("membershipFees").doc();
    await feeRef.set({
      clubId,
      groupId,
      title: "Old Closed Fee",
      amount: 40000,
      currency: "sek",
      status: "closed",
      includedMembers: [player.uid],
      totalExpected: 1,
      totalPaid: 1,
      createdAt: new Date(),
    });

    // Remove the player
    await callFunction("removeMemberFromGroup", admin.idToken, {
      clubId,
      groupId,
      userId: player.uid,
    });

    // Closed fee should be untouched
    const feeDoc = await getDocument(`membershipFees/${feeRef.id}`);
    expect(feeDoc).toBeDefined();
    expect(feeDoc!.includedMembers).toContain(player.uid);
    expect(feeDoc!.totalExpected).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Dual-Role: Player/Coach + Guardian                                 */
/*                                                                     */
/*  Regression tests for the bug where a user who held both a         */
/*  player/coach role and a guardian role (via a dependent child)      */
/*  had their guardianOfGroups flat array wiped when they left/were    */
/*  removed as a player. After the fix, flatArrayFieldsFromClubAccess  */
/*  omits guardianOfGroups so the guardian access is never touched by  */
/*  the club-access rebuild path.                                      */
/* ------------------------------------------------------------------ */

describe("Dual-Role: Player/Coach + Guardian flat-array preservation", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ---------------------------------------------------------------
  // DR-1: Player who is also guardian self-leaves as player
  //       → guardianOfGroups retained, memberOfGroups cleared
  // ---------------------------------------------------------------
  it("DR-1: player+guardian self-leave keeps guardianOfGroups intact", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Create dual-role user and add them as player
    const guardian = await addMemberToClubAndGroup(
      admin,
      `dr1_guardian_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    // Simulate guardian relationship: set guardianOfGroups atomically
    // (as addGuardianToYouth would have done) and add a fake dependent entry
    const db = getFirestore();
    await db.doc(`users/${guardian.uid}`).update({
      guardianOfGroups: [groupId],
      dependents: [
        {
          uid: "fake-youth-uid",
          name: "Test Child",
          clubAccess: [
            {
              clubId,
              isActive: true,
              groupAccess: [{ groupId, roles: ["player-underage"] }],
            },
          ],
        },
      ],
    });

    // Self-leave as player
    const result = await callFunction(
      "removeMemberFromGroup",
      guardian.idToken,
      {
        clubId,
        groupId,
        userId: guardian.uid,
        roleToRemove: "player",
      },
    );
    expect(result.success).toBe(true);

    // guardianOfGroups must still contain groupId
    const userDoc = await getDocument(`users/${guardian.uid}`);
    expect(userDoc).toBeDefined();
    expect(userDoc!.guardianOfGroups).toContain(groupId);

    // memberOfGroups must no longer contain groupId
    expect(userDoc!.memberOfGroups ?? []).not.toContain(groupId);
  });

  // ---------------------------------------------------------------
  // DR-2: Admin removes player who is also guardian
  //       → same code path as self-leave inside the CF; guardianOfGroups retained
  // ---------------------------------------------------------------
  it("DR-2: admin-removal of player+guardian keeps guardianOfGroups intact", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await addMemberToClubAndGroup(
      admin,
      `dr2_guardian_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    const db = getFirestore();
    await db.doc(`users/${guardian.uid}`).update({
      guardianOfGroups: [groupId],
      dependents: [
        {
          uid: "fake-youth-uid-2",
          name: "Test Child 2",
          clubAccess: [
            {
              clubId,
              isActive: true,
              groupAccess: [{ groupId, roles: ["player-underage"] }],
            },
          ],
        },
      ],
    });

    // Admin removes the player
    const result = await callFunction("removeMemberFromGroup", admin.idToken, {
      clubId,
      groupId,
      userId: guardian.uid,
      roleToRemove: "player",
    });
    expect(result.success).toBe(true);

    const userDoc = await getDocument(`users/${guardian.uid}`);
    expect(userDoc!.guardianOfGroups).toContain(groupId);
    expect(userDoc!.memberOfGroups ?? []).not.toContain(groupId);
  });

  // ---------------------------------------------------------------
  // DR-3: Coach who is also guardian self-leaves as coach
  //       → guardianOfGroups retained
  // ---------------------------------------------------------------
  it("DR-3: coach+guardian self-leave keeps guardianOfGroups intact", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await addMemberToClubAndGroup(
      admin,
      `dr3_guardian_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["coach"],
    );

    const db = getFirestore();
    await db.doc(`users/${guardian.uid}`).update({
      guardianOfGroups: [groupId],
      dependents: [
        {
          uid: "fake-youth-uid-3",
          name: "Test Child 3",
          clubAccess: [
            {
              clubId,
              isActive: true,
              groupAccess: [{ groupId, roles: ["player-underage"] }],
            },
          ],
        },
      ],
    });

    const result = await callFunction(
      "removeMemberFromGroup",
      guardian.idToken,
      {
        clubId,
        groupId,
        userId: guardian.uid,
        roleToRemove: "coach",
      },
    );
    expect(result.success).toBe(true);

    const userDoc = await getDocument(`users/${guardian.uid}`);
    expect(userDoc!.guardianOfGroups).toContain(groupId);
    expect(userDoc!.memberOfGroups ?? []).not.toContain(groupId);
  });

  // ---------------------------------------------------------------
  // DR-4: Guardian is a member of two groups (via two dependents).
  //       Leaving one group as player must not wipe the other groupId
  //       from guardianOfGroups.
  // ---------------------------------------------------------------
  it("DR-4: leaving one group as player preserves guardianOfGroups entry for a different group", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Create a second group so we have two distinct groupIds
    const group2Result = await callFunction<{ groupId: string }>(
      "createGroup",
      admin.idToken,
      { clubId, groupData: { name: "Group B" } },
    );
    const groupId2 = group2Result.groupId;

    const guardian = await addMemberToClubAndGroup(
      admin,
      `dr4_guardian_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    const db = getFirestore();
    // Guardian is guardian in BOTH groups (two different children)
    await db.doc(`users/${guardian.uid}`).update({
      guardianOfGroups: [groupId, groupId2],
      dependents: [
        {
          uid: "fake-youth-uid-4a",
          name: "Child A",
          clubAccess: [
            {
              clubId,
              isActive: true,
              groupAccess: [{ groupId, roles: ["player-underage"] }],
            },
          ],
        },
        {
          uid: "fake-youth-uid-4b",
          name: "Child B",
          clubAccess: [
            {
              clubId,
              isActive: true,
              groupAccess: [{ groupId: groupId2, roles: ["player-underage"] }],
            },
          ],
        },
      ],
    });

    // Self-leave group 1 as player — should NOT disturb groupId2 in guardianOfGroups
    await callFunction("removeMemberFromGroup", guardian.idToken, {
      clubId,
      groupId,
      userId: guardian.uid,
      roleToRemove: "player",
    });

    const userDoc = await getDocument(`users/${guardian.uid}`);
    // Both guardian relationships must survive
    expect(userDoc!.guardianOfGroups).toContain(groupId); // still guardian via child
    expect(userDoc!.guardianOfGroups).toContain(groupId2); // second child unaffected
    expect(userDoc!.memberOfGroups ?? []).not.toContain(groupId); // player role gone
  });

  // ---------------------------------------------------------------
  // DR-5: updateMemberRole (player → coach promotion) for a user
  //       who is also a guardian must not wipe guardianOfGroups
  // ---------------------------------------------------------------
  it("DR-5: updateMemberRole (add coach role) for player+guardian keeps guardianOfGroups", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await addMemberToClubAndGroup(
      admin,
      `dr5_guardian_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    const db = getFirestore();
    await db.doc(`users/${guardian.uid}`).update({
      guardianOfGroups: [groupId],
      dependents: [
        {
          uid: "fake-youth-uid-5",
          name: "Test Child 5",
          clubAccess: [
            {
              clubId,
              isActive: true,
              groupAccess: [{ groupId, roles: ["player-underage"] }],
            },
          ],
        },
      ],
    });

    // Add coach role via updateMemberRole
    await callFunction("updateMemberRole", admin.idToken, {
      clubId,
      groupId,
      userId: guardian.uid,
      roleToAdd: "coach",
      operation: "add",
    });

    const userDoc = await getDocument(`users/${guardian.uid}`);
    expect(userDoc!.guardianOfGroups).toContain(groupId);
    // Both player and coach should now be in memberOfGroups
    expect(userDoc!.memberOfGroups).toContain(groupId);
    expect(userDoc!.coachOfGroups).toContain(groupId);
  });

  // ---------------------------------------------------------------
  // DR-6: updateMemberRole (remove player role) for a user who is
  //       also a guardian must not wipe guardianOfGroups
  // ---------------------------------------------------------------
  it("DR-6: updateMemberRole (remove player role) for player+guardian keeps guardianOfGroups", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await addMemberToClubAndGroup(
      admin,
      `dr6_guardian_${Date.now()}@test.com`,
      clubId,
      groupId,
      ["player"],
    );

    const db = getFirestore();
    await db.doc(`users/${guardian.uid}`).update({
      guardianOfGroups: [groupId],
      dependents: [
        {
          uid: "fake-youth-uid-6",
          name: "Test Child 6",
          clubAccess: [
            {
              clubId,
              isActive: true,
              groupAccess: [{ groupId, roles: ["player-underage"] }],
            },
          ],
        },
      ],
    });

    // Remove player role via updateMemberRole
    await callFunction("updateMemberRole", admin.idToken, {
      clubId,
      groupId,
      userId: guardian.uid,
      roleToRemove: "player",
      operation: "remove",
    });

    const userDoc = await getDocument(`users/${guardian.uid}`);
    expect(userDoc!.guardianOfGroups).toContain(groupId);
  });
});
