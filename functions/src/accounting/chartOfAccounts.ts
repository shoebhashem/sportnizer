import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  BAS_ACCOUNT_MAP,
  ChartAccount,
  getDefaultChartForCountry,
  SPECIAL_ACCOUNTS,
} from "../config/accounting";
import { config } from "../utils/config";

// ─── Internal: Seed on club creation ─────────────────────────────────────────

/**
 * Seeds the default chart of accounts and accounting settings for a newly created club.
 * Called internally by createClub — NOT an exported Cloud Function.
 *
 * Firestore paths written:
 *   clubs/{clubId}/accountingConfig/settings
 *   clubs/{clubId}/chartOfAccounts/{id}   (one doc per account)
 */
export async function seedClubAccountingConfig(
  db: admin.firestore.Firestore,
  clubId: string,
  country: string,
): Promise<void> {
  const chart = getDefaultChartForCountry(country);

  const batch = db.batch();

  // Settings document
  const settingsRef = db
    .collection("clubs")
    .doc(clubId)
    .collection("accountingConfig")
    .doc("settings");

  batch.set(settingsRef, {
    country: (country ?? "SE").toUpperCase(),
    fiscalYearStartMonth: 1, // January
    vatExempt: true, // Sports association default: VAT-exempt
    chartVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
  });

  // One document per account entry
  for (const account of chart) {
    const accountRef = db
      .collection("clubs")
      .doc(clubId)
      .collection("chartOfAccounts")
      .doc(account.id);
    batch.set(accountRef, { ...account });
  }

  await batch.commit();
}

// ─── Internal: Resolve account numbers from club chart ───────────────────────

/**
 * Resolves the account numbers a club uses based on its stored chart of accounts.
 *
 * Returns: revenue account for the fee category, bank account, payment-fee account,
 *          and team-fund account.
 *
 * Falls back to legacy Swedish BAS defaults if the club has no chart, so that
 * clubs created before this feature keep working without migration.
 */
export async function resolveClubAccountNumbers(
  db: admin.firestore.Firestore,
  clubId: string,
  feeCategory?: string,
): Promise<{
  revenueAccount: number;
  bankAccount: number;
  paymentFeeAccount: number;
  platformFeeAccount: number;
  teamFundAccount: number;
  vatOutputAccount: number;
}> {
  const FALLBACK = {
    revenueAccount:
      feeCategory && BAS_ACCOUNT_MAP["SE"][feeCategory] !== undefined
        ? BAS_ACCOUNT_MAP["SE"][feeCategory]
        : 3890,
    bankAccount: SPECIAL_ACCOUNTS.bank,
    paymentFeeAccount: SPECIAL_ACCOUNTS.stripeFee,
    platformFeeAccount: SPECIAL_ACCOUNTS.platformFee,
    teamFundAccount: SPECIAL_ACCOUNTS.lagkassa,
    vatOutputAccount: SPECIAL_ACCOUNTS.vatOutput,
  };

  try {
    const chartSnap = await db
      .collection("clubs")
      .doc(clubId)
      .collection("chartOfAccounts")
      .get();

    if (chartSnap.empty) return FALLBACK;

    const accounts = chartSnap.docs.map((d) => d.data() as ChartAccount);

    const find = (id: string) =>
      accounts.find((a) => a.id === id && a.isActive);

    const revenueEntry = feeCategory
      ? accounts.find((a) => a.categoryMapping === feeCategory && a.isActive)
      : find("other_revenue");

    return {
      revenueAccount:
        revenueEntry?.number ??
        find("other_revenue")?.number ??
        FALLBACK.revenueAccount,
      bankAccount: find("bank")?.number ?? FALLBACK.bankAccount,
      paymentFeeAccount:
        find("payment_fee")?.number ?? FALLBACK.paymentFeeAccount,
      platformFeeAccount:
        find("platform_fee")?.number ?? FALLBACK.platformFeeAccount,
      teamFundAccount: find("team_fund")?.number ?? FALLBACK.teamFundAccount,
      vatOutputAccount: find("vat_output")?.number ?? FALLBACK.vatOutputAccount,
    };
  } catch (e) {
    console.warn(
      "resolveClubAccountNumbers: could not read chart, using defaults:",
      e,
    );
    return FALLBACK;
  }
}

