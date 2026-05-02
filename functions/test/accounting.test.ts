/**
 * Accounting Integration Tests
 *
 * Tests: verificationService (createVerification — sequential numbering),
 *        getAccountingData (fetch verifications, date filters, access control),
 *        generateSIEExport (SIE 4 format content, year filter, access control)
 *
 * Runs against Firebase Emulators.
 */

import { createVerification } from "../src/accounting/verificationService";
import {
    callFunction,
    clearAll,
    createFullTestUser,
    expectFunctionError,
    getFirestore,
    seedUserDocument,
} from "./helpers";

// ─── Shared Setup ─────────────────────────────────────────────

async function setupAdminClub() {
  const user = await createFullTestUser({ displayName: "Accounting Admin" });

  const { clubId } = await callFunction("createClub", user.idToken, {
    clubData: { name: `Accounting Club ${Date.now()}`, country: "SE" },
  });

  await seedUserDocument(user.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Accounting Club",
        role: "club-admin",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [],
      },
    ],
  });

  return { user, clubId };
}

// ─── verificationService — createVerification ─────────────────

describe("verificationService — createVerification", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("creates a verification document with sequential ver number starting at 1", async () => {
    const db = getFirestore();
    const clubId = `test-club-${Date.now()}`;

    // Pre-create a minimal club doc so the path exists
    await db.doc(`clubs/${clubId}`).set({ name: "Unit Club" });

    const verId = await createVerification(db, {
      clubId,
      date: new Date("2026-03-15"),
      description: "Test payment verification",
      sourceType: "stripe_payment",
      feeId: "fee-001",
      feeTitle: "Annual Fee",
      category: "membership_fee",
      basAccount: 3010,
      lines: [
        { account: 1930, debit: 48550, credit: 0, description: "Bank (net)" },
        { account: 6570, debit: 1450, credit: 0, description: "Stripe fee" },
        {
          account: 3010,
          debit: 0,
          credit: 50000,
          description: "Membership income",
        },
      ],
    });

    expect(verId).toBeTruthy();

    const verDoc = await db.doc(`clubs/${clubId}/verifications/${verId}`).get();

    expect(verDoc.exists).toBe(true);
    const data = verDoc.data()!;
    expect(data.verNumber).toBe(1);
    expect(data.sourceType).toBe("stripe_payment");
    expect(data.category).toBe("membership_fee");
    expect(data.basAccount).toBe(3010);
    expect(data.lines).toHaveLength(3);
    expect(data.lines[2].credit).toBe(50000);
  });

  it("increments ver number sequentially for multiple verifications", async () => {
    const db = getFirestore();
    const clubId = `test-club-seq-${Date.now()}`;
    await db.doc(`clubs/${clubId}`).set({ name: "Sequential Club" });

    const params = {
      clubId,
      date: new Date(),
      description: "Payment",
      sourceType: "stripe_payment" as const,
      lines: [
        { account: 1930, debit: 1000, credit: 0, description: "Bank" },
        { account: 3010, debit: 0, credit: 1000, description: "Income" },
      ],
    };

    const [id1, id2, id3] = await Promise.all([
      createVerification(db, { ...params, description: "Payment 1" }),
      createVerification(db, { ...params, description: "Payment 2" }),
      createVerification(db, { ...params, description: "Payment 3" }),
    ]);

    const [v1, v2, v3] = await Promise.all([
      db.doc(`clubs/${clubId}/verifications/${id1}`).get(),
      db.doc(`clubs/${clubId}/verifications/${id2}`).get(),
      db.doc(`clubs/${clubId}/verifications/${id3}`).get(),
    ]);

    const numbers = [
      v1.data()!.verNumber,
      v2.data()!.verNumber,
      v3.data()!.verNumber,
    ].sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3]);
  });

  it("stores a refund verification with correct sourceType", async () => {
    const db = getFirestore();
    const clubId = `test-club-refund-${Date.now()}`;
    await db.doc(`clubs/${clubId}`).set({ name: "Refund Club" });

    const verId = await createVerification(db, {
      clubId,
      date: new Date(),
      description: "Refund: Annual Fee",
      sourceType: "stripe_refund",
      lines: [
        {
          account: 3010,
          debit: 50000,
          credit: 0,
          description: "Reversal income",
        },
        {
          account: 1930,
          debit: 0,
          credit: 50000,
          description: "Reversal bank",
        },
      ],
    });

    const verDoc = await db.doc(`clubs/${clubId}/verifications/${verId}`).get();
    expect(verDoc.data()!.sourceType).toBe("stripe_refund");
  });

  it("increments the lastVerNumber counter doc", async () => {
    const db = getFirestore();
    const clubId = `test-club-counter-${Date.now()}`;
    await db.doc(`clubs/${clubId}`).set({ name: "Counter Club" });

    await createVerification(db, {
      clubId,
      date: new Date(),
      description: "P1",
      sourceType: "stripe_payment",
      lines: [
        { account: 1930, debit: 100, credit: 0, description: "Bank" },
        { account: 3010, debit: 0, credit: 100, description: "Income" },
      ],
    });

    await createVerification(db, {
      clubId,
      date: new Date(),
      description: "P2",
      sourceType: "stripe_payment",
      lines: [
        { account: 1930, debit: 200, credit: 0, description: "Bank" },
        { account: 3010, debit: 0, credit: 200, description: "Income" },
      ],
    });

    const counterDoc = await db
      .doc(`clubs/${clubId}/accountingMeta/counters`)
      .get();
    expect(counterDoc.data()!.lastVerNumber).toBe(2);
  });
});

