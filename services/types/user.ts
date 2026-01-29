// ClubMembership and GroupMembership now fetched via versioning services

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  phoneNumber?: string | null;
  dateOfBirth?: Date | null;
  emailVerified?: boolean; // Custom email verification status
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  // Updated to new access-based structure
  clubAccess: ClubAccess[];
  // Subscription limits (usage tracking)
  activeClubsAsAdmin?: number; // Count of clubs where user is admin with isActive=true
  maxClubsAsAdmin?: number; // Maximum clubs user can be admin of (default: 1)
  groupsCreated?: number;
  events: EventInvitation[];
  eventsResponses: any[]; // TODO: Define proper EventResponses type
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  createdAt?: Date;
  lastActive?: Date;
  version?: number; // Version for cache optimization
  // Youth member relationships
  dependents?: DependentInfo[]; // For guardians - list of youth members they manage
  guardians?: GuardianInfo[]; // For youth members - list of guardians
}

// Dependent (youth member) info stored in guardian's document
export interface DependentInfo {
  uid: string; // Youth member's UID
  childName: string;
  relationship: string;
  addedAt: Date;
  clubAccess?: ClubAccess[]; // Youth's club and group access (synced from youth's profile)
}

// Guardian info stored in youth member's document
export interface GuardianInfo {
  uid: string; // Guardian's UID
  name: string;
  email: string;
  phoneNumber?: string;
  relationship: string;
  addedAt: Date;
}

// New access interfaces for user document
export interface ClubAccess {
  clubId: string;
  clubName: string;
  role: 'club-admin' | 'member'; // role in the club - matches ARCHITECTURE.md
  joinedAt: Date;
  lastModifiedAt: Date;
  isActive?: boolean; // false when club is soft-deleted
  deletionScheduledAt?: Date; // when permanent deletion will occur
  groupAccess?: GroupAccess[]; // nested group access within this club
  eventAccess?: EventAccess[]; // nested event access within this club
  pollAccess?: PollAccess[]; // nested poll access within this club
  announcementAccess?: AnnouncementAccess[]; // nested announcement access within this club
  groupInvites?: GroupInvite[]; // pending group invitations for this club
}

export interface GroupAccess {
  groupId: string;
  groupName: string;
  roles: string[]; // roles in the group (e.g., ['player', 'coach', 'admin', 'guardian'])
  joinedAt: Date;
  lastModifiedAt: Date;
  isActive?: boolean; // false when group is soft-deleted
  deletionScheduledAt?: Date; // when permanent deletion will occur
}

export interface EventAccess {
  eventId: string;
  eventName: string;
  startDate: Date;
  startTime: string;
  location: string;
  response: 'pending' | 'accepted' | 'declined'; // pending initially until user responds
  targetScope: 'club' | 'group' | 'subgroup';
  targetId: string; // clubId, groupId, or subGroupId
}

export interface PollAccess {
  pollId: string;
  pollName: string;
  response: 'pending' | 'submitted';
  targetScope: 'club' | 'group' | 'subgroup';
}

export interface AnnouncementAccess {
  announcementId: string;
  announcementName: string;
  readAt?: Date;
  targetScope: 'club' | 'group' | 'subgroup';
}

export interface GroupInvite {
  inviteId: string;
  groupId: string;
  groupName: string;
  clubId?: string; // Optional since it's nested within ClubAccess
  invitedBy: string;
  invitedByName?: string;
  status: 'pending' | 'accepted' | 'rejected';
  message?: string;
  createdAt: Date;
}


export interface EventInvitation {
  eventId: string;
  response: 'not replied' | 'accepted' | 'declined';
  invitedAt?: Date;
  respondedAt?: Date;
}

export interface ProfilePictureUploadResult {
  success: boolean;
  photoURL?: string;
  error?: string;
}