// ─── Cloud Function: getChartOfAccounts ──────────────────────────────────────

/**
 * Get the chart of accounts and accounting settings for a club.
 * SECURITY: Only club admins may access.
 */
export const getChartOfAccounts = onCall(
  { region: config.region },
  async (
    request,
  ): Promise<{
    success: boolean;
    settings: Record<string, unknown>;
    accounts: ChartAccount[];
    categories: ChartAccount[];
  }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId } = request.data;
    if (!clubId || typeof clubId !== "string") {
      throw new HttpsError("invalid-argument", "clubId is required");
    }

    const db = admin.firestore();

    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!userDoc.exists) throw new HttpsError("not-found", "User not found");

    const clubAccess: any[] = userDoc.data()?.clubAccess || [];
    const access = clubAccess.find((a: any) => a.clubId === clubId);
    if (!access || access.role !== "club-admin") {
      throw new HttpsError("permission-denied", "Club admin access required");
    }

    const settingsDoc = await db
      .collection("clubs")
      .doc(clubId)
      .collection("accountingConfig")
      .doc("settings")
      .get();

    const settings: Record<string, unknown> = settingsDoc.exists
      ? settingsDoc.data()!
      : {};

    const accountsSnap = await db
      .collection("clubs")
      .doc(clubId)
      .collection("chartOfAccounts")
      .orderBy("number", "asc")
      .get();

    const accounts: ChartAccount[] = accountsSnap.docs.map(
      (d) => d.data() as ChartAccount,
    );

    // If no chart exists yet (old club), seed it now on-demand
    if (accounts.length === 0) {
      const clubDoc = await db.collection("clubs").doc(clubId).get();
      const country = clubDoc.data()?.country ?? "SE";
      await seedClubAccountingConfig(db, clubId, country);
      const seededSnap = await db
        .collection("clubs")
        .doc(clubId)
        .collection("chartOfAccounts")
        .orderBy("number", "asc")
        .get();
      const seededAccounts = seededSnap.docs.map(
        (d) => d.data() as ChartAccount,
      );
      return {
        success: true,
        settings: { country },
        accounts: seededAccounts,
        categories: seededAccounts.filter(
          (a) => a.isActive && a.categoryMapping !== null,
        ),
      };
    }

    return {
      success: true,
      settings,
      accounts,
      categories: accounts.filter(
        (a) => a.isActive && a.categoryMapping !== null,
      ),
    };
  },
);

// ─── Cloud Function: updateChartAccount ──────────────────────────────────────

/**
 * Update a single account entry in the club's chart of accounts.
 *
 * Allowed field updates:
 *   - number, name, isActive — all accounts
 *   - vatRate, taxExempt     — non-system accounts only
 *   - type, categoryMapping  — immutable (set by Clubnizer)
 *
 * The bank account cannot be deactivated.
 * SECURITY: Only club admins may update.
 */
