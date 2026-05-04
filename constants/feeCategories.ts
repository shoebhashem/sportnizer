/**
 * Fee category definitions for the frontend.
 * Account codes are intentionally NOT included here — they are server-side only.
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

/** i18n key prefix: components:feeCategory.{key} */
export const FEE_CATEGORY_I18N_KEYS: Record<FeeCategory, string> = {
  membership_fee: "membershipFee",
  training_fee: "trainingFee",
  event_fee: "eventFee",
  sponsorship: "sponsorship",
  sales_kiosk: "salesKiosk",
  other: "other",
};

/** English display labels used as i18n fallbacks (shown before translations load). */
export const FEE_CATEGORY_LABELS: Record<FeeCategory, string> = {
  membership_fee: "Membership Fee",
  training_fee: "Training Fee",
  event_fee: "Event Fee",
  sponsorship: "Sponsorship",
  sales_kiosk: "Kiosk / Sales",
  other: "Other",
};

/**
 * Categories that require the admin to decide if money should be
 * earmarked (öronmärkt) for a specific group's lagkassa.
 */
export const EARMARKABLE_CATEGORIES: FeeCategory[] = ["sales_kiosk", "other"];

export function isEarmarkable(category: FeeCategory): boolean {
  return EARMARKABLE_CATEGORIES.includes(category);
}
