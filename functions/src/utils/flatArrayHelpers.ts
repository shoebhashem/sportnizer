/**
 * /functions/src/utils/flatArrayHelpers.ts
 *
 * Shared helpers that derive flat role arrays from a clubAccess[] array.
 * Every Cloud Function that mutates clubAccess on a user document should also
 * write the flat arrays so that Firestore security rules can cheaply verify
 * permissions with a single cached document read.
 *
 * Flat arrays derivable from clubAccess[].groupAccess[].roles:
 *   adminOfClubs   – clubIds where role === "club-admin" & isActive !== false
 *   memberOfClubs  – clubIds where role === "member"     & isActive !== false
 *   adminOfGroups  – groupIds where roles includes "admin"
 *   coachOfGroups  – groupIds where roles includes "coach"
 *   memberOfGroups – ALL groupIds where the user has any role
 *
 * NOT derivable from clubAccess — managed separately via atomic arrayUnion/arrayRemove:
 *   guardianOfGroups – set by addGuardianToYouth / updateGuardianDependentAccess,
 *                      removed by removeGuardianFromYouth / removeGuardianOfGroupField.
 *                      NEVER written by flatArrayFieldsFromClubAccess() to prevent
 *                      accidental overwrites when a guardian also holds a player/coach role.
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
 * Fields returned by flatArrayFieldsFromClubAccess — intentionally excludes
 * guardianOfGroups, which is owned by the guardian enrollment flow and must
 * never be overwritten by a clubAccess rebuild.
 */
export type ClubAccessFlatArrayFields = Omit<
  FlatRoleArrays,
  "guardianOfGroups"
>;

/**
 * Returns flat role arrays as a plain object ready to spread into a
 * Firestore update() call:
 *
 *   await userRef.update({
 *     clubAccess,
 *     ...flatArrayFieldsFromClubAccess(clubAccess),
 *   });
 *
 * guardianOfGroups is deliberately excluded — it is written atomically by
 * the guardian enrollment / removal flows and must not be overwritten here.
 * Any caller using set() (e.g. new-user creation) must add guardianOfGroups: []
 * explicitly alongside this call.
 */
export function flatArrayFieldsFromClubAccess(
  clubAccess: any[] | undefined | null,
): ClubAccessFlatArrayFields {
  const { guardianOfGroups: _omitted, ...rest } =
    buildFlatArraysFromClubAccess(clubAccess);
  return rest;
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
 * Only writes guardianOfGroups — guardians are NOT added to memberOfGroups
 * (they access groups via the guardianOfGroups check in security rules).
 */
export function addGuardianOfGroupField(groupId: string) {
  return {
    guardianOfGroups: FieldValue.arrayUnion(groupId),
  };
}

/**
 * Returns FieldValue operations to REMOVE a guardian group entry.
 * Only removes from guardianOfGroups.
 */
export function removeGuardianOfGroupField(groupId: string) {
  return {
    guardianOfGroups: FieldValue.arrayRemove(groupId),
  };
}

/**
 * Collects all unique groupIds across all dependents' clubAccess.
 * Used when removing a guardian or youth to determine which groupIds
 * are safe to remove from guardianOfGroups (i.e., not needed by other dependents).
 */
export function collectDependentGroupIds(
  dependents: any[],
  excludeYouthUid?: string,
): Set<string> {
  const groupIds = new Set<string>();
  for (const dep of dependents) {
    if (excludeYouthUid && dep.uid === excludeYouthUid) continue;
    const clubAccess = dep.clubAccess || [];
    for (const ca of clubAccess) {
      if (ca.isActive === false) continue;
      for (const ga of ca.groupAccess || []) {
        if (ga.isActive === false) continue;
        groupIds.add(ga.groupId);
      }
    }
  }
  return groupIds;
}
