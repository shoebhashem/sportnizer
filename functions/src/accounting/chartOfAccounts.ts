import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
    BAS_ACCOUNT_MAP,
    ChartAccount,
    FeeCategory,
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
}> {
  const FALLBACK = {
    revenueAccount:
      feeCategory &&
      BAS_ACCOUNT_MAP["SE"][feeCategory as FeeCategory] !== undefined
        ? BAS_ACCOUNT_MAP["SE"][feeCategory as FeeCategory]
        : 3890,
    bankAccount: SPECIAL_ACCOUNTS.bank,
    paymentFeeAccount: SPECIAL_ACCOUNTS.stripeFee,
    platformFeeAccount: SPECIAL_ACCOUNTS.platformFee,
    teamFundAccount: SPECIAL_ACCOUNTS.lagkassa,
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
      return {
        success: true,
        settings: { country },
        accounts: seededSnap.docs.map((d) => d.data() as ChartAccount),
      };
    }

    return { success: true, settings, accounts };
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
        if (![0, 6, 12, 25].includes(updates.vatRate)) {
          throw new HttpsError(
            "invalid-argument",
            "vatRate must be 0, 6, 12, or 25",
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
