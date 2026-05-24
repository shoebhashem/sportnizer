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
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "membership_fee", amount: 50000 }],
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
        currency: "sek",
        targetRoles: ["player"],
        components: [{ category: "membership_fee", amount: 10000 }],
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
        currency: "xyz",
        targetRoles: ["player"],
        components: [{ category: "membership_fee", amount: 10000 }],
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
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "membership_fee", amount: 30000 }],
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

// ─── updateFeeMembers ─────────────────────────────────────────

describe("updateFeeMembers", () => {
  beforeEach(async () => {
    await clearAll();
  });

  /** Helper: create a club, group, two players, and an active fee. */
  async function setupFeeWithMembers() {
    const admin = await createFullTestUser({ displayName: "Admin" });

    const { clubId } = await callFunction("createClub", admin.idToken, {
      clubData: { name: `FeeUpdate Club ${Date.now()}` },
    });

    await seedUserDocument(admin.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "FeeUpdate Club",
          role: "club-admin",
          joinedAt: new Date(),
          isActive: true,
          groupAccess: [],
        },
      ],
    });

    const { groupId } = await callFunction("createGroup", admin.idToken, {
      clubId,
      groupData: { name: "Update Team" },
    });

    const player1 = await createFullTestUser({ displayName: "Player One" });
    const player2 = await createFullTestUser({ displayName: "Player Two" });

    const db = getFirestore();
    // Seed both players in group allMembers
    await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set({
      members: [
        {
          userId: player1.uid,
          name: "Player One",
          roles: ["player"],
          isActive: true,
          needsGuardian: false,
        },
        {
          userId: player2.uid,
          name: "Player Two",
          roles: ["player"],
          isActive: true,
          needsGuardian: false,
        },
      ],
      memberCount: 2,
    });

    // Seed Stripe info needed by createMembershipFee
    await db.doc(`clubs/${clubId}`).update({
      stripeAccountId: "acct_test123",
      stripeAccountStatus: "active",
      stripe: { chargesEnabled: true, accountId: "acct_test123" },
    });
    await db
      .doc(`clubs/${clubId}/groups/${groupId}`)
      .update({ name: "Update Team", clubId });

    // Create fee targeting ONLY player1 via specificMemberIds
    await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Update Fee",
      currency: "sek",
      targetRoles: [],
      specificMemberIds: [player1.uid],
      components: [{ category: "membership_fee", amount: 10000 }],
    });

    // Retrieve the created fee's ID
    const feesResult = await callFunction("getMembershipFees", admin.idToken, {
      clubId,
    });
    const fee = feesResult.fees.find((f: any) => f.title === "Update Fee");

    return { admin, clubId, groupId, player1, player2, feeId: fee.feeId };
  }

  it("should add a new member to the fee", async () => {
    const { admin, clubId, player1, player2, feeId } =
      await setupFeeWithMembers();

    const result = await callFunction("updateFeeMembers", admin.idToken, {
      clubId,
      feeId,
      memberIds: [player1.uid, player2.uid],
    });

    expect(result.success).toBe(true);
    expect(result.addedCount).toBe(1); // player2 added
    expect(result.removedCount).toBe(0);
  });

  it("should remove a pending member from the fee", async () => {
    const { admin, clubId, player1, player2, feeId } =
      await setupFeeWithMembers();

    // First add player2
    await callFunction("updateFeeMembers", admin.idToken, {
      clubId,
      feeId,
      memberIds: [player1.uid, player2.uid],
    });

    // Then remove player2 (still pending — no payment made)
    const result = await callFunction("updateFeeMembers", admin.idToken, {
      clubId,
      feeId,
      memberIds: [player1.uid],
    });

    expect(result.success).toBe(true);
    expect(result.removedCount).toBe(1);
    expect(result.removedPaidCount).toBe(0);
  });

  it("should NOT remove a paid member", async () => {
    const { admin, clubId, player1, feeId } = await setupFeeWithMembers();

    // Manually mark player1 as paid in the allMembers entry
    // (updateFeeMembers reads paymentStatus from the allMembers array)
    const db = getFirestore();
    const feeSnap = await db.doc(`membershipFees/${feeId}`).get();
    const { groupId } = feeSnap.data() as { groupId: string };

    await db.doc(`membershipFees/${feeId}`).update({
      includedMembers: [player1.uid],
    });

    // Update allMembers so the member's paymentStatus shows as paid
    const membersRef = db.doc(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const membersDoc = await membersRef.get();
    const currentMembers: any[] = membersDoc.data()?.members || [];
    const updatedMembers = currentMembers.map((m: any) =>
      m.userId === player1.uid
        ? {
            ...m,
            paymentStatus: {
              activeFeeId: feeId,
              status: "paid",
              amount: 10000,
              currency: "sek",
              paidAt: new Date(),
              paidBy: player1.uid,
            },
          }
        : m,
    );
    await membersRef.update({ members: updatedMembers });

    // Attempt to remove player1 (paid)
    const result = await callFunction("updateFeeMembers", admin.idToken, {
      clubId,
      feeId,
      memberIds: [], // try to remove everyone
    });

    expect(result.success).toBe(true);
    // player1 should NOT be removed because they paid
    expect(result.removedPaidCount).toBe(1);
    expect(result.removedCount).toBe(0);

    // Verify player1 still in includedMembers
    const feeDoc = await getDocument(`membershipFees/${feeId}`);
    expect(feeDoc!.includedMembers).toContain(player1.uid);
  });

  it("should reject non-admin callers", async () => {
    const { player1, clubId, feeId } = await setupFeeWithMembers();

    await expectFunctionError(
      "updateFeeMembers",
      player1.idToken,
      { clubId, feeId, memberIds: [] },
      "permission-denied",
    );
  });

  it("should reject updates to a closed fee", async () => {
    const { admin, clubId, feeId } = await setupFeeWithMembers();

    // Close the fee directly in Firestore
    const db = getFirestore();
    await db.doc(`membershipFees/${feeId}`).update({ status: "closed" });

    await expectFunctionError(
      "updateFeeMembers",
      admin.idToken,
      { clubId, feeId, memberIds: [] },
      "failed-precondition",
    );
  });

  it("should silently ignore invalid member IDs", async () => {
    const { admin, clubId, player1, feeId } = await setupFeeWithMembers();

    const result = await callFunction("updateFeeMembers", admin.idToken, {
      clubId,
      feeId,
      memberIds: [player1.uid, "bogus-id-123"],
    });

    expect(result.success).toBe(true);
    // bogus-id-123 is not a group member so silently ignored
    const feeDoc = await getDocument(`membershipFees/${feeId}`);
    expect(feeDoc!.includedMembers).not.toContain("bogus-id-123");
  });
});
