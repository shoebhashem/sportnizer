/**
 * Suite A: Add Member — New Users (No Clubnizer Account)
 *
 * Level 1 Backend E2E Integration Tests
 *
 * Replays the full invitation→signup→join flow by calling Cloud Functions
 * in the same order the app's orchestration service would call them.
 * After each flow completes, reads Firestore documents and asserts every
 * field was correctly written.
 *
 * Test cases: TC-A1 through TC-A6
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

  // Seed admin in club allMembers (required for permission checks)
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
 * Run the standard adult member add flow:
 * sendGroupInvitation → createFullTestUser → addMemberToClub → updateUserClubInfo
 * → addMemberToGroup → updateUserGroupInfo → markInvitationUsed
 *
 * Returns all IDs and the invitation token for assertions.
 */
async function addNewMemberFlow(
  admin: { uid: string; idToken: string; displayName: string; email: string },
  clubId: string,
  groupId: string,
  role: string,
  email: string,
  displayName: string,
) {
  // Step 1: Send invitation
  const sendResult = await callFunction("sendGroupInvitation", admin.idToken, {
    emails: [email],
    clubId,
    clubName: "Test Club",
    groupId,
    groupName: "Group A",
    inviterName: admin.displayName,
    role,
  });
  const token = sendResult.results[0].invitationToken;

  // Step 2: Create new user (simulates signup)
  const newUser = await createFullTestUser({ email, displayName });

  // Step 3: Add to club
  await callFunction("addMemberToClub", admin.idToken, {
    clubId,
    memberData: {
      userId: newUser.uid,
      roles: [role],
      name: newUser.displayName,
      email: newUser.email,
      addedBy: admin.uid,
      photoURL: "",
      joinedAt: new Date().toISOString(),
      needsGuardian: false,
      guardiansContacts: [],
      lastModifiedAt: new Date().toISOString(),
    },
  });

  // Step 4: Update user's club info
  await callFunction("updateUserClubInfo", admin.idToken, {
    uid: newUser.uid,
    clubInfo: {
      clubId,
      clubName: "Test Club",
      role,
      joinedAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    },
    role,
  });

  // Step 5: Add to group
  await callFunction("addMemberToGroup", admin.idToken, {
    clubId,
    groupId,
    memberData: {
      userId: newUser.uid,
      roles: [role],
      name: newUser.displayName,
      email: newUser.email,
      needsGuardian: false,
      guardiansContacts: [],
      joinedAt: new Date().toISOString(),
      photoURL: "",
    },
  });

  // Step 6: Update user's group info
  await callFunction("updateUserGroupInfo", admin.idToken, {
    uid: newUser.uid,
    clubId,
    groupInfo: {
      groupId,
      groupName: "Group A",
      joinedAt: new Date().toISOString(),
    },
    roles: [role],
    operation: "add",
  });

  // Step 7: Mark invitation used
  await callFunction("markInvitationUsed", admin.idToken, {
    invitationToken: token,
    userId: newUser.uid,
    status: "accepted",
  });

  return { newUser, token };
}

// ═══════════════════════════════════════════════════════════════