// ─── getAccountingData ─────────────────────────────────────────

describe("getAccountingData", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("returns verifications for a club admin", async () => {
    const { user, clubId } = await setupAdminClub();
    const db = getFirestore();

    // Seed two verifications directly
    await createVerification(db, {
      clubId,
      date: new Date("2026-04-01"),
      description: "Test Ver 1",
      sourceType: "stripe_payment",
      lines: [
        { account: 1930, debit: 49000, credit: 0, description: "Bank" },
        { account: 6570, debit: 1000, credit: 0, description: "Fee" },
        { account: 3010, debit: 0, credit: 50000, description: "Income" },
      ],
    });

    await createVerification(db, {
      clubId,
      date: new Date("2026-04-02"),
      description: "Test Ver 2",
      sourceType: "stripe_payment",
      lines: [
        { account: 1930, debit: 29000, credit: 0, description: "Bank" },
        { account: 6570, debit: 1000, credit: 0, description: "Fee" },
        { account: 3010, debit: 0, credit: 30000, description: "Income" },
      ],
    });

    const result = await callFunction("getAccountingData", user.idToken, {
      clubId,
    });

    expect(result.success).toBe(true);
    expect(result.verifications).toHaveLength(2);
    expect(result.totalDebit).toBe(80000); // 50000 + 30000 debit sides
    expect(result.totalCredit).toBe(80000); // 50000 + 30000 credit sides
  });

  it("filters verifications by date range", async () => {
    const { user, clubId } = await setupAdminClub();
    const db = getFirestore();

    await createVerification(db, {
      clubId,
      date: new Date("2025-12-15"),
      description: "Last year",
      sourceType: "stripe_payment",
      lines: [{ account: 1930, debit: 10000, credit: 0, description: "Bank" }],
    });

    await createVerification(db, {
      clubId,
      date: new Date("2026-02-01"),
      description: "This year",
      sourceType: "stripe_payment",
      lines: [{ account: 1930, debit: 20000, credit: 0, description: "Bank" }],
    });

    const result = await callFunction("getAccountingData", user.idToken, {
      clubId,
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });

    expect(result.success).toBe(true);
    expect(result.verifications).toHaveLength(1);
    expect(result.verifications[0].description).toBe("This year");
  });

  it("returns empty list when no verifications exist", async () => {
    const { user, clubId } = await setupAdminClub();

    const result = await callFunction("getAccountingData", user.idToken, {
      clubId,
    });

    expect(result.success).toBe(true);
    expect(result.verifications).toHaveLength(0);
    expect(result.totalDebit).toBe(0);
    expect(result.totalCredit).toBe(0);
  });

  it("rejects access from a non-admin user", async () => {
    const { clubId } = await setupAdminClub();
    const outsider = await createFullTestUser({ email: "outsider@test.com" });

    await expectFunctionError(
      "getAccountingData",
      outsider.idToken,
      { clubId },
      "permission-denied",
    );
  });

  it("rejects unauthenticated calls", async () => {
    await expectFunctionError(
      "getAccountingData",
      "",
      { clubId: "any" },
      "unauthenticated",
    );
  });

  it("rejects calls with missing clubId", async () => {
    const { user } = await setupAdminClub();

    await expectFunctionError(
      "getAccountingData",
      user.idToken,
      {},
      "invalid-argument",
    );
  });

  it("returns correct verNumber and sourceType on each verification", async () => {
    const { user, clubId } = await setupAdminClub();
    const db = getFirestore();

    await createVerification(db, {
      clubId,
      date: new Date(),
      description: "Refund",
      sourceType: "stripe_refund",
      lines: [
        { account: 3010, debit: 50000, credit: 0, description: "Reversal" },
        { account: 1930, debit: 0, credit: 50000, description: "Bank" },
      ],
    });

    const result = await callFunction("getAccountingData", user.idToken, {
      clubId,
    });

    const ver = result.verifications[0];
    expect(ver.verNumber).toBe(1);
    expect(ver.sourceType).toBe("stripe_refund");
    expect(ver.lines).toHaveLength(2);
  });

  it("returns correct P&L totals computed by account type", async () => {
    const { user, clubId } = await setupAdminClub();
    const db = getFirestore();

    // 500 SEK payment with 14.50 SEK Stripe fee
    // 1930 = Asset (bank), 6570 = Expense (fee), 3010 = Revenue (membership)
    await createVerification(db, {
      clubId,
      date: new Date("2026-05-01"),
      description: "Membership payment",
      sourceType: "stripe_payment",
      category: "membership_fee",
      basAccount: 3010,
      lines: [
        { account: 1930, debit: 48550, credit: 0, description: "Bank net" },
        { account: 6570, debit: 1450, credit: 0, description: "Stripe fee" },
        { account: 3010, debit: 0, credit: 50000, description: "Membership" },
      ],
    });

    const result = await callFunction("getAccountingData", user.idToken, {
      clubId,
    });

    expect(result.success).toBe(true);
    // Gross revenue = what the customer paid (credit on Revenue account)
    expect(result.totalRevenue).toBe(50000);
    // Expenses = Stripe processing fee (debit on Expense account)
    expect(result.totalExpenses).toBe(1450);
    // Net = what actually landed in the bank (debit on Asset account)
    expect(result.totalNetRevenue).toBe(48550);
    // The accounting identity must hold
    expect(result.totalRevenue - result.totalExpenses).toBe(
      result.totalNetRevenue,
    );
  });

  it("correctly reduces revenue and expenses for a full refund", async () => {
    const { user, clubId } = await setupAdminClub();
    const db = getFirestore();

    // Original payment: 300 SEK, 8.70 SEK fee
    await createVerification(db, {
      clubId,
      date: new Date("2026-05-01"),
      description: "Training fee",
      sourceType: "stripe_payment",
      lines: [
        { account: 1930, debit: 29130, credit: 0, description: "Bank net" },
        { account: 6570, debit: 870, credit: 0, description: "Stripe fee" },
        { account: 3010, debit: 0, credit: 30000, description: "Training" },
      ],
    });

    // Refund reversal (same journal lines with debits/credits swapped)
    await createVerification(db, {
      clubId,
      date: new Date("2026-05-02"),
      description: "Refund: Training fee",
      sourceType: "stripe_refund",
      lines: [
        {
          account: 3010,
          debit: 30000,
          credit: 0,
          description: "Reversal income",
        },
        { account: 6570, debit: 0, credit: 870, description: "Reversal fee" },
        {
          account: 1930,
          debit: 0,
          credit: 29130,
          description: "Reversal bank",
        },
      ],
    });

    const result = await callFunction("getAccountingData", user.idToken, {
      clubId,
    });

    // Payment and refund cancel each other out completely
    expect(result.totalRevenue).toBe(0);
    expect(result.totalExpenses).toBe(0);
    expect(result.totalNetRevenue).toBe(0);
  });

  it("accumulates P&L correctly across multiple payments", async () => {
    const { user, clubId } = await setupAdminClub();
    const db = getFirestore();

    // Payment 1: 500 SEK, 14.50 SEK fee
    await createVerification(db, {
      clubId,
      date: new Date("2026-05-01"),
      description: "Payment 1",
      sourceType: "stripe_payment",
      lines: [
        { account: 1930, debit: 48550, credit: 0, description: "Bank" },
        { account: 6570, debit: 1450, credit: 0, description: "Fee" },
        { account: 3010, debit: 0, credit: 50000, description: "Revenue" },
      ],
    });

    // Payment 2: 300 SEK, 8.70 SEK fee
    await createVerification(db, {
      clubId,
      date: new Date("2026-05-02"),
      description: "Payment 2",
      sourceType: "stripe_payment",
      lines: [
        { account: 1930, debit: 29130, credit: 0, description: "Bank" },
        { account: 6570, debit: 870, credit: 0, description: "Fee" },
        { account: 3010, debit: 0, credit: 30000, description: "Revenue" },
      ],
    });

    const result = await callFunction("getAccountingData", user.idToken, {
      clubId,
    });

    expect(result.totalRevenue).toBe(80000); // 50000 + 30000
    expect(result.totalExpenses).toBe(2320); // 1450 + 870
    expect(result.totalNetRevenue).toBe(77680); // 48550 + 29130
    expect(result.totalRevenue - result.totalExpenses).toBe(
      result.totalNetRevenue,
    );
  });
}); // end describe("getAccountingData")

