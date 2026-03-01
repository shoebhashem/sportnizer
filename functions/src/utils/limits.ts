/**
 * Usage Limits & Subscription System Utilities
 *
 * This module defines resource limits for different subscription tiers and provides
 * validation functions for enforcing these limits across the application.
 *
 * IMPORTANT: Member limits are enforced at the CLUB level, not group level.
 * Clubs can have unlimited groups (maxGroups: 99) but total members across
 * all groups are counted against the club's subscription tier limit.
 *
 * @see ARCHITECTURE.md - "Usage Limits & Subscription System" section
 * @see config/subscriptionConfig.ts - Stripe price IDs and tier configuration
 */

import {
    getMaxMembersForTier,
    SubscriptionTier,
    UPGRADE_WARNING_THRESHOLD,
} from "../config/subscriptionConfig";

// Re-export subscription types for convenience
export { SubscriptionTier } from "../config/subscriptionConfig";

// ============================================================================
// SUBSCRIPTION TIER DEFINITIONS
// ============================================================================

export interface ResourceLimits {
  maxClubsAsAdmin: number; // -1 means unlimited
  maxGroups: number; // -1 means unlimited (effectively 99)
  maxMembers: number; // -1 means unlimited, NOW AT CLUB LEVEL
}

/**
 * Free Tier - Default for all new clubs
 * Up to 50 members total in the club
 */
export const DEFAULT_LIMITS: ResourceLimits = {
  maxClubsAsAdmin: 1, // Can only create/admin 1 club
  maxGroups: 99, // Essentially unlimited groups
  maxMembers: 50, // Up to 50 members total in club (was 30 per group)
};

/**
 * Basic Tier - For growing clubs
 * Up to 500 members total in the club
 * Price: €29/month or 299 SEK/NOK or 199 DKK
 */
export const BASIC_LIMITS: ResourceLimits = {
  maxClubsAsAdmin: 1, // Still 1 club per user
  maxGroups: 99, // Essentially unlimited groups
  maxMembers: 500, // Up to 500 members total in club
};

/**
 * Pro Tier - For large clubs
 * Up to 2000 members total in the club
 * Price: €49/month or 549 SEK/NOK or 399 DKK
 */
export const PRO_LIMITS: ResourceLimits = {
  maxClubsAsAdmin: 1, // Still 1 club per user
  maxGroups: 99, // Essentially unlimited groups
  maxMembers: 2000, // Up to 2000 members total in club
};

/**
 * Enterprise Tier - For organizations with 2000+ members
 * Custom pricing, contact support@clubnizer.com
 */
export const ENTERPRISE_LIMITS: ResourceLimits = {
  maxClubsAsAdmin: -1, // Unlimited clubs (negotiable)
  maxGroups: -1, // Unlimited groups
  maxMembers: -1, // Unlimited members
};

// Legacy alias for backward compatibility
export const PREMIUM_LIMITS = BASIC_LIMITS;

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export interface LimitCheckResult {
  allowed: boolean;
  message: string;
  currentCount?: number;
  maxLimit?: number;
}

/**
 * Generic resource limit checker
 *
 * @param currentCount - Current usage count (e.g., activeClubsAsAdmin)
 * @param maxLimit - Maximum allowed (e.g., maxClubsAsAdmin)
 * @param resourceName - Human-readable resource name for error message
 * @param action - Action being attempted ('create' or 'reactivate')
 * @returns LimitCheckResult with allowed status and message
 */
export function checkResourceLimit(
  currentCount: number,
  maxLimit: number,
  resourceName: string,
  action: "create" | "reactivate" = "create",
): LimitCheckResult {
  // Handle unlimited tier (-1)
  if (maxLimit === -1) {
    return {
      allowed: true,
      message: "",
      currentCount,
      maxLimit,
    };
  }

  // Check if limit is reached
  if (currentCount >= maxLimit) {
    const actionVerb = action === "create" ? "create" : "reactivate";
    const additionalHint =
      action === "reactivate"
        ? " Please delete an active resource first or contact support@clubnizer.com to upgrade."
        : " Please contact support@clubnizer.com to upgrade your plan.";

    return {
      allowed: false,
      message: `Cannot ${actionVerb} ${resourceName}. You have reached your limit of ${maxLimit} active resource(s).${additionalHint}`,
      currentCount,
      maxLimit,
    };
  }

  // Limit not reached - allowed
  return {
    allowed: true,
    message: "",
    currentCount,
    maxLimit,
  };
}

/**
 * Check if user can create/reactivate a club
 *
 * @param activeClubsAsAdmin - Current count of active clubs where user is admin
 * @param maxClubsAsAdmin - Maximum clubs allowed (default: 1)
 * @param action - Whether this is creation or reactivation
 * @returns LimitCheckResult
 */