export const updateChartAccount = onCall(
  { region: config.region },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, accountId, updates } = request.data;

    if (!clubId || typeof clubId !== "string") {
      throw new HttpsError("invalid-argument", "clubId is required");
    }
    if (!accountId || typeof accountId !== "string") {
      throw new HttpsError("invalid-argument", "accountId is required");
    }
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      throw new HttpsError("invalid-argument", "updates must be an object");
    }

    const db = admin.firestore();

    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!userDoc.exists) throw new HttpsError("not-found", "User not found");

    const clubAccess: any[] = userDoc.data()?.clubAccess || [];
    const access = clubAccess.find((a: any) => a.clubId === clubId);
    if (!access || access.role !== "club-admin") {
      throw new HttpsError("permission-denied", "Club admin access required");
    }

    const accountRef = db
      .collection("clubs")
      .doc(clubId)
      .collection("chartOfAccounts")
      .doc(accountId);

    const accountDoc = await accountRef.get();
    if (!accountDoc.exists) {
      throw new HttpsError("not-found", "Account not found");
    }

    const existing = accountDoc.data() as ChartAccount;
    const allowedUpdate: Partial<ChartAccount> = {};

    if (typeof updates.number === "number") {
      if (updates.number < 1 || updates.number > 99999) {
        throw new HttpsError(
          "invalid-argument",
          "Account number must be between 1 and 99999",
        );
      }
      allowedUpdate.number = updates.number;
    }

    if (typeof updates.name === "string") {
      const trimmed = updates.name.trim();
      if (!trimmed) {
        throw new HttpsError(
          "invalid-argument",
          "Account name cannot be empty",
        );
      }
      allowedUpdate.name = trimmed;
    }

    if (typeof updates.isActive === "boolean") {
      if (existing.id === "bank" && updates.isActive === false) {
        throw new HttpsError(
          "invalid-argument",
          "The bank account cannot be deactivated",
        );
      }
      allowedUpdate.isActive = updates.isActive;
    }

    // vatRate and taxExempt: only on non-system accounts
    if (!existing.isSystem) {
      if (typeof updates.vatRate === "number") {
        if (
          !Number.isInteger(updates.vatRate) ||
          updates.vatRate < 0 ||
          updates.vatRate > 100
        ) {
          throw new HttpsError(
            "invalid-argument",
            "vatRate must be an integer between 0 and 100",
          );
        }
        allowedUpdate.vatRate = updates.vatRate;
      }
      if (typeof updates.taxExempt === "boolean") {
        allowedUpdate.taxExempt = updates.taxExempt;
      }
    }

    if (Object.keys(allowedUpdate).length === 0) {
      throw new HttpsError("invalid-argument", "No valid fields to update");
    }

    await accountRef.update(allowedUpdate as Record<string, unknown>);
    return { success: true };
  },
);

// ─── Cloud Function: createCustomFeeCategory ─────────────────────────────────

/**
 * Create a custom fee category for a club.
 * Generates a slug from the supplied label, creates a Revenue ChartAccount doc,
 * and optionally marks the category as earmarkable.
 * SECURITY: Only club admins may create custom categories.
 */
