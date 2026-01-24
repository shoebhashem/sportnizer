/**
 * TypeScript interfaces for member removal operations
 * 
 * These interfaces define the structure for removal orchestration services
 * that coordinate multiple atomic backend functions.
 */

export interface RemovalResult {
  success: boolean;
  message?: string;
  error?: string;
  details?: {
    dependents?: { uid: string; childName: string }[];
    suggestion?: string;
  };
  clubAdminContacts?: string[];
  removedFrom?: {
    club?: string;
    group?: string;
    groups?: string[];
    subgroups?: string[];
  };
  cleanupActions?: {
    userMarkedInactive: boolean;
    guardiansNotified: number;
  };
}

export interface GuardianDependentStatus {
  success: boolean;
  isYouth: boolean;
  isGuardian: boolean;
  guardians?: {
    guardianUid: string;
    guardianName: string;
    guardianEmail: string;
    relationship: string;
  }[];
  dependentCount?: number;
  dependentsInThisClub?: number;
  dependentIds?: { uid: string; childName: string }[];
  hasOwnMembership?: boolean;
  hasOtherClubs: boolean;
  needsGuardianCleanup?: boolean;
}

export interface GroupMemberships {
  success: boolean;
  groups: string[];
  subgroups: {
    [groupId: string]: string[];
  };
}
