/**
 * Accounting configuration: types, default charts, and BAS account mapping.
 *
 * THREE-LAYER ARCHITECTURE:
 *   Product layer  — fee categories (FeeCategory + FEE_CATEGORIES)
 *   Mapping layer  — chart of accounts per club (ChartAccount + getDefaultChartForCountry)
 *   Ledger layer   — double-entry verifications (used by verificationService)
 *
 * IMPORTANT: Account codes are resolved server-side only. Never trust client-sent account codes.
 */

// ─── Product layer ────────────────────────────────────────────────────────────

export const FEE_CATEGORIES = [
  "membership_fee",
  "training_fee",
  "event_fee",
  "sponsorship",
  "sales_kiosk",
  "other",
] as const;

/**
 * FeeCategory is an open string type — custom categories created by club admins are
 * stored as slugs in the Firestore chart and are valid FeeCategory values at runtime.
 * Use SYSTEM_FEE_CATEGORY_KEYS to enumerate the built-in system categories.
 */
export type FeeCategory = string;
export const SYSTEM_FEE_CATEGORY_KEYS = FEE_CATEGORIES;

/** Category display labels per locale. Frontend reads category key; labels are in i18n. */
export const FEE_CATEGORY_LABELS: Record<string, string> = {
  membership_fee: "Medlemsavgift",
  training_fee: "Träningsavgift / Sektionsavgift",
  event_fee: "Läger- & Cupavgift",
  sponsorship: "Sponsring",
  sales_kiosk: "Försäljning / Kiosk",
  other: "Övrigt",
};

/** System default categories that support earmarking for a specific group (lagkassa). */
export const EARMARKABLE_CATEGORIES: string[] = ["sales_kiosk", "other"];

// ─── Mapping layer ────────────────────────────────────────────────────────────

/** Accounting category type — used to compute P&L and balance sheet. */
export type AccountType =
  | "Asset"
  | "Liability"
  | "Equity"
  | "Revenue"
  | "Expense";

/**
 * A single entry in a club's chart of accounts.
 * Stored per club in Firestore: clubs/{clubId}/chartOfAccounts/{id}
 */
export interface ChartAccount {
  /** Stable ID used as the Firestore document ID (e.g. "bank", "membership") */
  id: string;
  /** Account number in the club's numbering system (e.g. 3010) — editable by admin */
  number: number;
  /** Human-readable account name — editable by admin */
  name: string;
  /** Accounting type for P&L and balance sheet calculations */
  type: AccountType;
  /**
   * VAT rate in percent: 0, 6, 12, or 25.
   * 0 = zero-rated. Distinct from taxExempt (which is outside VAT scope entirely).
   */
  vatRate: number;
  /**
   * True if this account is explicitly VAT-exempt (e.g. membership fees for non-profit).
   * Different from vatRate: 0 — exempt means the transaction is outside the VAT scope.
   */
  taxExempt: boolean;
  /**
   * Links this account to a fee category for automatic journal entry creation.
   * null for system accounts (bank, payment fee, team fund).
   */
  categoryMapping: string | null;
  /** Whether this account is active and should be used in new entries */
  isActive: boolean;
  /**
   * System accounts are seeded by Clubnizer and cannot be deleted.
   * Admins may change the number and name, but type/categoryMapping are immutable.
   */
  isSystem: boolean;
}

/**
 * One line in a multi-component fee.
 * Amounts are in the smallest currency unit (öre/cents).
 * Revenue account numbers and VAT figures are snapshotted at fee creation time
 * so that later chart edits never affect historical bookkeeping.
 */
export interface FeeComponent {
  /** Fee category key (slug — matches a ChartAccount.categoryMapping) */
  category: string;
  /** Human-readable label snapshotted from the ChartAccount name at creation time */
  label: string;
  /** Amount in smallest currency unit (öre/cents) */
  amount: number;
  /** Optional admin note for this line */
  note?: string | null;
  /** Revenue account number from the club's chart, resolved at creation time */
  resolvedRevenueAccount: number;
  /** VAT rate in percent (0, 6, 12, 25, …), snapshotted from the chart account */
  vatRate: number;
  /** True if this component is VAT-exempt (outside VAT scope entirely) */
  taxExempt: boolean;
}

