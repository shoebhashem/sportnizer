/**
 * Fee Management Integration Tests
 *
 * Tests: createMembershipFee (single & multi-component, category validation, earmark),
 *        deleteMembershipFee (soft-close),
 *        updateMembershipFee (title / description / dueDate),
 *        getMembershipFees (returns category + components)
 *        createClub (country / currency fields)
 *
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

// ─── Shared Setup ─────────────────────────────────────────────

async function setupClubWithStripe(country = "SE") {
  const admin = await createFullTestUser({ displayName: "Admin" });

  const { clubId } = await callFunction("createClub", admin.idToken, {
    clubData: { name: `Test Club ${Date.now()}`, country },
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

  const db = getFirestore();

  // Enable Stripe
  await db.doc(`clubs/${clubId}`).update({
    stripeAccountId: "acct_test123",
    stripeAccountStatus: "active",
    stripe: { chargesEnabled: true, accountId: "acct_test123" },
  });

  const { groupId } = await callFunction("createGroup", admin.idToken, {
    clubId,
    groupData: { name: "Squad A" },
  });

  await db.doc(`clubs/${clubId}/groups/${groupId}`).update({
    name: "Squad A",
    clubId,
  });

  // Seed admin as a player in the group so fees target someone
  await db
    .collection(`clubs/${clubId}/groups/${groupId}/allMembers`)
    .doc("members")
    .set({
      members: [
        {
          userId: admin.uid,
          name: admin.displayName,
          email: admin.email,
          roles: ["player"],
          isActive: true,
          needsGuardian: false,
        },
      ],
      memberCount: 1,
    });

  return { admin, clubId, groupId };
}

// ─── createClub — country / currency ─────────────────────────

describe("createClub — country & currency", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("stores country and derives currency for Swedish club", async () => {
    const user = await createFullTestUser();

    const { clubId } = await callFunction("createClub", user.idToken, {
      clubData: { name: "Svenska IF", country: "SE" },
    });

    const club = await getDocument(`clubs/${clubId}`);
    expect(club).toBeDefined();
    expect(club!.country).toBe("SE");
    expect(club!.currency).toBe("sek");
  });

  it("stores country and derives currency for Norwegian club", async () => {
    const user = await createFullTestUser();

    const { clubId } = await callFunction("createClub", user.idToken, {
      clubData: { name: "Norsk IF", country: "NO" },
    });

    const club = await getDocument(`clubs/${clubId}`);
    expect(club).toBeDefined();
    expect(club!.country).toBe("NO");
    expect(club!.currency).toBe("nok");
  });

  it("defaults to SE when no country is provided", async () => {
    const user = await createFullTestUser();

    const { clubId } = await callFunction("createClub", user.idToken, {
      clubData: { name: "Default Club" },
    });

    const club = await getDocument(`clubs/${clubId}`);
    expect(club).toBeDefined();
    // Backend defaults to SE when country absent
    expect(club!.country).toBe("SE");
    expect(club!.currency).toBe("sek");
  });
});

// ─── createMembershipFee — category & earmark ────────────────

describe("createMembershipFee — category & BAS account", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("stores category and resolves basAccount for membership_fee", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();

    const result = await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Annual Fee",
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "membership_fee", amount: 60000 }],
    });

    expect(result.success).toBe(true);

    const fee = await getDocument(`membershipFees/${result.feeId}`);
    expect(fee).toBeDefined();
    expect(fee!.category).toBe("membership_fee");
    expect(fee!.components[0].resolvedRevenueAccount).toBe(3010); // Swedish BAS 3010
  });

  it("resolves correct basAccount for training_fee", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();

    const result = await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Training Fee Q1",
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "training_fee", amount: 30000 }],
    });

    const fee = await getDocument(`membershipFees/${result.feeId}`);
    expect(fee!.category).toBe("training_fee");
    expect(fee!.components[0].resolvedRevenueAccount).toBe(3020);
  });

  it("resolves correct basAccount for event_fee", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();

    const result = await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Summer Camp",
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "event_fee", amount: 150000 }],
    });

    const fee = await getDocument(`membershipFees/${result.feeId}`);
    expect(fee!.components[0].resolvedRevenueAccount).toBe(3030);
  });

  it("stores earmarkedGroupId when provided with sales_kiosk category", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();

    const result = await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Kiosk Sales",
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "sales_kiosk", amount: 20000 }],
      earmarkedGroupId: groupId,
    });

    const fee = await getDocument(`membershipFees/${result.feeId}`);
    expect(fee!.category).toBe("sales_kiosk");
    expect(fee!.earmarkedGroupId).toBe(groupId);
  });

  it("rejects an invalid category", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();

    await expectFunctionError(
      "createMembershipFee",
      admin.idToken,
      {
        clubId,
        groupId,
        title: "Bad Category Fee",
        currency: "sek",
        targetRoles: ["player"],
        components: [{ category: "fakeCategory", amount: 10000 }],
      },
      "invalid-argument",
    );
  });

  it("succeeds with a valid category provided", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();

    // components[] is required; each entry must reference an active category
    const result = await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Category Fee",
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "membership_fee", amount: 10000 }],
    });

    expect(result.success).toBe(true);
  });
});

// ─── getMembershipFees — returns category & basAccount ────────

describe("getMembershipFees — category & basAccount in response", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("returns category and basAccount fields for each fee", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();

    await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Sponsor Fee",
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "sponsorship", amount: 100000 }],
    });

    const result = await callFunction("getMembershipFees", admin.idToken, {
      clubId,
    });

    expect(result.success).toBe(true);
    expect(result.fees.length).toBeGreaterThanOrEqual(1);

    const fee = result.fees[0];
    expect(fee.category).toBe("sponsorship");
    expect(fee.components[0].resolvedRevenueAccount).toBe(3210);
  });

  it("returns description field for each fee", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();

    await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Test Fee",
      description: "Spring 2026 payment",
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "membership_fee", amount: 50000 }],
    });

    const result = await callFunction("getMembershipFees", admin.idToken, {
      clubId,
    });

    const fee = result.fees[0];
    expect(fee.description).toBe("Spring 2026 payment");
  });
});

// ─── createMembershipFee — multi-component fees ───────────────

describe("createMembershipFee — multi-component fees", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("creates a fee with two components and sums amounts correctly", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();

    const result = await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Combined Fee",
      currency: "sek",
      targetRoles: ["player"],
      components: [
        { category: "membership_fee", amount: 30000, note: "Membership part" },
        { category: "training_fee", amount: 20000, note: "Training part" },
      ],
    });

    expect(result.success).toBe(true);

    const fee = await getDocument(`membershipFees/${result.feeId}`);
    expect(fee).toBeDefined();
    // Total = sum of components
    expect(fee!.amount).toBe(50000);
    // Two components stored
    expect(fee!.components).toHaveLength(2);
    // Account numbers snapshotted correctly
    expect(fee!.components[0].resolvedRevenueAccount).toBe(3010);
    expect(fee!.components[1].resolvedRevenueAccount).toBe(3020);
    // Display category is null when multiple components
    expect(fee!.category).toBeNull();
  });

  it("snapshots label and vatRate from the chart at creation time", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();

    const result = await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Snapshot Test",
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "membership_fee", amount: 40000 }],
    });

    const fee = await getDocument(`membershipFees/${result.feeId}`);
    const comp = fee!.components[0];
    expect(typeof comp.label).toBe("string");
    expect(comp.label.length).toBeGreaterThan(0);
    expect(typeof comp.vatRate).toBe("number");
    expect(typeof comp.taxExempt).toBe("boolean");
  });

  it("rejects fee with no components array", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();

    await expectFunctionError(
      "createMembershipFee",
      admin.idToken,
      {
        clubId,
        groupId,
        title: "No Components",
        currency: "sek",
        targetRoles: ["player"],
        // components intentionally omitted
      },
      "invalid-argument",
    );
  });

  it("rejects fee with empty components array", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();

    await expectFunctionError(
      "createMembershipFee",
      admin.idToken,
      {
        clubId,
        groupId,
        title: "Empty Components",
        currency: "sek",
        targetRoles: ["player"],
        components: [],
      },
      "invalid-argument",
    );
  });
});

// ─── deleteMembershipFee ─────────────────────────────────────

describe("deleteMembershipFee", () => {
  beforeEach(async () => {
    await clearAll();
  });

  async function createOneFee(admin: any, clubId: string, groupId: string) {
    const result = await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Fee to Close",
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "membership_fee", amount: 30000 }],
    });
    return result.feeId as string;
  }

  it("soft-closes an active fee (sets status = closed)", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();
    const feeId = await createOneFee(admin, clubId, groupId);

    const result = await callFunction("deleteMembershipFee", admin.idToken, {
      feeId,
    });

    expect(result.success).toBe(true);

    const fee = await getDocument(`membershipFees/${feeId}`);
    expect(fee!.status).toBe("closed");
    expect(fee!.deletedAt).toBeDefined();
  });

  it("rejects close from a non-admin user", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();
    const feeId = await createOneFee(admin, clubId, groupId);

    const nonAdmin = await createFullTestUser({ email: "nonadmin@test.com" });

    await expectFunctionError(
      "deleteMembershipFee",
      nonAdmin.idToken,
      { feeId },
      "permission-denied",
    );
  });

  it("returns not-found for a non-existent feeId", async () => {
    const { admin } = await setupClubWithStripe();

    await expectFunctionError(
      "deleteMembershipFee",
      admin.idToken,
      { feeId: "nonexistent-fee-id" },
      "not-found",
    );
  });

  it("requires feeId parameter", async () => {
    const { admin } = await setupClubWithStripe();

    await expectFunctionError(
      "deleteMembershipFee",
      admin.idToken,
      {},
      "invalid-argument",
    );
  });

  it("rejects unauthenticated calls", async () => {
    await expectFunctionError(
      "deleteMembershipFee",
      "",
      { feeId: "any" },
      "unauthenticated",
    );
  });
});

// ─── updateMembershipFee ─────────────────────────────────────

describe("updateMembershipFee", () => {
  beforeEach(async () => {
    await clearAll();
  });

  async function createActiveFee(admin: any, clubId: string, groupId: string) {
    const result = await callFunction("createMembershipFee", admin.idToken, {
      clubId,
      groupId,
      title: "Original Title",
      description: "Original description",
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "training_fee", amount: 25000 }],
    });
    return result.feeId as string;
  }

  it("updates title on an active fee", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();
    const feeId = await createActiveFee(admin, clubId, groupId);

    const result = await callFunction("updateMembershipFee", admin.idToken, {
      feeId,
      title: "Updated Title",
    });

    expect(result.success).toBe(true);

    const fee = await getDocument(`membershipFees/${feeId}`);
    expect(fee!.title).toBe("Updated Title");
  });

  it("updates description on an active fee", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();
    const feeId = await createActiveFee(admin, clubId, groupId);

    await callFunction("updateMembershipFee", admin.idToken, {
      feeId,
      description: "New description text",
    });

    const fee = await getDocument(`membershipFees/${feeId}`);
    expect(fee!.description).toBe("New description text");
  });

  it("updates dueDate on an active fee", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();
    const feeId = await createActiveFee(admin, clubId, groupId);

    const newDueDate = "2026-12-31";
    await callFunction("updateMembershipFee", admin.idToken, {
      feeId,
      dueDate: newDueDate,
    });

    const fee = await getDocument(`membershipFees/${feeId}`);
    // dueDate is stored as Firestore Timestamp — should be truthy
    expect(fee!.dueDate).toBeDefined();
  });

  it("rejects update on a closed fee", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();
    const feeId = await createActiveFee(admin, clubId, groupId);

    // Close the fee first
    await callFunction("deleteMembershipFee", admin.idToken, { feeId });

    await expectFunctionError(
      "updateMembershipFee",
      admin.idToken,
      { feeId, title: "Too Late" },
      "failed-precondition",
    );
  });

  it("rejects an empty title string", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();
    const feeId = await createActiveFee(admin, clubId, groupId);

    await expectFunctionError(
      "updateMembershipFee",
      admin.idToken,
      { feeId, title: "   " },
      "invalid-argument",
    );
  });

  it("rejects update from a non-admin user", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();
    const feeId = await createActiveFee(admin, clubId, groupId);

    const nonAdmin = await createFullTestUser({ email: "player2@test.com" });

    await expectFunctionError(
      "updateMembershipFee",
      nonAdmin.idToken,
      { feeId, title: "Nope" },
      "permission-denied",
    );
  });

  it("returns not-found for unknown feeId", async () => {
    const { admin } = await setupClubWithStripe();

    await expectFunctionError(
      "updateMembershipFee",
      admin.idToken,
      { feeId: "does-not-exist", title: "X" },
      "not-found",
    );
  });

  it("requires feeId parameter", async () => {
    const { admin } = await setupClubWithStripe();

    await expectFunctionError(
      "updateMembershipFee",
      admin.idToken,
      { title: "Missing feeId" },
      "invalid-argument",
    );
  });

  it("does not change immutable fields (amount, category)", async () => {
    const { admin, clubId, groupId } = await setupClubWithStripe();
    const feeId = await createActiveFee(admin, clubId, groupId);

    await callFunction("updateMembershipFee", admin.idToken, {
      feeId,
      title: "New Title",
      // Attempt to change immutable fields — backend must ignore them
      amount: 999999,
      category: "sponsorship",
    });

    const fee = await getDocument(`membershipFees/${feeId}`);
    expect(fee!.amount).toBe(25000); // unchanged
    expect(fee!.category).toBe("training_fee"); // unchanged
  });
});
