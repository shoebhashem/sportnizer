// ClubMembership and GroupMembership now fetched via versioning services

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  phoneNumber?: string;
  dateOfBirth?: Date;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  // Updated to new access-based structure
  clubAccess: ClubAccess[];
  groupsCreated?: number;
  events: EventInvitation[];
  eventsResponses: any[]; // TODO: Define proper EventResponses type
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  createdAt?: Date;
  lastActive?: Date;
  version?: number; // Version for cache optimization
}

// New access interfaces for user document
export interface ClubAccess {
  clubId: string;
  clubName: string;
  role: 'club-admin' | 'member'; // role in the club - matches ARCHITECTURE.md
  joinedAt: Date;
  lastModifiedAt: Date;
  groupAccess?: GroupAccess[]; // nested group access within this club
  eventAccess?: EventAccess[]; // nested event access within this club
  pollAccess?: PollAccess[]; // nested poll access within this club
  announcementAccess?: AnnouncementAccess[]; // nested announcement access within this club
}

export interface GroupAccess {
  groupId: string;
  groupName: string;
  roles: string[]; // roles in the group (e.g., ['player', 'coach', 'admin', 'guardian'])
  joinedAt: Date;
  lastModifiedAt: Date;
  subGroups?: string[]; // Sub-group IDs user belongs to
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
