/**
 * Chart of Accounts Tests
 *
 * Tests: seedClubAccountingConfig (correct accounts seeded for SE/NO/generic),
 *        resolveClubAccountNumbers (reads from club chart, falls back to BAS),
 *        getDefaultChartForCountry (correct chart returned for each country),
 *        getChartOfAccounts Cloud Function (fetch, permissions, on-demand seeding),
 *        updateChartAccount Cloud Function (edit number/name, access control,
 *          bank deactivation guard, vatRate validation)
 *
 * Runs against Firebase Emulators.
 */

import {
    callFunction,
    clearAll,
    createFullTestUser,
    expectFunctionError,
    getFirestore,
    seedUserDocument,
} from "./helpers";

// ─── Pure-unit helpers (no emulator needed) ──────────────────

// Import directly for unit tests (no emulator round-trip)
import {
    resolveClubAccountNumbers,
    seedClubAccountingConfig,
} from "../src/accounting/chartOfAccounts";
import { getDefaultChartForCountry } from "../src/config/accounting";

// ─── Shared Setup ─────────────────────────────────────────────

async function setupAdminClub(country = "SE") {
  const user = await createFullTestUser({ displayName: "Chart Admin" });

  const { clubId } = await callFunction("createClub", user.idToken, {
    clubData: { name: `Chart Club ${Date.now()}`, country },
  });

  await seedUserDocument(user.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Chart Club",
        role: "club-admin",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [],
      },
    ],
  });

  return { user, clubId };
}

async function setupRegularMember(clubId: string) {
  const user = await createFullTestUser({ displayName: "Regular Member" });
  await seedUserDocument(user.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Chart Club",
        role: "player",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [],
      },
    ],
  });
  return user;
}

// ─── Unit: getDefaultChartForCountry ─────────────────────────

describe("getDefaultChartForCountry — pure unit", () => {
  it("returns SE BAS chart for country code SE", () => {
    const chart = getDefaultChartForCountry("SE");
    expect(chart.length).toBeGreaterThan(0);
    // BAS bank account is 1930 in Sweden
    const bank = chart.find((a) => a.id === "bank");
    expect(bank).toBeDefined();
    expect(bank!.number).toBe(1930);
  });

  it("returns NO chart for country code NO", () => {
    const chart = getDefaultChartForCountry("NO");
    const bank = chart.find((a) => a.id === "bank");
    expect(bank).toBeDefined();
    // Norwegian standard bank account
    expect(bank!.number).toBeGreaterThanOrEqual(1000);
  });

  it("returns generic chart for unknown country code", () => {
    const chart = getDefaultChartForCountry("XX");
    expect(chart.length).toBeGreaterThan(0);
    // Generic chart should still have a bank account
    const bank = chart.find((a) => a.id === "bank");
    expect(bank).toBeDefined();
  });

  it("SE chart includes revenue accounts with correct VAT rates", () => {
    const chart = getDefaultChartForCountry("SE");
    const revenueAccounts = chart.filter((a) => a.type === "Revenue");
    expect(revenueAccounts.length).toBeGreaterThan(0);
    // All Revenue accounts should have a defined vatRate
    revenueAccounts.forEach((a) => {
      expect(typeof a.vatRate).toBe("number");
    });
  });

  it("SE chart membership fee account is VAT-exempt (0%)", () => {
    const chart = getDefaultChartForCountry("SE");
    const membership = chart.find(
      (a) => a.categoryMapping === "membership_fee",
    );
    expect(membership).toBeDefined();
    expect(membership!.vatRate).toBe(0);
    expect(membership!.taxExempt).toBe(true);
  });
});

// ─── Unit: seedClubAccountingConfig + resolveClubAccountNumbers ─

describe("seedClubAccountingConfig — emulator unit", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("seeds correct number of accounts for SE club", async () => {
    const db = getFirestore();
    const clubId = `unit-se-${Date.now()}`;
    await db
      .doc(`clubs/${clubId}`)
      .set({ name: "Unit SE Club", country: "SE" });

    await seedClubAccountingConfig(db, clubId, "SE");

    const accountsSnap = await db
      .collection(`clubs/${clubId}/chartOfAccounts`)
      .get();
    expect(accountsSnap.size).toBeGreaterThanOrEqual(5);
  });

  it("seeds correct number of accounts for NO club", async () => {
    const db = getFirestore();
    const clubId = `unit-no-${Date.now()}`;
    await db
      .doc(`clubs/${clubId}`)
      .set({ name: "Unit NO Club", country: "NO" });

    await seedClubAccountingConfig(db, clubId, "NO");

    const accountsSnap = await db
      .collection(`clubs/${clubId}/chartOfAccounts`)
      .get();
    expect(accountsSnap.size).toBeGreaterThanOrEqual(5);
  });

  it("also writes accountingConfig/settings document", async () => {
    const db = getFirestore();
    const clubId = `unit-cfg-${Date.now()}`;
    await db
      .doc(`clubs/${clubId}`)
      .set({ name: "Unit Config Club", country: "SE" });

    await seedClubAccountingConfig(db, clubId, "SE");

    const settingsDoc = await db
      .doc(`clubs/${clubId}/accountingConfig/settings`)
      .get();
    expect(settingsDoc.exists).toBe(true);
    const data = settingsDoc.data()!;
    expect(data.country).toBe("SE");
    expect(typeof data.chartVersion).toBe("number");
  });
});

