// /services/subscriptionService.ts - Club subscription service
// Handles club subscriptions to Clubnizer platform (NOT member payments)

import { getCurrentConfig } from "@/constants/config";
import * as WebBrowser from "expo-web-browser";
import { httpsCallable } from "firebase/functions";
import { Platform } from "react-native";
import { functions } from "./core/firebase";

// Firebase Function references
const createSubscriptionCheckoutFn = httpsCallable(
  functions,
  "createSubscriptionCheckout",
);
const createCustomerPortalSessionFn = httpsCallable(
  functions,
  "createCustomerPortalSession",
);
const getSubscriptionStatusFn = httpsCallable(
  functions,
  "getSubscriptionStatus",
);
const updateSubscriptionFn = httpsCallable(functions, "updateSubscription");

// Types
export type SubscriptionTier = "free" | "basic" | "pro" | "enterprise";
export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "cancelled"
  | "trialing";
export type SupportedCurrency = "eur" | "sek" | "nok" | "dkk";

export interface SubscriptionStatusResult {
  // Current subscription info
  tier: SubscriptionTier;
  tierName: string;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;

  // Limits
  maxMembers: number; // -1 for unlimited
  maxGroups: number; // -1 for unlimited

  // Current usage
  currentMembers: number;
  currentGroups: number;

  // Calculated
  memberUsagePercent: number;
  groupUsagePercent: number;
  canAddMembers: boolean;
  canAddGroups: boolean;
  isNearingLimit: boolean; // true if >= 80%
  membersRemaining: number; // -1 for unlimited

  // Payment status
  isInGracePeriod: boolean;
  gracePeriodEndsAt: Date | null;
  daysUntilGracePeriodEnds: number | null;

  // Billing
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  stripePriceId: string | null;
}

// Subscription tier configuration (mirrors backend)
// NOTE: Subscriptions are PARKED. App is free with 1500 member limit.
export const SUBSCRIPTION_TIERS = {
  free: {
    name: "Free",
    maxMembers: 1500,
    maxGroups: 99,
    description: "Free for all clubs — up to 1,500 members",
  },
  // Parked tiers — kept for future reactivation
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
} as const;

// Display prices (in major currency units for display)
export const SUBSCRIPTION_PRICES = {
  basic: {
    sek: { amount: 299, currency: "SEK", symbol: "kr" },
    nok: { amount: 299, currency: "NOK", symbol: "kr" },
    dkk: { amount: 199, currency: "DKK", symbol: "kr" },
    eur: { amount: 29, currency: "EUR", symbol: "€" },
  },
  pro: {
    sek: { amount: 549, currency: "SEK", symbol: "kr" },
    nok: { amount: 549, currency: "NOK", symbol: "kr" },
    dkk: { amount: 399, currency: "DKK", symbol: "kr" },
    eur: { amount: 49, currency: "EUR", symbol: "€" },
  },
} as const;

// Country to currency mapping
const COUNTRY_CURRENCY_MAP: Record<string, SupportedCurrency> = {
  SE: "sek",
  NO: "nok",
  DK: "dkk",
  // All others default to EUR
};

