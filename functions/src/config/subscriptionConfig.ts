/**
 * Subscription Configuration
 *
 * This file contains all configuration for the Clubnizer subscription system.
 *
 * NOTE: Subscriptions are currently PARKED. The app is 100% free.
 * All clubs get up to 1500 members. If a club needs more,
 * they should contact support@clubnizer.com.
 *
 * The tier definitions and Stripe price IDs are preserved for potential
 * future reactivation.
 *
 * IMPORTANT: This is separate from Stripe Connect (clubs receiving payments from members).
 * Stripe Connect (membership fees) remains fully active.
 *
 * @see ARCHITECTURE.md - "Usage Limits & Subscription System" section
 */

// ============================================================================
// SUBSCRIPTION TIERS
// ============================================================================

export type SubscriptionTier = "free" | "basic" | "pro" | "enterprise";
export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "cancelled"
  | "trialing";
export type SupportedCurrency = "eur" | "sek" | "nok" | "dkk";

/**
 * Subscription tier configuration
 */
export interface TierConfig {
  name: string;
  maxMembers: number; // -1 means unlimited
  maxGroups: number; // -1 means unlimited
  description: string;
}

export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, TierConfig> = {
  free: {
    name: "Free",
    maxMembers: 1500,
    maxGroups: 99,
    description: "Free for all clubs — up to 1,500 members",
  },
  // NOTE: The tiers below are PARKED. All clubs use the free tier.
  // These are preserved for potential future reactivation.
  basic: {
    name: "Basic",
    maxMembers: 1500,
    maxGroups: 99,
    description: "(Parked) For growing clubs with up to 500 members",
  },
  pro: {
    name: "Pro",
    maxMembers: 1500,
    maxGroups: 99,
    description: "(Parked) For large clubs with up to 2000 members",
  },
  enterprise: {
    name: "Enterprise",
    maxMembers: -1, // Unlimited
    maxGroups: -1, // Unlimited
    description: "Custom solution — contact support@clubnizer.com",
  },
};

// ============================================================================
// STRIPE PRICE IDS (TEST MODE)
// ============================================================================

/**
 * Stripe Price IDs for each tier and currency
 *
 * To switch between test and live mode:
 * 1. Comment out the active block and uncomment the other
 * 2. Update Firebase secrets accordingly (see .secret.local for test keys)
 */

// ---- LIVE MODE price IDs (created 2026-03-09) ----
// Basic product: prod_U7FpZxAwiJ2qch (Clubnizer Basic)
// Pro product:   prod_U7ImEkT7GDwXLP (Clubnizer Pro)
export const STRIPE_PRICE_IDS = {
  basic: {
    sek: "price_1T948lCAhuJjwfXTAAHz7QsY",
    nok: "price_1T94A8CAhuJjwfXTdI92HWFO",
    dkk: "price_1T94AhCAhuJjwfXTtDiIX8M0",
    eur: "price_1T94B5CAhuJjwfXTPuvoDp6P",
  },
  pro: {
    sek: "price_1T94BoCAhuJjwfXTQkpXty4m",
    nok: "price_1T94ByCAhuJjwfXTEtaOwPHa",
    dkk: "price_1T94C6CAhuJjwfXTdv2vQ8lt",
    eur: "price_1T94CKCAhuJjwfXTAvnDkA9K",
  },
} as const;

// ---- TEST MODE price IDs ----
// To use: comment out the LIVE block above and uncomment this block
// export const STRIPE_PRICE_IDS = {
//   basic: {
//     sek: "price_1T3yb5C7tKPlBo5y5fJVJQPM",
//     nok: "price_1T3zRGC7tKPlBo5yDn7VPVig",
//     dkk: "price_1T3zRGC7tKPlBo5yEjtlvf9o",
//     eur: "price_1T3zRGC7tKPlBo5y3y4wTkjF",
//   },
//   pro: {
//     sek: "price_1T3yf2C7tKPlBo5yf859iboF",
//     eur: "price_1T3zZDC7tKPlBo5yEOQc2V7H",
//     nok: "price_1T3zZDC7tKPlBo5yhrJCPJ6W",
//     dkk: "price_1T3zZDC7tKPlBo5y6vuMWZf1",
//   },
// } as const;

/**
 * Display prices for UI (in smallest currency unit: öre/cents)
 */
export const SUBSCRIPTION_PRICES = {
  basic: {
    sek: 29900, // 299.00 SEK
    nok: 29900, // 299.00 NOK
    dkk: 19900, // 199.00 DKK
    eur: 2900, // 29.00 EUR
  },
  pro: {
    sek: 54900, // 549.00 SEK
    nok: 54900, // 549.00 NOK
    dkk: 39900, // 399.00 DKK
    eur: 4900, // 49.00 EUR
  },
} as const;

// ============================================================================
// COUNTRY TO CURRENCY MAPPING
// ============================================================================

/**
 * Maps country codes to their default currency
 * This prevents currency arbitrage (Swedish clubs can't pay in DKK)
 */
