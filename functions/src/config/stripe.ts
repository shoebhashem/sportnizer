/**
 * Stripe Configuration
 *
 * SECURITY: API keys loaded from Firebase environment config
 * Set via:
 *   firebase functions:config:set stripe.secret_key="sk_xxx"
 *   firebase functions:config:set stripe.webhook_secret="whsec_xxx"
 *
 * Or use .env.local for local development:
 *   STRIPE_SECRET_KEY=sk_xxx
 *   STRIPE_WEBHOOK_SECRET=whsec_xxx
 */

export const STRIPE_CONFIG = {
  /**
   * Platform takes 1.5% of each payment
   * This is Clubnizer's commission on every transaction
   */
  platformFeePercent: 1.5,

  /**
   * Default currency (fallback only - each club uses their own based on country)
   */
  defaultCurrency: "sek",

  /**
   * Webhook signature verification tolerance in seconds
   * Stripe recommends 300 seconds (5 minutes) to account for clock skew
   */
  webhookTolerance: 300,

  /**
   * Checkout session expiration in minutes
   * After this time, the checkout session expires and a new one must be created
   */
  checkoutSessionExpireMinutes: 30,

  /**
   * Success and cancel URLs for Stripe Checkout
   * DEPRECATED: Frontend now passes these dynamically
   * These remain as fallbacks only
   */
  successUrl: "https://app.clubnizer.com/payment-success",
  cancelUrl: "https://app.clubnizer.com/payment-cancelled",

  /**
   * Return URL for Stripe Connect onboarding
   * These are fallbacks - frontend should always pass environment-specific URLs
   */
  onboardingReturnUrl: "https://app.clubnizer.com/stripe-return",
  onboardingRefreshUrl: "https://app.clubnizer.com/stripe-refresh",
};

/**
 * Calculate platform fee in smallest currency unit (öre/cents)
 *
 * @param amountInSmallestUnit - Amount in öre/cents (e.g., 150000 = 1500.00 SEK)
 * @returns Platform fee in öre/cents (rounded down to avoid overcharging)
 *
 * @example
 * calculatePlatformFee(150000) // Returns 2250 (22.50 SEK = 1.5% of 1500 SEK)
 */
export function calculatePlatformFee(amountInSmallestUnit: number): number {
  return Math.floor(
    amountInSmallestUnit * (STRIPE_CONFIG.platformFeePercent / 100),
  );
}

/**
 * Validate currency code
 * Only allow currencies we support
 */
export const SUPPORTED_CURRENCIES = [
  "sek", // Swedish Krona
  "nok", // Norwegian Krone
  "dkk", // Danish Krone
  "eur", // Euro
  "gbp", // British Pound
  "usd", // US Dollar
  "chf", // Swiss Franc
  "pln", // Polish Zloty
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(
  currency: string,
): currency is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(
    currency.toLowerCase() as SupportedCurrency,
  );
}

/**
 * Get minimum charge amount for a currency
 * Stripe has minimum charge requirements to cover processing costs
 */
export const MINIMUM_CHARGE_AMOUNTS: Record<SupportedCurrency, number> = {
  sek: 300, // 3.00 SEK
  nok: 300, // 3.00 NOK
  dkk: 250, // 2.50 DKK
  eur: 50, // 0.50 EUR
  gbp: 30, // 0.30 GBP
  usd: 50, // 0.50 USD
  chf: 50, // 0.50 CHF
  pln: 200, // 2.00 PLN
};

export function getMinimumChargeAmount(currency: SupportedCurrency): number {
  return MINIMUM_CHARGE_AMOUNTS[currency] || 50;
}