export function checkClubLimit(
  activeClubsAsAdmin: number,
  maxClubsAsAdmin: number = DEFAULT_LIMITS.maxClubsAsAdmin,
  action: "create" | "reactivate" = "create",
): LimitCheckResult {
  return checkResourceLimit(
    activeClubsAsAdmin,
    maxClubsAsAdmin,
    "club",
    action,
  );
}

/**
 * Check if club can create/reactivate a group
 *
 * IMPORTANT: Reactivation must check the same limit as creation to prevent
 * circumventing limits by soft-deleting and reactivating groups.
 *
 * Example scenario:
 * - activeGroupCount = 19, maxGroups = 20
 * - Creating new group: allowed (19 + 1 = 20)
 * - Reactivating deleted group: BLOCKED (would make it 21)
 *
 * @param activeGroupCount - Current count of active groups in club
 * @param maxGroups - Maximum groups allowed (default: 10)
 * @param action - Whether this is creation or reactivation
 * @returns LimitCheckResult
 */
export function checkGroupLimit(
  activeGroupCount: number,
  maxGroups: number = DEFAULT_LIMITS.maxGroups,
  action: "create" | "reactivate" = "create",
): LimitCheckResult {
  return checkResourceLimit(activeGroupCount, maxGroups, "group", action);
}

/**
 * Check if group can add a member
 *
 * DEPRECATED: Use checkClubMemberLimit instead.
 * Member limits are now enforced at the CLUB level, not group level.
 * This function is kept for backward compatibility but should not be used.
 *
 * @param memberCount - Current member count (ignored, use club totalCounts)
 * @param maxMembers - Maximum members allowed (ignored, use club subscription tier)
 * @returns LimitCheckResult - Always returns allowed: true
 * @deprecated Use checkClubMemberLimit instead
 */
export function checkMemberLimit(
  memberCount: number,
  maxMembers: number = DEFAULT_LIMITS.maxMembers,
): LimitCheckResult {
  // DEPRECATED: Group-level member limits are no longer enforced
  // Member limits are now at the club level based on subscription tier
  // This always returns allowed for backward compatibility
  // TODO: Remove this function after updating all callers
  console.warn(
    "checkMemberLimit is deprecated. Use checkClubMemberLimit instead.",
  );
  return {
    allowed: true,
    message: "",
    currentCount: memberCount,
    maxLimit: maxMembers,
  };
}

/**
 * Check if club can add a member based on subscription tier
 *
 * This is the NEW function that enforces member limits at the CLUB level.
 * Uses club.totalCounts and club.subscription.tier to determine limits.
 *
 * @param clubTotalMembers - Current total member count in the club (club.totalCounts)
 * @param tier - Club's subscription tier (club.subscription.tier)
 * @returns LimitCheckResult with allowed status and upgrade message
 */
export function checkClubMemberLimit(
  clubTotalMembers: number,
  tier: SubscriptionTier = "free",
): LimitCheckResult {
  const maxMembers = getMaxMembersForTier(tier);

  // Handle unlimited tier (-1)
  if (maxMembers === -1) {
    return {
      allowed: true,
      message: "",
      currentCount: clubTotalMembers,
      maxLimit: maxMembers,
    };
  }

  // Check if limit is reached
  if (clubTotalMembers >= maxMembers) {
    let upgradeMessage: string;

    if (tier === "free") {
      upgradeMessage = `Your club has reached its limit of ${maxMembers} members. Upgrade to Basic (up to 500 members) to continue adding members.`;
    } else if (tier === "basic") {
      upgradeMessage = `Your club has reached its limit of ${maxMembers} members. Upgrade to Pro (up to 2000 members) to continue adding members.`;
    } else if (tier === "pro") {
      upgradeMessage = `Your club has reached its limit of ${maxMembers} members. Contact support@clubnizer.com for an Enterprise plan.`;
    } else {
      upgradeMessage = `Your club has reached its member limit. Contact support@clubnizer.com to upgrade.`;
    }

    return {
      allowed: false,
      message: upgradeMessage,
      currentCount: clubTotalMembers,
      maxLimit: maxMembers,
    };
  }

  // Limit not reached - allowed
  return {
    allowed: true,
    message: "",
    currentCount: clubTotalMembers,
    maxLimit: maxMembers,
  };
}

// ============================================================================
// SUBSCRIPTION TIER HELPERS
// ============================================================================

/**
 * Get limits for a subscription tier
 *
 * @param tier - Subscription tier
 * @returns ResourceLimits for that tier
 */
export function getLimitsForTier(tier: SubscriptionTier): ResourceLimits {
  switch (tier) {
    case "basic":
      return BASIC_LIMITS;
    case "pro":
      return PRO_LIMITS;
    case "enterprise":
      return ENTERPRISE_LIMITS;
    case "free":
    default:
      return DEFAULT_LIMITS;
  }
}

/**
 * Get club's subscription tier from club document
 *
 * @param clubData - Club document data with subscription field
 * @returns Subscription tier (defaults to 'free' if not set)
 */
export function getClubSubscriptionTier(
  clubData: { subscription?: { tier?: SubscriptionTier } } | null,
): SubscriptionTier {
  return clubData?.subscription?.tier || "free";
}

