/**
 * Member Roles & Membership Fee Integration Tests
 *
 * Tests: addMemberToClub, addMemberToGroup, removeMemberFromClub,
 *        removeMemberFromGroup, updateMemberRole, updateClubMemberRole,
 *        createMembershipFee, getMembershipFees
 * Runs against Firebase Emulators.
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

// ─── Shared Setup ────────────────────────────────────────────

async function setupClubAndGroup() {
  const admin = await createFullTestUser({ displayName: "Club Admin" });

  const { clubId } = await callFunction("createClub", admin.idToken, {
    clubData: { name: `Fee Club ${Date.now()}` },
  });

  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Fee Club",
        role: "club-admin",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [],
      },
    ],
  });

  const { groupId } = await callFunction("createGroup", admin.idToken, {
    clubId,
    groupData: { name: "Fee Team" },
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

describe("Member Management & Roles", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── addMemberToClub ────────────────────────────────────────

  describe("addMemberToClub", () => {
    it("should add a new member to a club", async () => {
      const { admin, clubId } = await setupClubAndGroup();
      const player = await createFullTestUser({
        email: "newplayer@test.com",
        displayName: "New Player",
      });

      const result = await callFunction("addMemberToClub", admin.idToken, {
        clubId,
        memberData: {
          userId: player.uid,
          roles: ["player"],
          name: player.displayName,
          email: player.email,
          addedBy: admin.uid,
          photoURL: "",
          joinedAt: new Date().toISOString(),
          needsGuardian: false,
          guardiansContacts: [],
          lastModifiedAt: new Date().toISOString(),
        },
      });

      expect(result.success).toBe(true);

      // Verify member appears in allMembers doc
      const membersDoc = await getDocument(
        `clubs/${clubId}/allMembers/members`,
      );
      const members = membersDoc!.members || [];
      const newMember = members.find((m: any) => m.userId === player.uid);
      expect(newMember).toBeDefined();
      expect(newMember.roles).toContain("player");
    });

    it("should add a youth member without email (needsGuardian)", async () => {
      const { admin, clubId } = await setupClubAndGroup();
      const youth = await createFullTestUser({
        email: "youth@test.com",
        displayName: "Youth Player",
      });

      const result = await callFunction("addMemberToClub", admin.idToken, {
        clubId,
        memberData: {
          userId: youth.uid,
          roles: ["player-underage"],
          name: "Youth Player",
          addedBy: admin.uid,
          photoURL: "",
          joinedAt: new Date().toISOString(),
          needsGuardian: true,
          guardiansContacts: [
            { name: "Parent", email: "parent@test.com", phone: "123456" },
          ],
          lastModifiedAt: new Date().toISOString(),
        },
      });

      expect(result.success).toBe(true);
    });
  });

  // ─── addMemberToGroup ───────────────────────────────────────

  describe("addMemberToGroup", () => {
    it("should add a player to a group (club admin)", async () => {
      const { admin, clubId, groupId } = await setupClubAndGroup();
      const player = await createFullTestUser({
        email: "groupplayer@test.com",
        displayName: "Group Player",
      });

      const result = await callFunction("addMemberToGroup", admin.idToken, {
        clubId,
        groupId,
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

      expect(result.success).toBe(true);

      // Verify member in group allMembers
      const membersDoc = await getDocument(
        `clubs/${clubId}/groups/${groupId}/allMembers/members`,
      );
      const members = membersDoc!.members || [];
      expect(members.some((m: any) => m.userId === player.uid)).toBe(true);
    });
  });

  // ─── removeMemberFromClub ───────────────────────────────────

  describe("removeMemberFromClub", () => {
    it("should remove a member from a club", async () => {
      const { admin, clubId } = await setupClubAndGroup();
      const player = await createFullTestUser({
        email: "removeme@test.com",
        displayName: "Remove Me",
      });

      // Add player first
      await callFunction("addMemberToClub", admin.idToken, {
        clubId,
        memberData: {
          userId: player.uid,
          roles: ["player"],
          name: player.displayName,
          email: player.email,
          addedBy: admin.uid,
          photoURL: "",
          joinedAt: new Date().toISOString(),
          needsGuardian: false,
          guardiansContacts: [],
          lastModifiedAt: new Date().toISOString(),
        },
      });

      // Remove
      const result = await callFunction("removeMemberFromClub", admin.idToken, {
        clubId,
        userId: player.uid,
      });

      expect(result.success).toBe(true);

      // Verify removal
      const membersDoc = await getDocument(
        `clubs/${clubId}/allMembers/members`,
      );
      const members = membersDoc!.members || [];
      expect(members.some((m: any) => m.userId === player.uid)).toBe(false);
    });

    it("should return error for non-member", async () => {
      const { admin, clubId } = await setupClubAndGroup();

      const result = await callFunction("removeMemberFromClub", admin.idToken, {
        clubId,
        userId: "nonexistent-user",
      });

      expect(result.success).toBe(false);
    });
  });

  // ─── updateMemberRole ───────────────────────────────────────

  describe("updateMemberRole", () => {
    it("should add a coach role to a group member", async () => {
      const { admin, clubId, groupId } = await setupClubAndGroup();
      const player = await createFullTestUser({
        email: "promotable@test.com",
        displayName: "Promotable Player",
      });

      // Seed player in group members
      const db = getFirestore();
      await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set({
        members: [
          {
            userId: player.uid,
            name: player.displayName,
            email: player.email,
            roles: ["player"],
            isActive: true,
          },
        ],
        memberCount: 1,
      });

      // Seed player in club members
      const clubMembersRef = db.doc(`clubs/${clubId}/allMembers/members`);
      const clubMembersDoc = await clubMembersRef.get();
      const existingMembers = clubMembersDoc.data()?.members || [];
      await clubMembersRef.update({
        members: [
          ...existingMembers,
          {
            userId: player.uid,
            name: player.displayName,
            email: player.email,
            roles: ["player"],
            isActive: true,
          },
        ],
      });

      // Seed player user doc with clubAccess
      await seedUserDocument(player.uid, {
        fullName: player.displayName,
        email: player.email,
        clubAccess: [
          {
            clubId,
            clubName: "Fee Club",
            role: "member",
            isActive: true,
            groupAccess: [
              {
                groupId,
                groupName: "Fee Team",
                roles: ["player"],
                isActive: true,
              },
            ],
          },
        ],
      });

      // Add coach role
      const result = await callFunction("updateMemberRole", admin.idToken, {
        clubId,
        groupId,
        userId: player.uid,
        operation: "add",
        roleToAdd: "coach",
      });

      expect(result.success).toBe(true);
      expect(result.updatedRoles).toContain("coach");
      expect(result.updatedRoles).toContain("player");
    });

    it("should remove a role from a group member", async () => {
      const { admin, clubId, groupId } = await setupClubAndGroup();
      const member = await createFullTestUser({
        email: "demotable@test.com",
        displayName: "Demotable",
      });

      // Seed member with both player and coach roles
      const db = getFirestore();
      await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set({
        members: [
          {
            userId: member.uid,
            name: member.displayName,
            email: member.email,
            roles: ["player", "coach"],
            isActive: true,
          },
        ],
        memberCount: 1,
      });

      const clubMembersRef = db.doc(`clubs/${clubId}/allMembers/members`);
      const clubMembersDoc = await clubMembersRef.get();
      const existingMembers = clubMembersDoc.data()?.members || [];
      await clubMembersRef.update({
        members: [
          ...existingMembers,
          {
            userId: member.uid,
            name: member.displayName,
            email: member.email,
            roles: ["player", "coach"],
            isActive: true,
          },
        ],
      });

      await seedUserDocument(member.uid, {
        fullName: member.displayName,
        email: member.email,
        clubAccess: [
          {
            clubId,
            clubName: "Fee Club",
            role: "member",
            isActive: true,
            groupAccess: [
              {
                groupId,
                groupName: "Fee Team",
                roles: ["player", "coach"],
                isActive: true,
              },
            ],
          },
        ],
      });

      // Remove coach role
      const result = await callFunction("updateMemberRole", admin.idToken, {
        clubId,
        groupId,
        userId: member.uid,
        operation: "remove",
        roleToRemove: "coach",
      });

      expect(result.success).toBe(true);
      expect(result.updatedRoles).toContain("player");
      expect(result.updatedRoles).not.toContain("coach");
    });

    it("should reject non-manageable roles (club-admin)", async () => {
      const { admin, clubId, groupId } = await setupClubAndGroup();

      await expectFunctionError(
        "updateMemberRole",
        admin.idToken,
        {
          clubId,
          groupId,
          userId: admin.uid,
          operation: "add",
          roleToAdd: "club-admin",
        },
        "invalid-argument",
      );
    });
  });

  // ─── updateClubMemberRole ──────────────────────────────────

  describe("updateClubMemberRole", () => {
    it("should add a role at club level", async () => {
      const { admin, clubId } = await setupClubAndGroup();
      const member = await createFullTestUser({
        email: "clubrole@test.com",
        displayName: "Club Role User",
      });

      // Seed member in club
      const db = getFirestore();
      const clubMembersRef = db.doc(`clubs/${clubId}/allMembers/members`);
      const clubMembersDoc = await clubMembersRef.get();
      const existingMembers = clubMembersDoc.data()?.members || [];
      await clubMembersRef.update({
        members: [
          ...existingMembers,
          {
            userId: member.uid,
            name: member.displayName,
            email: member.email,
            roles: ["player"],
            isActive: true,
          },
        ],
      });

      const result = await callFunction("updateClubMemberRole", admin.idToken, {
        clubId,
        userId: member.uid,
        operation: "add",
        roleToAdd: "coach",
      });

      expect(result.success).toBe(true);
      expect(result.updatedRoles).toContain("coach");
      expect(result.updatedRoles).toContain("player");
    });

    it("should remove a role at club level", async () => {
      const { admin, clubId } = await setupClubAndGroup();
      const member = await createFullTestUser({
        email: "removerole@test.com",
      });

      const db = getFirestore();
      const clubMembersRef = db.doc(`clubs/${clubId}/allMembers/members`);
      const clubMembersDoc = await clubMembersRef.get();
      const existingMembers = clubMembersDoc.data()?.members || [];
      await clubMembersRef.update({
        members: [
          ...existingMembers,
          {
            userId: member.uid,
            name: member.displayName,
            email: member.email,
            roles: ["player", "coach"],
            isActive: true,
          },
        ],
      });

      const result = await callFunction("updateClubMemberRole", admin.idToken, {
        clubId,
        userId: member.uid,
        operation: "remove",
        roleToRemove: "coach",
      });

      expect(result.success).toBe(true);
      expect(result.updatedRoles).not.toContain("coach");
    });
  });
});

// ─── Membership Fees ─────────────────────────────────────────

describe("Membership Fees", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("should create a membership fee and assign to targeted members", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Create a player and add to group
    const player = await createFullTestUser({
      email: "feepayer@test.com",
      displayName: "Fee Payer",
    });

    // Seed player in group members
    const db = getFirestore();
    await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set({
      members: [
        {
          userId: player.uid,
          name: player.displayName,
          email: player.email,
          roles: ["player"],
          isActive: true,
          needsGuardian: false,
        },
      ],
      memberCount: 1,
    });

    // Ensure club has Stripe connect (required for fee creation)
    await db.doc(`clubs/${clubId}`).update({
      stripeAccountId: "acct_test123",
      stripeAccountStatus: "active",
      stripe: { chargesEnabled: true, accountId: "acct_test123" },
    });

    // Seed group doc with name (needed for fee creation)
    await db.doc(`clubs/${clubId}/groups/${groupId}`).update({
      name: "Fee Team",
      clubId,
    });

    const result = await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Monthly Fee",
      description: "January 2026",
      amount: 50000, // 500.00 SEK in smallest unit
      currency: "sek",
      targetRoles: ["player"],
    });

    expect(result.success).toBe(true);
    expect(result.feeId).toBeDefined();
    expect(result.includedMembersCount).toBeGreaterThanOrEqual(1);

    // Verify fee document was created
    const fee = await getDocument(`membershipFees/${result.feeId}`);
    expect(fee).toBeDefined();
    expect(fee!.title).toBe("Monthly Fee");
    expect(fee!.amount).toBe(50000);
    expect(fee!.currency).toBe("sek");
  });

  it("should reject fee creation from non-admin", async () => {
    const { clubId, groupId } = await setupClubAndGroup();
    const player = await createFullTestUser({ email: "player@test.com" });

    await expectFunctionError(
      "createMembershipFee",
      player.idToken,
      {
        clubId,
        groupId,
        title: "Unauthorized Fee",
        amount: 10000,
        currency: "sek",
        targetRoles: ["player"],
      },
      "permission-denied",
    );
  });

  it("should reject invalid currency", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    await expectFunctionError(
      "createMembershipFee",
      admin.idToken,
      {
        clubId,
        groupId,
        title: "Bad Currency Fee",
        amount: 10000,
        currency: "xyz",
        targetRoles: ["player"],
      },
      "invalid-argument",
    );
  });

  it("should list membership fees for a club", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Seed group and Stripe setup
    const db = getFirestore();
    await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set({
      members: [
        {
          userId: admin.uid,
          name: "Admin",
          email: admin.email,
          roles: ["player"],
          isActive: true,
          needsGuardian: false,
        },
      ],
      memberCount: 1,
    });
    await db.doc(`clubs/${clubId}`).update({
      stripeAccountId: "acct_test123",
      stripeAccountStatus: "active",
      stripe: { chargesEnabled: true, accountId: "acct_test123" },
    });
    await db.doc(`clubs/${clubId}/groups/${groupId}`).update({
      name: "Fee Team",
      clubId,
    });

    // Create a fee
    await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Listable Fee",
      amount: 30000,
      currency: "sek",
      targetRoles: ["player"],
    });

    // List fees
    const result = await callFunction("getMembershipFees", admin.idToken, {
      clubId,
    });

    expect(result.success).toBe(true);
    expect(result.fees).toBeDefined();
    expect(result.fees.length).toBeGreaterThanOrEqual(1);
    expect(result.fees[0].title).toBe("Listable Fee");
  });
});