/**
 * Build the default chart of accounts for a given country.
 * Returns the full ChartAccount array ready to write to Firestore.
 */
export function getDefaultChartForCountry(countryCode: string): ChartAccount[] {
  const cc = (countryCode ?? "SE").toUpperCase();
  if (cc === "SE") return SE_DEFAULT_CHART;
  if (cc === "NO") return NO_DEFAULT_CHART;
  return GENERIC_CHART;
}

// Sweden — BAS-kontoplan (Riksidrottsförbundet standard for sports clubs)
const SE_DEFAULT_CHART: ChartAccount[] = [
  {
    id: "bank",
    number: 1930,
    name: "Företagskonto / affärskonto",
    type: "Asset",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
  {
    id: "team_fund",
    number: 2071,
    name: "Lagkassa / öronmärkt medel",
    type: "Liability",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
  {
    id: "membership",
    number: 3010,
    name: "Medlemsavgifter",
    type: "Revenue",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: "membership_fee",
    isActive: true,
    isSystem: false,
  },
  {
    id: "training",
    number: 3020,
    name: "Träningsavgifter",
    type: "Revenue",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: "training_fee",
    isActive: true,
    isSystem: false,
  },
  {
    id: "events",
    number: 3030,
    name: "Deltagaravgifter arrangemang",
    type: "Revenue",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: "event_fee",
    isActive: true,
    isSystem: false,
  },
  {
    id: "sponsorship",
    number: 3210,
    name: "Sponsorintäkter",
    type: "Revenue",
    vatRate: 25,
    taxExempt: false,
    categoryMapping: "sponsorship",
    isActive: true,
    isSystem: false,
  },
  {
    id: "sales_kiosk",
    number: 3310,
    name: "Försäljning kiosk / övrigt",
    type: "Revenue",
    vatRate: 25,
    taxExempt: false,
    categoryMapping: "sales_kiosk",
    isActive: true,
    isSystem: false,
  },
  {
    id: "other_revenue",
    number: 3890,
    name: "Övriga intäkter",
    type: "Revenue",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: "other",
    isActive: true,
    isSystem: false,
  },
  {
    id: "payment_fee",
    number: 6570,
    name: "Bankkostnader (Stripe-avgifter)",
    type: "Expense",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
  {
    id: "platform_fee",
    number: 6590,
    name: "Plattformsavgift",
    type: "Expense",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
  {
    id: "vat_output",
    number: 2610,
    name: "Utgående moms",
    type: "Liability",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
];

// Norway — Norsk standard kontoplan (simplified for sports associations)
const NO_DEFAULT_CHART: ChartAccount[] = [
  {
    id: "bank",
    number: 1920,
    name: "Bedriftskonto",
    type: "Asset",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
  {
    id: "team_fund",
    number: 2060,
    name: "Lagkasse",
    type: "Liability",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
  {
    id: "membership",
    number: 3200,
    name: "Medlemskontingent",
    type: "Revenue",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: "membership_fee",
    isActive: true,
    isSystem: false,
  },
  {
    id: "training",
    number: 3220,
    name: "Treningsavgift",
    type: "Revenue",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: "training_fee",
    isActive: true,
    isSystem: false,
  },
  {
    id: "events",
    number: 3240,
    name: "Deltakerkontigent arrangementer",
    type: "Revenue",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: "event_fee",
    isActive: true,
    isSystem: false,
  },
  {
    id: "sponsorship",
    number: 3400,
    name: "Sponsorinntekter",
    type: "Revenue",
    vatRate: 25,
    taxExempt: false,
    categoryMapping: "sponsorship",
    isActive: true,
    isSystem: false,
  },
  {
    id: "sales_kiosk",
    number: 3490,
    name: "Salg kiosk / annet",
    type: "Revenue",
    vatRate: 25,
    taxExempt: false,
    categoryMapping: "sales_kiosk",
    isActive: true,
    isSystem: false,
  },
  {
    id: "other_revenue",
    number: 3990,
    name: "Andre inntekter",
    type: "Revenue",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: "other",
    isActive: true,
    isSystem: false,
  },
  {
    id: "payment_fee",
    number: 6995,
    name: "Bankgebyrer (betalingsavgifter)",
    type: "Expense",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
  {
    id: "platform_fee",
    number: 6996,
    name: "Plattformgebyr",
    type: "Expense",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
  {
    id: "vat_output",
    number: 2700,
    name: "Utgående merverdiavgift",
    type: "Liability",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
];

// Generic / EU — neutral numbering, clubs can customise to their country
const GENERIC_CHART: ChartAccount[] = [
  {
    id: "bank",
    number: 1200,
    name: "Bank account",
    type: "Asset",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
  {
    id: "team_fund",
    number: 2300,
    name: "Earmarked group fund",
    type: "Liability",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
  {
    id: "membership",
    number: 4010,
    name: "Membership fees",
    type: "Revenue",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: "membership_fee",
    isActive: true,
    isSystem: false,
  },
  {
    id: "training",
    number: 4020,
    name: "Training fees",
    type: "Revenue",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: "training_fee",
    isActive: true,
    isSystem: false,
  },
  {
    id: "events",
    number: 4030,
    name: "Event / camp fees",
    type: "Revenue",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: "event_fee",
    isActive: true,
    isSystem: false,
  },
  {
    id: "sponsorship",
    number: 4210,
    name: "Sponsorship income",
    type: "Revenue",
    vatRate: 20,
    taxExempt: false,
    categoryMapping: "sponsorship",
    isActive: true,
    isSystem: false,
  },
  {
    id: "sales_kiosk",
    number: 4310,
    name: "Kiosk / sales income",
    type: "Revenue",
    vatRate: 20,
    taxExempt: false,
    categoryMapping: "sales_kiosk",
    isActive: true,
    isSystem: false,
  },
  {
    id: "other_revenue",
    number: 4890,
    name: "Other income",
    type: "Revenue",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: "other",
    isActive: true,
    isSystem: false,
  },
  {
    id: "payment_fee",
    number: 6500,
    name: "Bank fees (payment processing)",
    type: "Expense",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
  {
    id: "platform_fee",
    number: 6510,
    name: "Platform fee",
    type: "Expense",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
  {
    id: "vat_output",
    number: 2200,
    name: "Output VAT",
    type: "Liability",
    vatRate: 0,
    taxExempt: true,
    categoryMapping: null,
    isActive: true,
    isSystem: true,
  },
];

// ─── Ledger layer helpers (legacy — kept for backwards compatibility) ─────────

/**
 * Legacy BAS account mapping — used as fallback for clubs without a custom chart.
 * All new clubs get a seeded chart; this map is retained for backwards compatibility.
 */
export const BAS_ACCOUNT_MAP: Record<string, Record<string, number>> = {
  SE: {
    membership_fee: 3010,
    training_fee: 3020,
    event_fee: 3030,
    sponsorship: 3210,
    sales_kiosk: 3310,
    other: 3890,
  },
};

/** Legacy special-purpose accounts — retained for backwards compatibility. */
export const SPECIAL_ACCOUNTS = {
  bank: 1930, // Club bank account (Stripe inbound)
  stripeFee: 6570, // Bank/payment fees
  platformFee: 6590, // Platform service fee (Clubnizer application fee)
  lagkassa: 2071, // Team fund (earmarked money)
  vatOutput: 2610, // Utgående moms / output VAT (BAS 2610 for Sweden)
} as const;

/** Legacy: resolve BAS account from hardcoded map. Kept for backwards compat. */
export function resolveBasAccount(
  category: FeeCategory | string,
  countryCode: string,
): number {
  const countryMap =
    BAS_ACCOUNT_MAP[countryCode?.toUpperCase() ?? "SE"] ??
    BAS_ACCOUNT_MAP["SE"];
  return (countryMap as Record<string, number>)[category] ?? countryMap.other;
}

/** Check if a value is one of the built-in system fee category keys. */
export function isSystemFeeCategory(value: string): boolean {
  return (FEE_CATEGORIES as readonly string[]).includes(value);
}

/** @deprecated Use isSystemFeeCategory or a Firestore chart lookup for custom categories. */
export function isValidFeeCategory(value: string): boolean {
  return isSystemFeeCategory(value);
}