// ============================================================================
// ERROR MESSAGE TEMPLATES
// ============================================================================

/**
 * Standard error messages for different limit scenarios
 */
export const LIMIT_ERROR_MESSAGES = {
  CLUB_LIMIT_REACHED: (maxClubs: number) =>
    `You have reached your limit of ${maxClubs} active club(s). Contact support@clubnizer.com to upgrade.`,

  GROUP_LIMIT_REACHED: (maxGroups: number) =>
    `This club has reached its limit of ${maxGroups} active groups. Contact support@clubnizer.com to upgrade.`,

  /**
   * Member limit reached - now at CLUB level
   * @deprecated Use CLUB_MEMBER_LIMIT_REACHED instead for clarity
   */
  MEMBER_LIMIT_REACHED: (maxMembers: number) =>
    `This club has reached its limit of ${maxMembers} members. Upgrade your subscription to add more members.`,

  /**
   * Club-level member limit reached (preferred)
   */
  CLUB_MEMBER_LIMIT_REACHED: (maxMembers: number, tier: SubscriptionTier) => {
    if (tier === "free") {
      return `Your club has reached its Free tier limit of ${maxMembers} members. Upgrade to Basic to add up to 500 members.`;
    } else if (tier === "basic") {
      return `Your club has reached its Basic tier limit of ${maxMembers} members. Upgrade to Pro to add up to 2000 members.`;
    } else if (tier === "pro") {
      return `Your club has reached its Pro tier limit of ${maxMembers} members. Contact support@clubnizer.com for Enterprise pricing.`;
    }
    return `Your club has reached its member limit. Contact support@clubnizer.com to upgrade.`;
  },

  REACTIVATION_BLOCKED: (resourceType: string, maxLimit: number) =>
    `Cannot reactivate ${resourceType}. Maximum of ${maxLimit} active resources reached. ` +
    `Please delete an active ${resourceType} first or contact support@clubnizer.com.`,

  SUBSCRIPTION_REQUIRED: () =>
    "This feature requires an active subscription. Please upgrade your plan.",

  PAYMENT_OVERDUE: () =>
    "Your subscription payment is overdue. Please update your payment method to continue using premium features.",
};

// ============================================================================
// USAGE TRACKING HELPERS
// ============================================================================

/**
 * Calculate usage percentage (useful for showing warnings)
 *
 * @param currentCount - Current usage
 * @param maxLimit - Maximum allowed
 * @returns Percentage (0-100), or 0 if unlimited
 */
export function calculateUsagePercentage(
  currentCount: number,
  maxLimit: number,
): number {
  if (maxLimit === -1) return 0; // Unlimited tier
  if (maxLimit === 0) return 100; // Edge case
  return Math.round((currentCount / maxLimit) * 100);
}

/**
 * Check if user should be warned about approaching limit (80% threshold)
 *
 * @param currentCount - Current usage
 * @param maxLimit - Maximum allowed
 * @returns true if usage >= 80%
 */
export function shouldWarnAboutLimit(
  currentCount: number,
  maxLimit: number,
): boolean {
  if (maxLimit === -1) return false; // Unlimited tier
  return currentCount >= maxLimit * UPGRADE_WARNING_THRESHOLD;
}

/**
 * Check if club should show upgrade warning based on member count
 *
 * @param clubTotalMembers - Total members in the club (club.totalCounts)
 * @param tier - Club's subscription tier
 * @returns Object with warning status and details
 */
export function getClubUpgradeWarning(
  clubTotalMembers: number,
  tier: SubscriptionTier,
): { shouldWarn: boolean; percentage: number; message: string } {
  const maxMembers = getMaxMembersForTier(tier);

  // No warning for unlimited tier
  if (maxMembers === -1) {
    return { shouldWarn: false, percentage: 0, message: "" };
  }

  const percentage = calculateUsagePercentage(clubTotalMembers, maxMembers);
  const shouldWarn = percentage >= UPGRADE_WARNING_THRESHOLD * 100;

  if (!shouldWarn) {
    return { shouldWarn: false, percentage, message: "" };
  }

  let upgradeMessage: string;
  if (tier === "free") {
    upgradeMessage = `You're using ${percentage}% of your Free plan (${clubTotalMembers}/${maxMembers} members). Upgrade to Basic for up to 500 members.`;
  } else if (tier === "basic") {
    upgradeMessage = `You're using ${percentage}% of your Basic plan (${clubTotalMembers}/${maxMembers} members). Upgrade to Pro for up to 2000 members.`;
  } else if (tier === "pro") {
    upgradeMessage = `You're using ${percentage}% of your Pro plan (${clubTotalMembers}/${maxMembers} members). Contact us for Enterprise options.`;
  } else {
    upgradeMessage = `You're using ${percentage}% of your plan capacity.`;
  }

  return { shouldWarn: true, percentage, message: upgradeMessage };
}
