// /utils/permissionHelpers.ts — Pure synchronous role / permission checks
//
// All functions operate on the live `userProfile` from UserContext.
// Because UserContext is now a real-time listener, these answers are always
// up-to-date without any additional fetches.

import type { UserProfile } from "../services/types/user";

// ---------------------------------------------------------------------------
// Club-level helpers
// ---------------------------------------------------------------------------

/** True when the user has the "club-admin" role for the given club. */
export function isClubAdmin(
  userProfile: UserProfile | null | undefined,
  clubId: string,
): boolean {
  if (!userProfile?.clubAccess) return false;
  return userProfile.clubAccess.some(
    (ca) =>
      ca.clubId === clubId && ca.role === "club-admin" && ca.isActive !== false,
  );
}

/** Alias for isClubAdmin — may grow to include more roles in the future. */
export function canManageClub(
  userProfile: UserProfile | null | undefined,
  clubId: string,
): boolean {
  return isClubAdmin(userProfile, clubId);
}

/** Returns the user's club-level role, or null if they're not a member. */
export function getUserClubRole(
  userProfile: UserProfile | null | undefined,
  clubId: string,
): "club-admin" | "member" | null {
  if (!userProfile?.clubAccess) return null;
  const ca = userProfile.clubAccess.find(
    (c) => c.clubId === clubId && c.isActive !== false,
  );
  return ca?.role ?? null;
}

// ---------------------------------------------------------------------------
// Group-level helpers
// ---------------------------------------------------------------------------

/** Returns the user's roles array for a specific group, or []. */
export function getGroupRoles(
  userProfile: UserProfile | null | undefined,
  clubId: string,
  groupId: string,
): string[] {
  if (!userProfile?.clubAccess) return [];
  const ca = userProfile.clubAccess.find(
    (c) => c.clubId === clubId && c.isActive !== false,
  );
  if (!ca?.groupAccess) return [];
  const ga = ca.groupAccess.find(
    (g) => g.groupId === groupId && g.isActive !== false,
  );
  return ga?.roles ?? [];
}

/**
 * True when the user can manage the group (add/remove members, edit settings).
 * Club admins implicitly can manage any group in their club.
 */
export function canManageGroup(
  userProfile: UserProfile | null | undefined,
  clubId: string,
  groupId: string,
): boolean {
  if (isClubAdmin(userProfile, clubId)) return true;
  const roles = getGroupRoles(userProfile, clubId, groupId);
  return roles.some((r) => r === "admin" || r === "coach");
}

/** True when the user has any role in the given group, OR is a club-admin. */
export function isGroupMember(
  userProfile: UserProfile | null | undefined,
  clubId: string,
  groupId: string,
): boolean {
  if (isClubAdmin(userProfile, clubId)) return true;
  return getGroupRoles(userProfile, clubId, groupId).length > 0;
}

// ---------------------------------------------------------------------------
// Aggregate helpers
// ---------------------------------------------------------------------------

/**
 * Returns the most privileged role the user holds within a club.
 * Checks club-level role first, then all group roles.
 */
export function getHighestRole(
  userProfile: UserProfile | null | undefined,
  clubId: string,
):
  | "club-admin"
  | "admin"
  | "coach"
  | "player"
  | "player-underage"
  | "guardian"
  | "member"
  | null {
  if (!userProfile?.clubAccess) return null;
  const ca = userProfile.clubAccess.find(
    (c) => c.clubId === clubId && c.isActive !== false,
  );
  if (!ca) return null;
  if (ca.role === "club-admin") return "club-admin";

  // Collect all group roles and return the highest
  const allRoles = new Set(
    (ca.groupAccess || []).flatMap((ga) => ga.roles ?? []),
  );
  if (allRoles.has("admin")) return "admin";
  if (allRoles.has("coach")) return "coach";
  if (allRoles.has("player")) return "player";
  if (allRoles.has("player-underage")) return "player-underage";
  if (allRoles.has("guardian")) return "guardian";
  return "member";
}

/**
 * Returns all active club IDs the user is a member of.
 */
export function getActiveClubIds(
  userProfile: UserProfile | null | undefined,
): string[] {
  if (!userProfile?.clubAccess) return [];
  return userProfile.clubAccess
    .filter((ca) => ca.isActive !== false)
    .map((ca) => ca.clubId);
}

/**
 * Returns all active group entries for a given club.
 */
export function getActiveGroups(
  userProfile: UserProfile | null | undefined,
  clubId: string,
): { groupId: string; groupName: string; roles: string[] }[] {
  if (!userProfile?.clubAccess) return [];
  const ca = userProfile.clubAccess.find(
    (c) => c.clubId === clubId && c.isActive !== false,
  );
  if (!ca?.groupAccess) return [];
  return ca.groupAccess
    .filter((ga) => ga.isActive !== false)
    .map((ga) => ({
      groupId: ga.groupId,
      groupName: ga.groupName,
      roles: ga.roles ?? [],
    }));
}