export const createCustomFeeCategory = onCall(
  { region: config.region },
  async (request): Promise<{ success: boolean; categoryKey: string }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, label, accountNumber, vatRate, taxExempt, isEarmarkable } =
      request.data;

    if (!clubId || typeof clubId !== "string") {
      throw new HttpsError("invalid-argument", "clubId is required");
    }
    if (!label || typeof label !== "string" || !label.trim()) {
      throw new HttpsError("invalid-argument", "label is required");
    }
    if (
      typeof accountNumber !== "number" ||
      accountNumber < 1 ||
      accountNumber > 99999
    ) {
      throw new HttpsError(
        "invalid-argument",
        "accountNumber must be between 1 and 99999",
      );
    }
    if (
      typeof vatRate !== "number" ||
      !Number.isInteger(vatRate) ||
      vatRate < 0 ||
      vatRate > 100
    ) {
      throw new HttpsError(
        "invalid-argument",
        "vatRate must be an integer between 0 and 100",
      );
    }
    if (typeof taxExempt !== "boolean") {
      throw new HttpsError("invalid-argument", "taxExempt must be a boolean");
    }

    const db = admin.firestore();

    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!userDoc.exists) throw new HttpsError("not-found", "User not found");
    const clubAccess: any[] = userDoc.data()?.clubAccess || [];
    const access = clubAccess.find((a: any) => a.clubId === clubId);
    if (!access || access.role !== "club-admin") {
      throw new HttpsError("permission-denied", "Club admin access required");
    }

    // Generate a slug from the label
    const slug = label
      .trim()
      .toLowerCase()
      .replace(/[åä]/g, "a")
      .replace(/ö/g, "o")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 40);

    if (!slug) {
      throw new HttpsError(
        "invalid-argument",
        "Label must contain at least one alphanumeric character",
      );
    }

    // Check uniqueness within this club's chart
    const chartSnap = await db
      .collection("clubs")
      .doc(clubId)
      .collection("chartOfAccounts")
      .get();

    const existing = chartSnap.docs.map((d) => d.data() as ChartAccount);
    const duplicateMapping = existing.find((a) => a.categoryMapping === slug);
    if (duplicateMapping) {
      if (duplicateMapping.isSystem) {
        throw new HttpsError(
          "already-exists",
          `A system category with key "${slug}" already exists and cannot be replaced`,
        );
      }
      if (duplicateMapping.isActive) {
        throw new HttpsError(
          "already-exists",
          `A category with key "${slug}" already exists in this club's chart`,
        );
      }
      // Soft-deleted custom category — re-activate with the new values
      const accountRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("chartOfAccounts")
        .doc(slug);
      await accountRef.set({
        id: slug,
        number: accountNumber,
        name: label.trim(),
        type: "Revenue",
        vatRate,
        taxExempt,
        categoryMapping: slug,
        isActive: true,
        isSystem: false,
      } as ChartAccount);
      return { success: true, categoryKey: slug };
    }
    const duplicateNumber = existing.find(
      (a) => a.number === accountNumber && a.isActive,
    );
    if (duplicateNumber) {
      throw new HttpsError(
        "already-exists",
        `Account number ${accountNumber} is already in use`,
      );
    }

    const newAccount: ChartAccount = {
      id: slug,
      number: accountNumber,
      name: label.trim(),
      type: "Revenue",
      vatRate,
      taxExempt,
      categoryMapping: slug,
      isActive: true,
      isSystem: false,
    };

    const accountRef = db
      .collection("clubs")
      .doc(clubId)
      .collection("chartOfAccounts")
      .doc(slug);

    await accountRef.set(newAccount);

    // If earmarkable, persist in accountingConfig/settings
    if (isEarmarkable === true) {
      const settingsRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("accountingConfig")
        .doc("settings");
      const settingsDoc = await settingsRef.get();
      const currentEarmarkable: string[] =
        settingsDoc.data()?.earmarkableCategories ?? [];
      if (!currentEarmarkable.includes(slug)) {
        await settingsRef.set(
          { earmarkableCategories: [...currentEarmarkable, slug] },
          { merge: true },
        );
      }
    }

    return { success: true, categoryKey: slug };
  },
);

// ─── Cloud Function: deleteCustomFeeCategory ─────────────────────────────────

/**
 * Soft-delete a custom (non-system) fee category by setting isActive = false.
 * SECURITY: Only club admins may delete custom categories.
 */
export const deleteCustomFeeCategory = onCall(
  { region: config.region },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, categoryKey } = request.data;

    if (!clubId || typeof clubId !== "string") {
      throw new HttpsError("invalid-argument", "clubId is required");
    }
    if (!categoryKey || typeof categoryKey !== "string") {
      throw new HttpsError("invalid-argument", "categoryKey is required");
    }

    const db = admin.firestore();

    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!userDoc.exists) throw new HttpsError("not-found", "User not found");
    const clubAccess: any[] = userDoc.data()?.clubAccess || [];
    const access = clubAccess.find((a: any) => a.clubId === clubId);
    if (!access || access.role !== "club-admin") {
      throw new HttpsError("permission-denied", "Club admin access required");
    }

    const accountRef = db
      .collection("clubs")
      .doc(clubId)
      .collection("chartOfAccounts")
      .doc(categoryKey);

    const accountDoc = await accountRef.get();
    if (!accountDoc.exists) {
      throw new HttpsError("not-found", "Category not found");
    }

    const account = accountDoc.data() as ChartAccount;

    if (account.isSystem) {
      throw new HttpsError(
        "failed-precondition",
        "System categories cannot be deleted",
      );
    }

    await accountRef.update({ isActive: false });
    return { success: true };
  },
);