export const subscriptionService = {
  /**
   * Get the current subscription status for a club
   */
  async getSubscriptionStatus(clubId: string): Promise<{
    success: boolean;
    data?: SubscriptionStatusResult;
    error?: string;
  }> {
    try {
      const result = await getSubscriptionStatusFn({ clubId });
      const data = result.data as any;

      if (!data.success) {
        return {
          success: false,
          error: data.error || "Failed to get subscription status",
        };
      }

      // Extract subscription data from nested response structure
      const sub = data.subscription;

      // Map backend response to frontend SubscriptionStatusResult
      const statusData: SubscriptionStatusResult = {
        // Core subscription info
        tier: sub.tier,
        tierName: sub.tierName,
        status: sub.status,
        cancelAtPeriodEnd: sub.billing?.cancelAtPeriodEnd || false,

        // Limits
        maxMembers: sub.maxMembers,
        maxGroups: -1, // Not tracked currently

        // Current usage
        currentMembers: sub.currentMembers,
        currentGroups: 0, // Not tracked currently

        // Calculated fields
        memberUsagePercent: sub.usagePercentage || 0,
        groupUsagePercent: 0,
        canAddMembers: !sub.isAtLimit,
        canAddGroups: true,
        isNearingLimit: sub.upgradeWarning?.shouldWarn || false,
        membersRemaining:
          sub.maxMembers === -1 ? -1 : sub.maxMembers - sub.currentMembers,

        // Grace period
        isInGracePeriod: sub.gracePeriod?.isInGracePeriod || false,
        gracePeriodEndsAt: null, // Not in current response
        daysUntilGracePeriodEnds: null,

        // Billing
        currentPeriodEnd: sub.billing?.currentPeriodEnd
          ? new Date(sub.billing.currentPeriodEnd)
          : null,
        stripeCustomerId: null, // Not exposed to frontend
        stripePriceId: null, // Not exposed to frontend
      };

      return { success: true, data: statusData };
    } catch (error: any) {
      console.error("Error getting subscription status:", error);
      return {
        success: false,
        error: error.message || "Failed to get subscription status",
      };
    }
  },

  /**
   * Get the appropriate currency for a country
   */
  getCurrencyForCountry(countryCode: string): SupportedCurrency {
    return COUNTRY_CURRENCY_MAP[countryCode?.toUpperCase()] || "eur";
  },

  /**
   * Get display price for a tier in a specific currency
   */
  getDisplayPrice(
    tier: "basic" | "pro",
    currency: SupportedCurrency,
  ): { amount: number; currency: string; symbol: string; formatted: string } {
    const price = SUBSCRIPTION_PRICES[tier][currency];
    const formatted =
      currency === "eur"
        ? `${price.symbol}${price.amount}`
        : `${price.amount} ${price.symbol}`;
    return { ...price, formatted };
  },

  /**
   * Start checkout for upgrading to a paid tier
   */
  async startCheckout(
    clubId: string,
    tier: "basic" | "pro",
    countryCode?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Construct success and cancel URLs based on current environment
      const config = getCurrentConfig();
      const successUrl = `${config.appUrl}/subscription-settings?clubId=${clubId}&success=true`;
      const cancelUrl = `${config.appUrl}/subscription-settings?clubId=${clubId}&cancelled=true`;

      const result = await createSubscriptionCheckoutFn({
        clubId,
        tier,
        countryCode,
        successUrl,
        cancelUrl,
      });

      const data = result.data as any;

      if (!data.success || !data.checkoutUrl) {
        return {
          success: false,
          error: data.error || "Failed to create checkout session",
        };
      }

      // Open Stripe Checkout
      if (Platform.OS === "web") {
        window.location.href = data.checkoutUrl;
        return { success: true };
      } else {
        const browserResult = await WebBrowser.openBrowserAsync(
          data.checkoutUrl,
        );
        // User completed or dismissed the checkout
        return { success: browserResult.type === "opened" };
      }
    } catch (error: any) {
      console.error("Error starting checkout:", error);
      return {
        success: false,
        error: error.message || "Failed to start checkout",
      };
    }
  },

  /**
   * Open the Stripe Customer Portal for billing management
   */
  async openCustomerPortal(
    clubId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const config = getCurrentConfig();
      const returnUrl = `${config.appUrl}/subscription-settings?clubId=${clubId}`;
      const result = await createCustomerPortalSessionFn({ clubId, returnUrl });
      const data = result.data as any;

      if (!data.success || !data.portalUrl) {
        return {
          success: false,
          error: data.error || "Failed to create portal session",
        };
      }

      // Open Stripe Portal in new tab (web) or in-app browser (native)
      if (Platform.OS === "web") {
        window.open(data.portalUrl, "_blank");
        return { success: true };
      } else {
        const browserResult = await WebBrowser.openBrowserAsync(data.portalUrl);
        return { success: browserResult.type === "opened" };
      }
    } catch (error: any) {
      console.error("Error opening customer portal:", error);
      return {
        success: false,
        error: error.message || "Failed to open billing portal",
      };
    }
  },

  /**
   * Upgrade/change an existing subscription to a new tier
   * Uses Stripe's subscription update API with proration
   */
  async upgradeSubscription(
    clubId: string,
    newTier: "basic" | "pro",
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await updateSubscriptionFn({ clubId, newTier });
      const data = result.data as any;

      if (!data.success) {
        return {
          success: false,
          error: data.error || "Failed to update subscription",
        };
      }

      return { success: true };
    } catch (error: any) {
      console.error("Error upgrading subscription:", error);
      return {
        success: false,
        error: error.message || "Failed to upgrade subscription",
      };
    }
  },

  /**
   * Get next tier recommendation based on current usage
   * NOTE: Subscriptions are parked. All clubs are free tier with 1500 limit.
   */
  getRecommendedTier(currentMembers: number): SubscriptionTier {
    if (currentMembers <= 1500) return "free";
    return "enterprise";
  },

  /**
   * Check if an upgrade is needed based on current members
   */
  needsUpgrade(currentTier: SubscriptionTier, currentMembers: number): boolean {
    const tierConfig = SUBSCRIPTION_TIERS[currentTier];
    if (tierConfig.maxMembers === -1) return false; // Unlimited
    return currentMembers >= tierConfig.maxMembers;
  },

  /**
   * Check if approaching limit (80% threshold)
   */
  isNearingLimit(
    currentTier: SubscriptionTier,
    currentMembers: number,
  ): boolean {
    const tierConfig = SUBSCRIPTION_TIERS[currentTier];
    if (tierConfig.maxMembers === -1) return false; // Unlimited
    return currentMembers >= tierConfig.maxMembers * 0.8;
  },
};
