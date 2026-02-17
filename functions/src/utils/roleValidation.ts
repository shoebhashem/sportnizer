/**
 * Role Validation Utilities
 *
 * Centralized role validation for member management operations.
 * All roles must be validated before being assigned to prevent invalid data.
 */

import * as admin from "firebase-admin";

// ============================================================================
// VALID ROLES DEFINITIONS
// ============================================================================

/**
 * Valid roles for group member lists
 * These are the roles that can be assigned to members within a specific group
 */
export const VALID_GROUP_ROLES = [
  "player",
  "player-underage",
  "coach",
  "admin",
] as const;

/**
 * Valid roles for club member lists
 * These include all group roles plus club-specific and guardian roles
 */
export const VALID_CLUB_ROLES = [
  "player",
  "player-underage",
  "coach",
  "admin",
  "guardian", // Only for guardians of youth players (accumulates)
  "club-admin", // Club-level administrators
] as const;

// TypeScript types derived from the constants
export type GroupRole = (typeof VALID_GROUP_ROLES)[number];
export type ClubRole = (typeof VALID_CLUB_ROLES)[number];

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate if a role is valid for group member lists
 *
 * @param role - Role to validate
 * @returns true if valid, false otherwise
 */
export function isValidGroupRole(role: string): role is GroupRole {
  return VALID_GROUP_ROLES.includes(role as GroupRole);
}

/**
 * Validate if a role is valid for club member lists
 *
 * @param role - Role to validate
 * @returns true if valid, false otherwise
 */
export function isValidClubRole(role: string): role is ClubRole {
  return VALID_CLUB_ROLES.includes(role as ClubRole);
}

/**
 * Validate and throw error if role is invalid for group context
 *
 * @param role - Role to validate
 * @param context - Context string for error message (e.g., "invitation", "update")
 * @throws Error if role is invalid
 */
export function validateGroupRole(
  role: string | undefined,
  context: string = "operation",
): asserts role is GroupRole {
  if (!role) {
    throw new Error(`Role is required for ${context}`);
  }

  if (!isValidGroupRole(role)) {
    console.error(
      `❌ Invalid group role in ${context}: "${role}". Valid roles: [${VALID_GROUP_ROLES.join(", ")}]`,
    );
    throw new Error(
      `Invalid group role: "${role}". Valid group roles are: ${VALID_GROUP_ROLES.join(", ")}`,
    );
  }
}

/**
 * Validate and throw error if role is invalid for club context
 *
 * @param role - Role to validate
 * @param context - Context string for error message
 * @throws Error if role is invalid
 */
export function validateClubRole(
  role: string | undefined,
  context: string = "operation",
): asserts role is ClubRole {
  if (!role) {
    throw new Error(`Role is required for ${context}`);
  }

  if (!isValidClubRole(role)) {
    console.error(
      `❌ Invalid club role in ${context}: "${role}". Valid roles: [${VALID_CLUB_ROLES.join(", ")}]`,
    );
    throw new Error(
      `Invalid club role: "${role}". Valid club roles are: ${VALID_CLUB_ROLES.join(", ")}`,
    );
  }
}

// ============================================================================
// ROLE TYPE DETECTION
// ============================================================================

/**
 * Check if a role is a youth role (requires youth-specific handling)
 *
 * @param role - Role to check
 * @returns true if role is for youth members
 */
export function isYouthRole(role: string): boolean {
  return role === "player-underage";
}

/**
 * Check if a role is a guardian role
 *
 * @param role - Role to check
 * @returns true if role is guardian
 */
export function isGuardianRole(role: string): boolean {
  return role === "guardian";
}

/**
 * Check if a role requires special handling (youth or guardian)
 *
 * @param role - Role to check
 * @returns true if role requires special logic
 */
export function requiresSpecialHandling(role: string): boolean {
  return isYouthRole(role) || isGuardianRole(role);
}

// ============================================================================
// ROLE FORMATTING
// ============================================================================

/**
 * Get human-readable role name for display
 *
 * @param role - Role to format
 * @returns Formatted role name
 */
export function formatRoleName(role: string): string {
  const roleMap: Record<string, string> = {
    player: "Player",
    "player-underage": "Youth Player",
    coach: "Coach",
    admin: "Administrator",
    guardian: "Guardian",
    "club-admin": "Club Administrator",
  };

  return roleMap[role] || role;
}

/**
 * Get role description for notifications
 *
 * @param role - Role to describe
 * @returns Role description
 */
export function getRoleDescription(role: string): string {
  const descriptionMap: Record<string, string> = {
    player: "as a player",
    "player-underage": "as a youth player",
    coach: "as a coach",
    admin: "as an administrator",
    guardian: "as a guardian",
    "club-admin": "as a club administrator",
  };

  return descriptionMap[role] || `with role ${role}`;
}

// ============================================================================
// PERMISSION CHECKS
// ============================================================================

/**
 * Check if a user has club-admin role for a specific club.
 * Reads the user's document and checks `clubAccess` array for a matching
 * entry with `role === 'club-admin'`.
 *
 * @param userId - Firebase Auth UID of the user
 * @param clubId - Club ID to check admin access for
 * @returns true if the user is a club-admin for the given club
 */
export async function isClubAdmin(
  userId: string,
  clubId: string,
): Promise<boolean> {
  const db = admin.firestore();
  const userDoc = await db.collection("users").doc(userId).get();

  if (!userDoc.exists) {
    return false;
  }

  const userData = userDoc.data();
  const clubAccess = userData?.clubAccess;

  if (!Array.isArray(clubAccess)) {
    return false;
  }

  return clubAccess.some(
    (entry: { clubId?: string; role?: string }) =>
      entry.clubId === clubId && entry.role === "club-admin",
  );
}
