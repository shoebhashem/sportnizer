/**
 * /functions/src/utils/flatArrayHelpers.ts
 *
 * Shared helpers that derive the six flat role arrays from a clubAccess[] array.
 * Every Cloud Function that mutates clubAccess on a user document should also
 * write the flat arrays so that Firestore security rules can cheaply verify
 * permissions with a single cached document read.
 *
 * Flat arrays:
 *   adminOfClubs     – clubIds where role === "club-admin" & isActive !== false
 *   memberOfClubs    – clubIds where role === "member"     & isActive !== false
 *   adminOfGroups    – groupIds where roles includes "admin"
 *   coachOfGroups    – groupIds where roles includes "coach"
 *   memberOfGroups   – ALL groupIds the user has any role in
 *   guardianOfGroups – groupIds where roles includes "guardian"
 */

import { FieldValue } from "firebase-admin/firestore";

// ---- Types (loose, to accept any shape from Firestore raw data) -----------

export interface FlatRoleArrays {
  adminOfClubs: string[];
  memberOfClubs: string[];
  adminOfGroups: string[];
  coachOfGroups: string[];
  memberOfGroups: string[];
  guardianOfGroups: string[];
}

// ---- Core builder --------------------------------------------------------

/**
 * Derive flat role arrays from a full clubAccess array.
 * Only includes entries where isActive !== false (i.e. active or undefined).
 */
export function buildFlatArraysFromClubAccess(
  clubAccess: any[] | undefined | null,
): FlatRoleArrays {
  const result: FlatRoleArrays = {
    adminOfClubs: [],
    memberOfClubs: [],
    adminOfGroups: [],
    coachOfGroups: [],
    memberOfGroups: [],
    guardianOfGroups: [],
  };

  if (!clubAccess || !Array.isArray(clubAccess)) return result;

  for (const ca of clubAccess) {
    // Skip inactive clubs
    if (ca.isActive === false) continue;

    // Club-level role
    if (ca.role === "club-admin") {
      result.adminOfClubs.push(ca.clubId);
    } else if (ca.role === "member") {
      result.memberOfClubs.push(ca.clubId);
    }

    // Group-level roles
    const groups = ca.groupAccess || [];
    for (const ga of groups) {
      // Skip inactive groups
      if (ga.isActive === false) continue;

      const roles: string[] = ga.roles || [];

      // Every active group membership goes into memberOfGroups
      if (roles.length > 0) {
        result.memberOfGroups.push(ga.groupId);
      }

      if (roles.includes("admin")) {
        result.adminOfGroups.push(ga.groupId);
      }
      if (roles.includes("coach")) {
        result.coachOfGroups.push(ga.groupId);
      }
      if (roles.includes("guardian")) {
        result.guardianOfGroups.push(ga.groupId);
      }
    }
  }

  return result;
}

// ---- Convenience: spread into an update object ---------------------------

/**
 * Returns the flat arrays as a plain object ready to spread into a
 * Firestore update() call:
 *
 *   await userRef.update({
 *     clubAccess,
 *     ...flatArrayFieldsFromClubAccess(clubAccess),
 *   });
 */
export function flatArrayFieldsFromClubAccess(
  clubAccess: any[] | undefined | null,
): FlatRoleArrays {
  return buildFlatArraysFromClubAccess(clubAccess);
}

/**
 * Returns empty flat arrays — used when creating a brand-new user doc.
 */
export function emptyFlatArrays(): FlatRoleArrays {
  return {
    adminOfClubs: [],
    memberOfClubs: [],
    adminOfGroups: [],
    coachOfGroups: [],
    memberOfGroups: [],
    guardianOfGroups: [],
  };
}

// ---- Atomic FieldValue helpers for single add / remove -------------------

/**
 * Returns FieldValue operations to ADD a club-admin membership.
 * Useful when you know the exact mutation and want an atomic arrayUnion.
 */
export function addClubAdminFields(clubId: string) {
  return {
    adminOfClubs: FieldValue.arrayUnion(clubId),
  };
}

/**
 * Returns FieldValue operations to ADD a regular member membership.
 */
export function addClubMemberFields(clubId: string) {
  return {
    memberOfClubs: FieldValue.arrayUnion(clubId),
  };
}

/**
 * Returns FieldValue operations to ADD a group membership with specific roles.
 */
export function addGroupMemberFields(groupId: string, roles: string[]) {
  const fields: Record<string, any> = {
    memberOfGroups: FieldValue.arrayUnion(groupId),
  };
  if (roles.includes("admin")) {
    fields.adminOfGroups = FieldValue.arrayUnion(groupId);
  }
  if (roles.includes("coach")) {
    fields.coachOfGroups = FieldValue.arrayUnion(groupId);
  }
  if (roles.includes("guardian")) {
    fields.guardianOfGroups = FieldValue.arrayUnion(groupId);
  }
  return fields;
}

/**
 * Returns FieldValue operations to REMOVE a club membership entirely
 * (removes from both adminOfClubs and memberOfClubs).
 */
export function removeClubFields(clubId: string) {
  return {
    adminOfClubs: FieldValue.arrayRemove(clubId),
    memberOfClubs: FieldValue.arrayRemove(clubId),
  };
}

/**
 * Returns FieldValue operations to REMOVE a group membership entirely.
 */
export function removeGroupFields(groupId: string) {
  return {
    adminOfGroups: FieldValue.arrayRemove(groupId),
    coachOfGroups: FieldValue.arrayRemove(groupId),
    memberOfGroups: FieldValue.arrayRemove(groupId),
    guardianOfGroups: FieldValue.arrayRemove(groupId),
  };
}

/**
 * Returns FieldValue operations to ADD a guardian group entry.
 * Used when linking a guardian to a youth's group.
 */
export function addGuardianOfGroupField(groupId: string) {
  return {
    guardianOfGroups: FieldValue.arrayUnion(groupId),
    memberOfGroups: FieldValue.arrayUnion(groupId),
  };
}

/**
 * Returns FieldValue operations to REMOVE a guardian group entry.
 */
export function removeGuardianOfGroupField(groupId: string) {
  return {
    guardianOfGroups: FieldValue.arrayRemove(groupId),
    memberOfGroups: FieldValue.arrayRemove(groupId),
  };
}
