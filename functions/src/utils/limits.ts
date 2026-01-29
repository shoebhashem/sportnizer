/**
 * Usage Limits & Subscription System Utilities
 * 
 * This module defines resource limits for different subscription tiers and provides
 * validation functions for enforcing these limits across the application.
 * 
 * @see ARCHITECTURE.md - "Usage Limits & Subscription System" section
 */

// ============================================================================
// SUBSCRIPTION TIER DEFINITIONS
// ============================================================================

export interface ResourceLimits {
  maxClubsAsAdmin: number;  // -1 means unlimited
  maxGroups: number;        // -1 means unlimited
  maxMembers: number;       // -1 means unlimited
}

/**
 * Free Tier - Default for all new users
 * Designed for individual coaches, small teams, or trial users
 */
export const DEFAULT_LIMITS: ResourceLimits = {
  maxClubsAsAdmin: 1,   // Can only create/admin 1 club
  maxGroups: 10,        // Up to 10 groups per club
  maxMembers: 30,       // Up to 30 members per group
};

/**
 * Premium Tier - For growing organizations (PLANNED)
 * Suitable for multi-sport clubs or larger coaching staff
 */
export const PREMIUM_LIMITS: ResourceLimits = {
  maxClubsAsAdmin: 3,   // Can admin up to 3 clubs
  maxGroups: 50,        // Up to 50 groups per club
  maxMembers: 100,      // Up to 100 members per group
};

/**
 * Enterprise Tier - For large organizations (PLANNED)
 * Professional sports organizations, large schools, etc.
 */
export const ENTERPRISE_LIMITS: ResourceLimits = {
  maxClubsAsAdmin: -1,  // Unlimited clubs
  maxGroups: -1,        // Unlimited groups
  maxMembers: -1,       // Unlimited members
};

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
  action: 'create' | 'reactivate' = 'create'
): LimitCheckResult {
  // Handle unlimited tier (-1)
  if (maxLimit === -1) {
    return { 
      allowed: true, 
      message: '',
      currentCount,
      maxLimit
    };
  }

  // Check if limit is reached
  if (currentCount >= maxLimit) {
    const actionVerb = action === 'create' ? 'create' : 'reactivate';
    const additionalHint = action === 'reactivate' 
      ? ' Please delete an active resource first or contact support@sportnizer.com to upgrade.'
      : ' Please contact support@sportnizer.com to upgrade your plan.';

    return {
      allowed: false,
      message: `Cannot ${actionVerb} ${resourceName}. You have reached your limit of ${maxLimit} active resource(s).${additionalHint}`,
      currentCount,
      maxLimit
    };
  }

  // Limit not reached - allowed
  return { 
    allowed: true, 
    message: '',
    currentCount,
    maxLimit
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
  action: 'create' | 'reactivate' = 'create'
): LimitCheckResult {
  return checkResourceLimit(
    activeClubsAsAdmin,
    maxClubsAsAdmin,
    'club',
    action
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
  action: 'create' | 'reactivate' = 'create'
): LimitCheckResult {
  return checkResourceLimit(
    activeGroupCount,
    maxGroups,
    'group',
    action
  );
}

/**
 * Check if group can add a member
 * 
 * Note: Members don't have isActive field, so no reactivation scenario.
 * Once removed, re-adding is treated as a new addition.
 * 
 * @param memberCount - Current member count in group
 * @param maxMembers - Maximum members allowed (default: 30)
 * @returns LimitCheckResult
 */
export function checkMemberLimit(
  memberCount: number,
  maxMembers: number = DEFAULT_LIMITS.maxMembers
): LimitCheckResult {
  return checkResourceLimit(
    memberCount,
    maxMembers,
    'member',
    'create'
  );
}

// ============================================================================
// SUBSCRIPTION TIER HELPERS (FUTURE USE)
// ============================================================================

export type SubscriptionTier = 'free' | 'premium' | 'enterprise';

/**
 * Get limits for a subscription tier
 * 
 * @param tier - Subscription tier
 * @returns ResourceLimits for that tier
 */
export function getLimitsForTier(tier: SubscriptionTier): ResourceLimits {
  switch (tier) {
    case 'premium':
      return PREMIUM_LIMITS;
    case 'enterprise':
      return ENTERPRISE_LIMITS;
    case 'free':
    default:
      return DEFAULT_LIMITS;
  }
}

/**
 * Future: Get user's subscription tier from their document or Stripe
 * 
 * @param userId - User ID to check
 * @returns Subscription tier (currently always 'free')
 */
export async function getUserSubscriptionTier(userId: string): Promise<SubscriptionTier> {
  // TODO: Implement when subscription system is ready
  // - Check Firestore user document for subscriptionTier field
  // - Or check Stripe API for active subscription
  // - Or check Firebase custom claims
  
  return 'free'; // All users are free tier for now
}

// ============================================================================
// ERROR MESSAGE TEMPLATES
// ============================================================================

/**
 * Standard error messages for different limit scenarios
 */
export const LIMIT_ERROR_MESSAGES = {
  CLUB_LIMIT_REACHED: (maxClubs: number) =>
    `You have reached your limit of ${maxClubs} active club(s). Contact support@sportnizer.com to upgrade.`,
  
  GROUP_LIMIT_REACHED: (maxGroups: number) =>
    `This club has reached its limit of ${maxGroups} active groups. Contact support@sportnizer.com to upgrade.`,
  
  MEMBER_LIMIT_REACHED: (maxMembers: number) =>
    `This group has reached its limit of ${maxMembers} members. Contact support@sportnizer.com to upgrade.`,
  
  REACTIVATION_BLOCKED: (resourceType: string, maxLimit: number) =>
    `Cannot reactivate ${resourceType}. Maximum of ${maxLimit} active resources reached. ` +
    `Please delete an active ${resourceType} first or contact support@sportnizer.com.`,
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
export function calculateUsagePercentage(currentCount: number, maxLimit: number): number {
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
export function shouldWarnAboutLimit(currentCount: number, maxLimit: number): boolean {
  if (maxLimit === -1) return false; // Unlimited tier
  return currentCount >= (maxLimit * 0.8);
}