export const COUNTRY_CURRENCY_MAP: Record<string, SupportedCurrency> = {
  // Nordic countries with their own currencies
  SE: "sek", // Sweden
  NO: "nok", // Norway
  DK: "dkk", // Denmark

  // Eurozone countries
  DE: "eur", // Germany
  ES: "eur", // Spain
  FR: "eur", // France
  IT: "eur", // Italy
  NL: "eur", // Netherlands
  BE: "eur", // Belgium
  AT: "eur", // Austria
  FI: "eur", // Finland
  IE: "eur", // Ireland
  PT: "eur", // Portugal
  GR: "eur", // Greece
  LU: "eur", // Luxembourg

  // Default for unlisted countries
  DEFAULT: "eur",
};

/**
 * Get the appropriate currency for a country
 */
export function getCurrencyForCountry(countryCode: string): SupportedCurrency {
  return (
    COUNTRY_CURRENCY_MAP[countryCode?.toUpperCase()] ||
    COUNTRY_CURRENCY_MAP.DEFAULT
  );
}

/**
 * Get the Stripe Price ID for a given tier and country
 */
export function getPriceIdForSubscription(
  tier: "basic" | "pro",
  countryCode: string,
): string {
  const currency = getCurrencyForCountry(countryCode);
  return STRIPE_PRICE_IDS[tier][currency];
}

// ============================================================================
// GRACE PERIOD CONFIGURATION
// ============================================================================

/**
 * Grace period in days after payment failure before restricting access
 */
export const PAYMENT_GRACE_PERIOD_DAYS = 14;

/**
 * Warning threshold - show upgrade prompt when usage reaches this percentage
 */
export const UPGRADE_WARNING_THRESHOLD = 0.8; // 80%

// ============================================================================
// SUBSCRIPTION DATA STRUCTURE (for Firestore)
// ============================================================================

/**
 * Subscription data stored in clubs/{clubId}.subscription
 */
export interface ClubSubscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodStart: FirebaseFirestore.Timestamp | null;
  currentPeriodEnd: FirebaseFirestore.Timestamp | null;
  cancelAtPeriodEnd: boolean;
  paymentFailedAt: FirebaseFirestore.Timestamp | null;
}

/**
 * Default subscription for new clubs (free tier)
 */
export const DEFAULT_SUBSCRIPTION: ClubSubscription = {
  tier: "free",
  status: "active",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  stripePriceId: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  paymentFailedAt: null,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get max members allowed for a subscription tier
 */
export function getMaxMembersForTier(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS[tier].maxMembers;
}

/**
 * Get max groups allowed for a subscription tier
 */
export function getMaxGroupsForTier(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS[tier].maxGroups;
}

/**
 * Determine required tier based on member count
 * NOTE: Subscriptions are parked. All clubs are "free" tier with 1500 limit.
 */
export function getRequiredTierForMemberCount(
  memberCount: number,
): SubscriptionTier {
  if (memberCount <= 1500) return "free";
  return "enterprise";
}

/**
 * Check if a club can add more members based on their subscription
 * NOTE: Subscriptions are parked. All clubs get 1500 members.
 */
export function canAddMember(
  currentMemberCount: number,
  tier: SubscriptionTier,
): { allowed: boolean; message: string; upgradeRequired?: SubscriptionTier } {
  const maxMembers = getMaxMembersForTier(tier);

  // Unlimited tier
  if (maxMembers === -1) {
    return { allowed: true, message: "" };
  }

  if (currentMemberCount >= maxMembers) {
    return {
      allowed: false,
      message: `Your club has reached its limit of ${maxMembers} members. Please contact support@clubnizer.com to request a higher limit.`,
    };
  }

  return { allowed: true, message: "" };
}

/**
 * Check if club should show upgrade warning (at 80% capacity)
 */
export function shouldShowUpgradeWarning(
  currentMemberCount: number,
  tier: SubscriptionTier,
): boolean {
  const maxMembers = getMaxMembersForTier(tier);

  // No warning for unlimited tier
  if (maxMembers === -1) return false;

  return currentMemberCount >= maxMembers * UPGRADE_WARNING_THRESHOLD;
}

/**
 * Check if subscription is in grace period (payment failed but still within 14 days)
 */
export function isInGracePeriod(subscription: ClubSubscription): boolean {
  if (subscription.status !== "past_due" || !subscription.paymentFailedAt) {
    return false;
  }

  const paymentFailedDate = subscription.paymentFailedAt.toDate();
  const gracePeriodEnd = new Date(paymentFailedDate);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + PAYMENT_GRACE_PERIOD_DAYS);

  return new Date() < gracePeriodEnd;
}

/**
 * Check if subscription access should be restricted (past grace period)
 */
export function isAccessRestricted(subscription: ClubSubscription): boolean {
  if (subscription.status === "cancelled") {
    return true;
  }

  if (subscription.status === "past_due" && !isInGracePeriod(subscription)) {
    return true;
  }

  return false;
}
