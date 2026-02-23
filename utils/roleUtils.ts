/**
 * Role-Based Event Listener Utilities
 *
 * Determines whether users need real-time event listeners based on their roles.
 * Follows established architecture patterns:
 * - Uses permissionService for cached permission checks
 * - Uses fetchUserProfile for user data (version-based caching)
 * - No direct Firestore queries
 *
 * Privileged Users (Real-time Listeners):
 * - Club admins (need to monitor all club events)
 * - Group admins/coaches (need to track RSVPs and make decisions)
 *
 * Regular Users (Cache + Pull-to-Refresh):
 * - Players and regular members (just need to see and respond to events)
 */

import { fetchUserProfile } from "@/services/fetchUserAccess";
import { permissionService } from "@/services/permissions";

/**
 * Determines if user needs real-time event listener (privileged user)
 *
 * Privileged users are:
 * - Club admins (role: 'club-admin' in clubAccess)
 * - Group admins (role: 'admin' in any groupAccess)
 * - Group coaches (role: 'coach' in any groupAccess)
 *
 * @param userId - User's Firebase UID
 * @param clubId - Club ID to check privileges for
 * @returns Promise<boolean> - true if user needs real-time listener
 *
 * @example
 * // In EventContext:
 * const isPrivileged = await isPrivilegedUser(user.uid, selectedClubId);
 * if (isPrivileged) {
 *   attachEventListener(); // Real-time updates
 * } else {
 *   loadEventsFromCache(); // Cache + manual refresh
 * }
 */
export async function isPrivilegedUser(
  userId: string,
  clubId: string,
): Promise<boolean> {
  try {
    // Check 1: Is user a club-admin?
    // Uses permissionService which has 5-minute cache (efficient)
    const isClubAdmin = await permissionService.canManageClub(userId, clubId);
    if (isClubAdmin) {
      console.log(`🎯 Privileged user: ${userId} is club-admin in ${clubId}`);
      return true;
    }

    // Check 2: Does user have admin or coach role in ANY group?
    // Uses fetchUserProfile which has version-based caching (efficient)
    const userProfile = await fetchUserProfile(userId);
    const clubAccess = userProfile.profile?.clubAccess?.find(
      (c) => c.clubId === clubId,
    );

    if (clubAccess?.groupAccess && clubAccess.groupAccess.length > 0) {
      // Check if user has management role in any group
      const hasManagementRole = clubAccess.groupAccess.some(
        (group) =>
          group.roles?.includes("admin") || group.roles?.includes("coach"),
      );

      if (hasManagementRole) {
        console.log(
          `🎯 Privileged user: ${userId} has admin/coach role in club ${clubId}`,
        );
        return true;
      }
    }

    console.log(`👤 Regular user: ${userId} in club ${clubId}`);
    return false;
  } catch (error) {
    console.error("Error checking privileged user status:", error);
    // Default to regular user (safer - uses cache + pull-to-refresh)
    return false;
  }
}

/**
 * Check if user has management role in a specific group
 *
 * @param userId - User's Firebase UID
 * @param clubId - Club ID
 * @param groupId - Group ID to check
 * @returns Promise<boolean> - true if user can manage the group
 *
 * @example
 * const canManage = await hasGroupManagementRole(userId, clubId, groupId);
 * if (canManage) {
 *   // Show admin/coach UI elements
 * }
 */
export async function hasGroupManagementRole(
  userId: string,
  clubId: string,
  groupId: string,
): Promise<boolean> {
  try {
    // Uses permissionService which already has caching and correct logic
    return await permissionService.canManageGroup(userId, clubId, groupId);
  } catch (error) {
    console.error("Error checking group management role:", error);
    return false;
  }
}

/**
 * Get user's role type for telemetry/analytics (optional)
 *
 * @param userId - User's Firebase UID
 * @param clubId - Club ID
 * @returns Promise<'club-admin' | 'admin' | 'coach' | 'player'> - User's highest role
 */
export async function getUserRoleType(
  userId: string,
  clubId: string,
): Promise<"club-admin" | "admin" | "coach" | "player"> {
  try {
    // Check club-admin
    const isClubAdmin = await permissionService.canManageClub(userId, clubId);
    if (isClubAdmin) return "club-admin";

    // Check group roles
    const userProfile = await fetchUserProfile(userId);
    const clubAccess = userProfile.profile?.clubAccess?.find(
      (c) => c.clubId === clubId,
    );

    if (clubAccess?.groupAccess && clubAccess.groupAccess.length > 0) {
      const hasAdminRole = clubAccess.groupAccess.some((g) =>
        g.roles?.includes("admin"),
      );
      if (hasAdminRole) return "admin";

      const hasCoachRole = clubAccess.groupAccess.some((g) =>
        g.roles?.includes("coach"),
      );
      if (hasCoachRole) return "coach";
    }

    return "player";
  } catch (error) {
    console.error("Error getting user role type:", error);
    return "player";
  }
}