// ─── generateSIEExport ─────────────────────────────────────────

describe("generateSIEExport", () => {
  beforeEach(async () => {
    await clearAll();
  });

  async function setupClubWithVerifications(year = 2026) {
    const { user, clubId } = await setupAdminClub();
    const db = getFirestore();

    await createVerification(db, {
      clubId,
      date: new Date(`${year}-05-10`),
      description: "Membership payment",
      sourceType: "stripe_payment",
      category: "membership_fee",
      basAccount: 3010,
      lines: [
        { account: 1930, debit: 48550, credit: 0, description: "Bank net" },
        { account: 6570, debit: 1450, credit: 0, description: "Stripe fee" },
        { account: 3010, debit: 0, credit: 50000, description: "Membership" },
      ],
    });

    return { user, clubId };
  }

  it("returns success with SIE content and filename", async () => {
    const { user, clubId } = await setupClubWithVerifications();

    const result = await callFunction("generateSIEExport", user.idToken, {
      clubId,
      year: 2026,
    });

    expect(result.success).toBe(true);
    expect(typeof result.content).toBe("string");
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.filename).toMatch(/\.se$/i); // e.g. "clubname_2026.se"
  });

  it("SIE content starts with required #FLAGGA 0 header", async () => {
    const { user, clubId } = await setupClubWithVerifications();

    const result = await callFunction("generateSIEExport", user.idToken, {
      clubId,
      year: 2026,
    });

    expect(result.content).toMatch(/^#FLAGGA 0/);
  });

  it("SIE content contains #SIETYP 4 declaration", async () => {
    const { user, clubId } = await setupClubWithVerifications();

    const result = await callFunction("generateSIEExport", user.idToken, {
      clubId,
      year: 2026,
    });

    expect(result.content).toContain("#SIETYP 4");
  });

  it("SIE content contains #FORMAT PC8", async () => {
    const { user, clubId } = await setupClubWithVerifications();

    const result = await callFunction("generateSIEExport", user.idToken, {
      clubId,
      year: 2026,
    });

    expect(result.content).toContain("#FORMAT PC8");
  });

  it("SIE content contains #VER entries for verifications", async () => {
    const { user, clubId } = await setupClubWithVerifications();

    const result = await callFunction("generateSIEExport", user.idToken, {
      clubId,
      year: 2026,
    });

    expect(result.content).toContain("#VER");
    expect(result.content).toContain("#TRANS");
  });

  it("SIE content contains #KONTO account declarations", async () => {
    const { user, clubId } = await setupClubWithVerifications();

    const result = await callFunction("generateSIEExport", user.idToken, {
      clubId,
      year: 2026,
    });

    // Should declare BAS accounts used (1930, 6570, 3010)
    expect(result.content).toContain("#KONTO 1930");
    expect(result.content).toContain("#KONTO 3010");
    expect(result.content).toContain("#KONTO 6570");
  });

  it("SIE content contains #RAR fiscal year declaration", async () => {
    const { user, clubId } = await setupClubWithVerifications(2026);

    const result = await callFunction("generateSIEExport", user.idToken, {
      clubId,
      year: 2026,
    });

    expect(result.content).toContain("#RAR 0 20260101 20261231");
  });

  it("amounts in SIE are in kronor (not öre)", async () => {
    const { user, clubId } = await setupClubWithVerifications();

    const result = await callFunction("generateSIEExport", user.idToken, {
      clubId,
      year: 2026,
    });

    // 50000 öre = 500.00 SEK — SIE should have "500.00" not "50000"
    expect(result.content).toContain("500.00");
    // 48550 öre = 485.50 SEK
    expect(result.content).toContain("485.50");
  });

  it("only exports verifications for the requested fiscal year", async () => {
    const { user, clubId } = await setupAdminClub();
    const db = getFirestore();

    // 2025 verification
    await createVerification(db, {
      clubId,
      date: new Date("2025-06-01"),
      description: "Old payment",
      sourceType: "stripe_payment",
      lines: [
        { account: 1930, debit: 50000, credit: 0, description: "Bank" },
        { account: 3010, debit: 0, credit: 50000, description: "Income" },
      ],
    });

    // 2026 verification
    await createVerification(db, {
      clubId,
      date: new Date("2026-03-01"),
      description: "Current payment",
      sourceType: "stripe_payment",
      lines: [
        { account: 1930, debit: 20000, credit: 0, description: "Bank" },
        { account: 3010, debit: 0, credit: 20000, description: "Income" },
      ],
    });

    const result = await callFunction("generateSIEExport", user.idToken, {
      clubId,
      year: 2026,
    });

    // Should contain "Current payment" but not "Old payment"
    expect(result.content).toContain("Current payment");
    expect(result.content).not.toContain("Old payment");
  });

  it("returns empty-body SIE (only headers) when no verifications for the year", async () => {
    const { user, clubId } = await setupAdminClub();

    const result = await callFunction("generateSIEExport", user.idToken, {
      clubId,
      year: 2099, // far future — no data
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain("#FLAGGA 0");
    // No #VER entries expected
    expect(result.content).not.toContain("#VER");
  });

  it("rejects access from a non-admin user", async () => {
    const { clubId } = await setupAdminClub();
    const outsider = await createFullTestUser({ email: "outsider2@test.com" });

    await expectFunctionError(
      "generateSIEExport",
      outsider.idToken,
      { clubId, year: 2026 },
      "permission-denied",
    );
  });

  it("rejects unauthenticated calls", async () => {
    await expectFunctionError(
      "generateSIEExport",
      "",
      { clubId: "any", year: 2026 },
      "unauthenticated",
    );
  });

  it("rejects missing clubId", async () => {
    const { user } = await setupAdminClub();

    await expectFunctionError(
      "generateSIEExport",
      user.idToken,
      { year: 2026 },
      "invalid-argument",
    );
  });

  it("defaults to current year when year is omitted", async () => {
    const { user, clubId } = await setupAdminClub();

    const result = await callFunction("generateSIEExport", user.idToken, {
      clubId,
    });

    // Should still succeed and return valid SIE headers
    expect(result.success).toBe(true);
    const currentYear = new Date().getFullYear();
    expect(result.content).toContain(
      `#RAR 0 ${currentYear}0101 ${currentYear}1231`,
    );
  });
});