describe("Suite A: Add Member — New Users", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── TC-A1: New Player (adult) ─────────────────────────────

  it("TC-A1: should add a new player through the full invitation flow", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Step 1: Send invitation and verify pending invitation doc
    const sendResult = await callFunction(
      "sendGroupInvitation",
      admin.idToken,
      {
        emails: ["newplayer@test.com"],
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

    // Verify invitation doc is pending
    const invDoc = await getDocument(`invitations/${token}`);
    expect(invDoc).toBeDefined();
    expect(invDoc!.status).toBe("pending");
    expect(invDoc!.email).toBe("newplayer@test.com");
    expect(invDoc!.clubId).toBe(clubId);

    // Step 2: Create new user (simulates signup)
    const newUser = await createFullTestUser({
      email: "newplayer@test.com",
      displayName: "New Player",
    });

    // Step 3: Add to club
    const addClubResult = await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: newUser.uid,
        roles: ["player"],
        name: newUser.displayName,
        email: newUser.email,
        addedBy: admin.uid,
        photoURL: "",
        joinedAt: new Date().toISOString(),
        needsGuardian: false,
        guardiansContacts: [],
        lastModifiedAt: new Date().toISOString(),
      },
    });
    expect(addClubResult.success).toBe(true);

    // Step 4: Update user's club info
    await callFunction("updateUserClubInfo", admin.idToken, {
      uid: newUser.uid,
      clubInfo: {
        clubId,
        clubName: "Test Club",
        role: "player",
        joinedAt: new Date().toISOString(),
        lastModifiedAt: new Date().toISOString(),
      },
      role: "player",
    });

    // Step 5: Add to group
    const addGroupResult = await callFunction(
      "addMemberToGroup",
      admin.idToken,
      {
        clubId,
        groupId,
        memberData: {
          userId: newUser.uid,
          roles: ["player"],
          name: newUser.displayName,
          email: newUser.email,
          needsGuardian: false,
          guardiansContacts: [],
          joinedAt: new Date().toISOString(),
          photoURL: "",
        },
      },
    );
    expect(addGroupResult.success).toBe(true);

    // Step 6: Update user's group info
    await callFunction("updateUserGroupInfo", admin.idToken, {
      uid: newUser.uid,
      clubId,
      groupInfo: {
        groupId,
        groupName: "Group A",
        joinedAt: new Date().toISOString(),
      },
      roles: ["player"],
      operation: "add",
    });

    // Step 7: Mark invitation used (deletes the doc)
    await callFunction("markInvitationUsed", admin.idToken, {
      invitationToken: token,
      userId: newUser.uid,
      status: "accepted",
    });

    // ── Assertions ──

    // Club allMembers
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const clubMember = clubMembers!.members.find(
      (m: any) => m.userId === newUser.uid,
    );
    expect(clubMember).toBeDefined();
    expect(clubMember.roles).toContain("player");
    expect(clubMember.name).toBe("New Player");
    expect(clubMember.isActive).toBe(true);

    // Group allMembers
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const groupMember = groupMembers!.members.find(
      (m: any) => m.userId === newUser.uid,
    );
    expect(groupMember).toBeDefined();
    expect(groupMember.roles).toContain("player");
    expect(groupMember.isActive).toBe(true);

    // User document — clubAccess
    const userDoc = await getDocument(`users/${newUser.uid}`);
    expect(userDoc).toBeDefined();
    const clubEntry = userDoc!.clubAccess.find((c: any) => c.clubId === clubId);
    expect(clubEntry).toBeDefined();
    expect(clubEntry.role).toBe("member"); // NOT "player" — permission-level
    expect(clubEntry.isActive).toBe(true);

    // User document — groupAccess
    const groupEntry = clubEntry.groupAccess.find(
      (g: any) => g.groupId === groupId,
    );
    expect(groupEntry).toBeDefined();
    expect(groupEntry.roles).toContain("player");

    // Invitation deleted
    const deletedInv = await getDocument(`invitations/${token}`);
    expect(deletedInv).toBeUndefined();
  });

  // ─── TC-A2: New Coach ──────────────────────────────────────

  it("TC-A2: should add a new coach through the full invitation flow", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const { newUser } = await addNewMemberFlow(
      admin,
      clubId,
      groupId,
      "coach",
      "newcoach@test.com",
      "New Coach",
    );

    // Club allMembers — roles: ["coach"]
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const clubMember = clubMembers!.members.find(
      (m: any) => m.userId === newUser.uid,
    );
    expect(clubMember).toBeDefined();
    expect(clubMember.roles).toContain("coach");

    // Group allMembers — roles: ["coach"]
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const groupMember = groupMembers!.members.find(
      (m: any) => m.userId === newUser.uid,
    );
    expect(groupMember).toBeDefined();
    expect(groupMember.roles).toContain("coach");

    // User document — clubAccess[0].role === "member"
    const userDoc = await getDocument(`users/${newUser.uid}`);
    const clubEntry = userDoc!.clubAccess.find((c: any) => c.clubId === clubId);
    expect(clubEntry.role).toBe("member");
    expect(clubEntry.groupAccess[0].roles).toContain("coach");
  });

  // ─── TC-A3: New Admin (group admin) ────────────────────────

  it("TC-A3: should add a new group admin through the full invitation flow", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();
    const { newUser } = await addNewMemberFlow(
      admin,
      clubId,
      groupId,
      "admin",
      "newadmin@test.com",
      "New Admin",
    );

    // Club allMembers — roles: ["admin"]
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const clubMember = clubMembers!.members.find(
      (m: any) => m.userId === newUser.uid,
    );
    expect(clubMember).toBeDefined();
    expect(clubMember.roles).toContain("admin");

    // Group allMembers — roles: ["admin"]
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const groupMember = groupMembers!.members.find(
      (m: any) => m.userId === newUser.uid,
    );
    expect(groupMember).toBeDefined();
    expect(groupMember.roles).toContain("admin");

    // User document — clubAccess[0].role === "member"
    const userDoc = await getDocument(`users/${newUser.uid}`);
    const clubEntry = userDoc!.clubAccess.find((c: any) => c.clubId === clubId);
    expect(clubEntry.role).toBe("member");
    expect(clubEntry.groupAccess[0].roles).toContain("admin");
  });

  // ─── TC-A4: New Club Admin ─────────────────────────────────

  it("TC-A4: should add a new club admin (club-level only, no group)", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Step 1: Send club-admin invitation
    const sendResult = await callFunction(
      "sendGroupInvitation",
      admin.idToken,
      {
        emails: ["newclubadmin@test.com"],
        clubId,
        clubName: "Test Club",
        groupId,
        groupName: "Group A",
        inviterName: admin.displayName,
        role: "club-admin",
        invitationType: "club_admin",
      },
    );
    expect(sendResult.success).toBe(true);
    const token = sendResult.results[0].invitationToken;

    // Step 2: Create new user
    const newUser = await createFullTestUser({
      email: "newclubadmin@test.com",
      displayName: "New Club Admin",
    });

    // Step 3: Add to club (club-admin role)
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: newUser.uid,
        roles: ["club-admin"],
        name: newUser.displayName,
        email: newUser.email,
        addedBy: admin.uid,
        photoURL: "",
        joinedAt: new Date().toISOString(),
        needsGuardian: false,
        guardiansContacts: [],
        lastModifiedAt: new Date().toISOString(),
      },
    });

    // Step 4: Update user's club info
    await callFunction("updateUserClubInfo", admin.idToken, {
      uid: newUser.uid,
      clubInfo: {
        clubId,
        clubName: "Test Club",
        role: "club-admin",
        joinedAt: new Date().toISOString(),
        lastModifiedAt: new Date().toISOString(),
      },
      role: "club-admin",
    });

    // Step 5: Mark invitation used
    await callFunction("markInvitationUsed", admin.idToken, {
      invitationToken: token,
      userId: newUser.uid,
      status: "accepted",
    });

    // ── Assertions ──

    // Club allMembers — roles: ["club-admin"]
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const clubMember = clubMembers!.members.find(
      (m: any) => m.userId === newUser.uid,
    );
    expect(clubMember).toBeDefined();
    expect(clubMember.roles).toContain("club-admin");

    // Group allMembers — should NOT contain club-admin
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const groupMember = (groupMembers?.members || []).find(
      (m: any) => m.userId === newUser.uid,
    );
    expect(groupMember).toBeUndefined();

    // User document — clubAccess[0].role === "club-admin"
    const userDoc = await getDocument(`users/${newUser.uid}`);
    const clubEntry = userDoc!.clubAccess.find((c: any) => c.clubId === clubId);
    expect(clubEntry).toBeDefined();
    expect(clubEntry.role).toBe("club-admin");

    // groupAccess should be empty or undefined
    expect(clubEntry.groupAccess || []).toHaveLength(0);
  });

  // ─── TC-A5: New Youth (player-underage) with guardian ──────

  it("TC-A5: should add a new youth member with guardian through full flow", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Step 1: Create guardian user
    const guardian = await createFullTestUser({
      email: "parent@test.com",
      displayName: "Parent Guardian",
    });

    // Step 2: Send youth invitation
    const sendResult = await callFunction(
      "sendGroupInvitation",
      admin.idToken,
      {
        emails: [guardian.email],
        clubId,
        clubName: "Test Club",
        groupId,
        groupName: "Group A",
        inviterName: admin.displayName,
        role: "player-underage",
        invitationType: "youth_member",
        youthData: {
          childName: "Young Player",
          dateOfBirth: "2015-06-15",
          relationship: "parent",
        },
      },
    );
    expect(sendResult.success).toBe(true);
    const token = sendResult.results[0].invitationToken;

    // Step 3: Create youth member document (called by guardian)
    const youthResult = await callFunction(
      "createYouthMemberDocument",
      guardian.idToken,
      {
        childName: "Young Player",
        dateOfBirth: "2015-06-15",
        guardianUid: guardian.uid,
        guardianEmail: guardian.email,
        guardianName: guardian.displayName,
        relationship: "parent",
      },
    );
    expect(youthResult.success).toBe(true);
    const youthUid = youthResult.youthUid;
    expect(youthUid).toBeDefined();

    // Step 4: Add youth to club
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: youthUid,
        roles: ["player-underage"],
        name: "Young Player",
        addedBy: admin.uid,
        photoURL: "",
        joinedAt: new Date().toISOString(),
        needsGuardian: true,
        guardiansContacts: [
          {
            name: guardian.displayName,
            email: guardian.email,
            phone: "",
          },
        ],
        lastModifiedAt: new Date().toISOString(),
      },
    });

    // Step 5: Add guardian to club
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

    // Step 6: Update guardian's club info
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

    // Step 7: Update youth's club info
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

    // Step 8: Add youth to group
    await callFunction("addMemberToGroup", admin.idToken, {
      clubId,
      groupId,
      memberData: {
        userId: youthUid,
        roles: ["player-underage"],
        name: "Young Player",
        needsGuardian: true,
        guardiansContacts: [
          {
            name: guardian.displayName,
            email: guardian.email,
            phone: "",
          },
        ],
        joinedAt: new Date().toISOString(),
        photoURL: "",
      },
    });

    // Step 9: Update youth's group info
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

    // Step 10: Update guardian dependent access
    await callFunction("updateGuardianDependentAccess", guardian.idToken, {
      youthUid,
      guardianUid: guardian.uid,
    });

    // Step 11: Mark invitation used
    await callFunction("markInvitationUsed", admin.idToken, {
      invitationToken: token,
      userId: guardian.uid,
      status: "accepted",
    });

    // ── Assertions ──

    // Youth user document
    const youthDoc = await getDocument(`users/${youthUid}`);
    expect(youthDoc).toBeDefined();
    expect(youthDoc!.isYouth).toBe(true);
    expect(youthDoc!.guardians).toBeDefined();
    expect(youthDoc!.guardians.length).toBeGreaterThanOrEqual(1);

    // Youth clubAccess
    const youthClubEntry = youthDoc!.clubAccess.find(
      (c: any) => c.clubId === clubId,
    );
    expect(youthClubEntry).toBeDefined();
    expect(youthClubEntry.role).toBe("member"); // permission-level, NOT "player-underage"

    // Youth groupAccess
    const youthGroupEntry = youthClubEntry.groupAccess.find(
      (g: any) => g.groupId === groupId,
    );
    expect(youthGroupEntry).toBeDefined();
    expect(youthGroupEntry.roles).toContain("player-underage");

    // Guardian user document — dependents
    const guardianDoc = await getDocument(`users/${guardian.uid}`);
    expect(guardianDoc).toBeDefined();
    const dependent = guardianDoc!.dependents.find(
      (d: any) => d.uid === youthUid,
    );
    expect(dependent).toBeDefined();
    expect(dependent.childName).toBe("Young Player");

    // Guardian clubAccess — role: "member" (NOT "guardian" — permission-level)
    const guardianClubEntry = guardianDoc!.clubAccess.find(
      (c: any) => c.clubId === clubId,
    );
    expect(guardianClubEntry).toBeDefined();
    expect(guardianClubEntry.role).toBe("member");

    // Club allMembers — contains BOTH youth and guardian
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const youthClubMember = clubMembers!.members.find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthClubMember).toBeDefined();
    expect(youthClubMember.roles).toContain("player-underage");

    const guardianClubMember = clubMembers!.members.find(
      (m: any) => m.userId === guardian.uid,
    );
    expect(guardianClubMember).toBeDefined();
    expect(guardianClubMember.roles).toContain("guardian");

    // Group allMembers — contains youth, NOT guardian
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const youthGroupMember = groupMembers!.members.find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthGroupMember).toBeDefined();
    expect(youthGroupMember.roles).toContain("player-underage");

    const guardianGroupMember = (groupMembers?.members || []).find(
      (m: any) => m.userId === guardian.uid,
    );
    expect(guardianGroupMember).toBeUndefined();
  });

  // ─── TC-A6: New Youth — deduplication check ────────────────

  it("TC-A6: should return existing youth UID when same name+DOB is created twice", async () => {
    await setupClubAndGroup();

    // Create guardian
    const guardian = await createFullTestUser({
      email: "dedup-parent@test.com",
      displayName: "Dedup Parent",
    });

    // First call — creates youth doc
    const result1 = await callFunction(
      "createYouthMemberDocument",
      guardian.idToken,
      {
        childName: "Anna",
        dateOfBirth: "2012-03-15",
        guardianUid: guardian.uid,
        guardianEmail: guardian.email,
        guardianName: guardian.displayName,
        relationship: "parent",
      },
    );
    expect(result1.success).toBe(true);
    const youthUid1 = result1.youthUid;

    // Second call — same name + DOB → should return existing UID
    const result2 = await callFunction(
      "createYouthMemberDocument",
      guardian.idToken,
      {
        childName: "Anna",
        dateOfBirth: "2012-03-15",
        guardianUid: guardian.uid,
        guardianEmail: guardian.email,
        guardianName: guardian.displayName,
        relationship: "parent",
      },
    );
    expect(result2.success).toBe(true);
    const youthUid2 = result2.youthUid;

    // Both should return the SAME UID
    expect(youthUid1).toBe(youthUid2);

    // Guardian should have exactly ONE dependent entry for "Anna"
    const guardianDoc = await getDocument(`users/${guardian.uid}`);
    const annaEntries = (guardianDoc!.dependents || []).filter(
      (d: any) => d.childName === "Anna" && d.dateOfBirth === "2012-03-15",
    );
    expect(annaEntries).toHaveLength(1);
  });
});
