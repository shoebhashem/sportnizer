/**
 * Subscription Configuration
 *
 * This file contains all configuration for the Clubnizer subscription system.
 * Clubs subscribe to Clubnizer to access premium features and higher member limits.
 *
 * IMPORTANT: This is separate from Stripe Connect (clubs receiving payments from members).
 * This handles: Clubs → Clubnizer payments (platform subscription)
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
    maxMembers: 50,
    maxGroups: 99,
    description: "Perfect for small teams and getting started",
  },
  basic: {
    name: "Basic",
    maxMembers: 500,
    maxGroups: 99,
    description: "For growing clubs with up to 500 members",
  },
  pro: {
    name: "Pro",
    maxMembers: 2000,
    maxGroups: 99,
    description: "For large clubs with up to 2000 members",
  },
  enterprise: {
    name: "Enterprise",
    maxMembers: -1, // Unlimited
    maxGroups: -1, // Unlimited
    description: "Custom solution for organizations with 2000+ members",
  },
};

// ============================================================================
// STRIPE PRICE IDS (TEST MODE)
// ============================================================================

/**
 * Stripe Price IDs for each tier and currency
 *
 * NOTE: These are TEST MODE price IDs.
 * Replace with LIVE MODE price IDs before production deployment.
 *
 * To switch to live mode:
 * 1. Create the same products/prices in Stripe live mode
 * 2. Update these IDs with the live price IDs
 * 3. Update Firebase functions config with live Stripe keys
 */
export const STRIPE_PRICE_IDS = {
  basic: {
    sek: "price_1T3yb5C7tKPlBo5y5fJVJQPM",
    nok: "price_1T3zRGC7tKPlBo5yDn7VPVig",
    dkk: "price_1T3zRGC7tKPlBo5yEjtlvf9o",
    eur: "price_1T3zRGC7tKPlBo5y3y4wTkjF",
  },
  pro: {
    sek: "price_1T3yf2C7tKPlBo5yf859iboF",
    eur: "price_1T3zZDC7tKPlBo5yEOQc2V7H",
    nok: "price_1T3zZDC7tKPlBo5yhrJCPJ6W",
    dkk: "price_1T3zZDC7tKPlBo5y6vuMWZf1",
  },
} as const;

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
 */
export function getRequiredTierForMemberCount(
  memberCount: number,
): SubscriptionTier {
  if (memberCount <= 50) return "free";
  if (memberCount <= 500) return "basic";
  if (memberCount <= 2000) return "pro";
  return "enterprise";
}

/**
 * Check if a club can add more members based on their subscription
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
    const requiredTier = getRequiredTierForMemberCount(currentMemberCount + 1);
    return {
      allowed: false,
      message: `Your club has reached its limit of ${maxMembers} members. Upgrade to ${SUBSCRIPTION_TIERS[requiredTier].name} to add more members.`,
      upgradeRequired: requiredTier,
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
