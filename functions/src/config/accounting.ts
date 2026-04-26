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

export type FeeCategory = (typeof FEE_CATEGORIES)[number];

/** Category display labels per locale. Frontend reads category key; labels are in i18n. */
export const FEE_CATEGORY_LABELS: Record<FeeCategory, string> = {
  membership_fee: "Medlemsavgift",
  training_fee: "Träningsavgift / Sektionsavgift",
  event_fee: "Läger- & Cupavgift",
  sponsorship: "Sponsring",
  sales_kiosk: "Försäljning / Kiosk",
  other: "Övrigt",
};

/** Categories that support earmarking for a specific group (lagkassa). */
export const EARMARKABLE_CATEGORIES: FeeCategory[] = ["sales_kiosk", "other"];

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
];

// ─── Ledger layer helpers (legacy — kept for backwards compatibility) ─────────

/**
 * Legacy BAS account mapping — used as fallback for clubs without a custom chart.
 * All new clubs get a seeded chart; this map is retained for backwards compatibility.
 */
export const BAS_ACCOUNT_MAP: Record<string, Record<FeeCategory, number>> = {
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
  lagkassa: 2071, // Team fund (earmarked money)
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

export function isValidFeeCategory(value: string): value is FeeCategory {
  return (FEE_CATEGORIES as readonly string[]).includes(value);
}