describe("resolveClubAccountNumbers — emulator unit", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("returns accounts from club chart when chart exists", async () => {
    const db = getFirestore();
    const clubId = `resolve-with-chart-${Date.now()}`;
    await db
      .doc(`clubs/${clubId}`)
      .set({ name: "Resolve Club", country: "SE" });
    await seedClubAccountingConfig(db, clubId, "SE");

    const result = await resolveClubAccountNumbers(db, clubId);

    expect(result).toHaveProperty("bankAccount");
    expect(result).toHaveProperty("revenueAccount");
    expect(result).toHaveProperty("paymentFeeAccount");
    expect(typeof result.bankAccount).toBe("number");
    expect(result.bankAccount).toBeGreaterThan(0);
  });

  it("returns BAS fallback defaults when no chart exists", async () => {
    const db = getFirestore();
    const clubId = `resolve-no-chart-${Date.now()}`;
    await db.doc(`clubs/${clubId}`).set({ name: "Old Club No Chart" });

    const result = await resolveClubAccountNumbers(db, clubId);

    // BAS defaults: bank = 1930, payment fee = 6570
    expect(result.bankAccount).toBe(1930);
    expect(result.paymentFeeAccount).toBe(6570);
  });

  it("resolves category-specific revenue account when feeCategory is provided", async () => {
    const db = getFirestore();
    const clubId = `resolve-cat-${Date.now()}`;
    await db
      .doc(`clubs/${clubId}`)
      .set({ name: "Category Club", country: "SE" });
    await seedClubAccountingConfig(db, clubId, "SE");

    const result = await resolveClubAccountNumbers(
      db,
      clubId,
      "membership_fee",
    );

    expect(result.revenueAccount).toBeGreaterThan(0);
  });
});

// ─── Integration: getChartOfAccounts Cloud Function ─────────

describe("getChartOfAccounts — Cloud Function", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("returns accounts and settings for a club admin", async () => {
    const { user, clubId } = await setupAdminClub("SE");

    const result = await callFunction("getChartOfAccounts", user.idToken, {
      clubId,
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.accounts)).toBe(true);
    expect(result.accounts.length).toBeGreaterThan(0);
    expect(result.settings).toBeDefined();
  });

  it("returns permission-denied for a non-admin member", async () => {
    const { user: admin, clubId } = await setupAdminClub("SE");
    const member = await setupRegularMember(clubId);

    await expectFunctionError(
      callFunction("getChartOfAccounts", member.idToken, { clubId }),
      "permission-denied",
    );
  });

  it("seeds chart on-demand for a club that has no chart yet", async () => {
    const db = getFirestore();
    const { user, clubId } = await setupAdminClub("SE");

    // Manually delete the chart to simulate an old club
    const accountsSnap = await db
      .collection(`clubs/${clubId}/chartOfAccounts`)
      .get();
    const batch = db.batch();
    accountsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(db.doc(`clubs/${clubId}/accountingConfig/settings`));
    await batch.commit();

    // getChartOfAccounts should seed on-demand
    const result = await callFunction("getChartOfAccounts", user.idToken, {
      clubId,
    });

    expect(result.success).toBe(true);
    expect(result.accounts.length).toBeGreaterThan(0);
  });

  it("returns error when clubId is missing", async () => {
    const { user } = await setupAdminClub("SE");

    await expectFunctionError(
      callFunction("getChartOfAccounts", user.idToken, {}),
      "invalid-argument",
    );
  });
});

// ─── Integration: updateChartAccount Cloud Function ──────────

describe("updateChartAccount — Cloud Function", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("successfully updates account number and name", async () => {
    const { user, clubId } = await setupAdminClub("SE");

    const chart = await callFunction("getChartOfAccounts", user.idToken, {
      clubId,
    });
    // Find a non-system account to update (payment fee is non-system)
    const nonSystem = chart.accounts.find((a: any) => !a.isSystem);
    expect(nonSystem).toBeDefined();

    const result = await callFunction("updateChartAccount", user.idToken, {
      clubId,
      accountId: nonSystem.id,
      updates: { number: 8999, name: "Updated Account Name" },
    });

    expect(result.success).toBe(true);
  });

  it("blocks non-admin from updating accounts", async () => {
    const { user: admin, clubId } = await setupAdminClub("SE");
    const member = await setupRegularMember(clubId);

    const chart = await callFunction("getChartOfAccounts", admin.idToken, {
      clubId,
    });
    const account = chart.accounts[0];

    await expectFunctionError(
      callFunction("updateChartAccount", member.idToken, {
        clubId,
        accountId: account.id,
        updates: { name: "Hacked Name" },
      }),
      "permission-denied",
    );
  });

  it("blocks deactivating the bank account", async () => {
    const { user, clubId } = await setupAdminClub("SE");

    await expectFunctionError(
      callFunction("updateChartAccount", user.idToken, {
        clubId,
        accountId: "bank",
        updates: { isActive: false },
      }),
      "invalid-argument",
    );
  });

  it("blocks invalid vatRate values", async () => {
    const { user, clubId } = await setupAdminClub("SE");

    const chart = await callFunction("getChartOfAccounts", user.idToken, {
      clubId,
    });
    const nonSystem = chart.accounts.find((a: any) => !a.isSystem);

    await expectFunctionError(
      callFunction("updateChartAccount", user.idToken, {
        clubId,
        accountId: nonSystem.id,
        updates: { vatRate: 15 }, // not a valid rate
      }),
      "invalid-argument",
    );
  });

  it("blocks updating system account vatRate", async () => {
    const { user, clubId } = await setupAdminClub("SE");

    const chart = await callFunction("getChartOfAccounts", user.idToken, {
      clubId,
    });
    const systemAccount = chart.accounts.find((a: any) => a.isSystem);
    expect(systemAccount).toBeDefined();

    await expectFunctionError(
      callFunction("updateChartAccount", user.idToken, {
        clubId,
        accountId: systemAccount.id,
        updates: { vatRate: 25 },
      }),
      "invalid-argument",
    );
  });
});
