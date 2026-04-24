/**
 * BAS account mapping for Swedish sports associations (Idrottens BAS-kontoplan).
 * Based on Riksidrottsförbundet's standard chart of accounts.
 *
 * IMPORTANT: Account codes are resolved server-side only. Never trust client-sent account codes.
 */

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

/**
 * BAS account mapping per country.
 * Currently Sweden only. Future: add NO, FI, DK etc.
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

/** Special-purpose accounts (not category-mapped, but used in verification lines). */
export const SPECIAL_ACCOUNTS = {
  bank: 1930, // Club bank account (Stripe inbound)
  stripeFee: 6570, // Bank/payment fees
  lagkassa: 2071, // Team fund (earmarked money)
} as const;

/**
 * Resolve the BAS account number for a fee category and country.
 * Falls back to the "other" account (3890) if not found.
 */
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
