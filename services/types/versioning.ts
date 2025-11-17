// /services/types/versioning.ts

export interface VersionedData<T> {
  data: T;
  version: number;
  lastModified: Date;
  lastFetched: Date;
}

export interface VersionMetadata {
  version: number;
  lastModified: Date;
}

export interface ClubVersionMetadata extends VersionMetadata {
  clubId: string;
  clubName: string;
}

export interface GroupVersionMetadata extends VersionMetadata {
  groupId: string;
  clubId: string;
  groupName: string;
}

export interface ClubMembersVersionMetadata extends VersionMetadata {
  clubId: string;
  memberCount: number;
}

export interface GroupMembersVersionMetadata extends VersionMetadata {
  groupId: string;
  clubId: string;
  memberCount: number;
}

export interface VersionCheckResult<T> {
  needsUpdate: boolean;
  localVersion: number;
  remoteVersion: number;
  data?: T;
}

export interface FetchResult<T> {
  success: boolean;
  data?: T;
  version?: number;
  error?: string;
}

// Cache storage keys
export const CACHE_KEYS = {
  CLUB_DATA: (clubId: string) => `club_data_${clubId}`,
  CLUB_MEMBERS: (clubId: string) => `club_members_${clubId}`,
  GROUP_DATA: (groupId: string) => `group_data_${groupId}`,
  GROUP_MEMBERS: (groupId: string) => `group_members_${groupId}`,
  EVENT_DATA: (eventId: string) => `event_data_${eventId}`,
  CLUB_EVENTS: (clubId: string) => `club_events_${clubId}`,
  USER_INVITED_EVENTS: (userId: string) => `user_invited_events_${userId}`,
  VERSION_METADATA: 'version_metadata',
} as const;

// Version checking configuration
export const VERSION_CONFIG = {
  CACHE_EXPIRY_HOURS: 24,
  FORCE_REFRESH_INTERVAL_HOURS: 72, // Force refresh even if versions match
  MAX_RETRY_ATTEMPTS: 3,
} as const;
