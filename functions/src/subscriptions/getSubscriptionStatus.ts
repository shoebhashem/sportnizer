/**
 * Get Subscription Status
 *
 * Returns the current subscription status for a club, including tier,
 * member usage, and upgrade recommendations.
 */

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
    SUBSCRIPTION_PRICES,
    SUBSCRIPTION_TIERS,
    SubscriptionTier,
    SupportedCurrency,
    getCurrencyForCountry,
    getMaxMembersForTier,
    isAccessRestricted,
    isInGracePeriod,
} from "../config/subscriptionConfig";
import { config } from "../utils/config";
import {
    calculateUsagePercentage,
    getClubUpgradeWarning,
} from "../utils/limits";

interface GetSubscriptionStatusRequest {
  clubId: string;
}

interface SubscriptionStatusResponse {
  success: boolean;
  subscription: {
    tier: SubscriptionTier;
    tierName: string;
    status: string;
    maxMembers: number;
    currentMembers: number;
    usagePercentage: number;
    isAtLimit: boolean;
    upgradeWarning: {
      shouldWarn: boolean;
      message: string;
    };
    gracePeriod: {
      isInGracePeriod: boolean;
      isRestricted: boolean;
    };
    billing: {
      hasSubscription: boolean;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: string | null;
    };
    upgradePrices: {
      basic: Record<SupportedCurrency, number> | null;
      pro: Record<SupportedCurrency, number> | null;
    };
    recommendedCurrency: SupportedCurrency;
  };
  error?: string;
}

export const getSubscriptionStatus = onCall(
  {
    region: config.region,
  },
  async (request): Promise<SubscriptionStatusResponse> => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const { clubId }: GetSubscriptionStatusRequest = request.data;

      if (!clubId) {
        throw new HttpsError(
          "invalid-argument",
          "Missing required field: clubId",
        );
      }

      const userId = request.auth.uid;

      // Get user document to verify access to club
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(userId)
        .get();
      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User profile not found");
      }

      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];
      const userClubAccess = clubAccess.find((c: any) => c.clubId === clubId);

      if (!userClubAccess) {
        throw new HttpsError(
          "permission-denied",
          "You do not have access to this club",
        );
      }

      // Get club document
      const clubDoc = await admin
        .firestore()
        .collection("clubs")
        .doc(clubId)
        .get();

      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      const clubData = clubDoc.data();

      // Get subscription data with defaults
      const subscription = clubData?.subscription || {
        tier: "free" as SubscriptionTier,
        status: "active",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        paymentFailedAt: null,
      };

      const tier: SubscriptionTier = subscription.tier || "free";
      const tierConfig = SUBSCRIPTION_TIERS[tier];
      const maxMembers = getMaxMembersForTier(tier);
      const currentMembers = clubData?.totalCounts || 0;
      const usagePercentage = calculateUsagePercentage(
        currentMembers,
        maxMembers,
      );
      const isAtLimit = maxMembers !== -1 && currentMembers >= maxMembers;

      // Get upgrade warning
      const upgradeWarning = getClubUpgradeWarning(currentMembers, tier);

      // Check grace period status
      const gracePeriodStatus = {
        isInGracePeriod: isInGracePeriod(subscription),
        isRestricted: isAccessRestricted(subscription),
      };

      // Determine recommended currency based on club's country
      const country = clubData?.stripe?.country || "SE";
      const recommendedCurrency = getCurrencyForCountry(country);

      // Build upgrade prices (only show tiers higher than current)
      const upgradePrices: {
        basic: Record<SupportedCurrency, number> | null;
        pro: Record<SupportedCurrency, number> | null;
      } = {
        basic: tier === "free" ? SUBSCRIPTION_PRICES.basic : null,
        pro:
          tier === "free" || tier === "basic" ? SUBSCRIPTION_PRICES.pro : null,
      };

      // Format period end date
      let currentPeriodEnd: string | null = null;
      if (subscription.currentPeriodEnd) {
        const periodEnd = subscription.currentPeriodEnd.toDate
          ? subscription.currentPeriodEnd.toDate()
          : new Date(subscription.currentPeriodEnd);
        currentPeriodEnd = periodEnd.toISOString();
      }

      return {
        success: true,
        subscription: {
          tier,
          tierName: tierConfig.name,
          status: subscription.status,
          maxMembers,
          currentMembers,
          usagePercentage,
          isAtLimit,
          upgradeWarning: {
            shouldWarn: upgradeWarning.shouldWarn,
            message: upgradeWarning.message,
          },
          gracePeriod: gracePeriodStatus,
          billing: {
            hasSubscription: !!subscription.stripeSubscriptionId,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
            currentPeriodEnd,
          },
          upgradePrices,
          recommendedCurrency,
        },
      };
    } catch (error) {
      console.error("Error getting subscription status:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError("internal", "Failed to get subscription status");
    }
  },
);
