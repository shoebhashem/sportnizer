// ClubMembership and GroupMembership now fetched via versioning services

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  phoneNumber?: string | null;
  dateOfBirth?: Date | null;
  emailVerified?: boolean; // Custom email verification status
  // Updated to new access-based structure
  clubAccess: ClubAccess[];
  // Subscription limits (usage tracking)
  activeClubsAsAdmin?: number; // Count of clubs where user is admin with isActive=true
  maxClubsAsAdmin?: number; // Maximum clubs user can be admin of (default: 1)
  groupsCreated?: number;
  events: EventInvitation[];
  eventsResponses: any[]; // TODO: Define proper EventResponses type
  verificationStatus?: "pending" | "verified" | "rejected";
  createdAt?: Date;
  lastActive?: Date;
  version?: number; // Version for cache optimization
  // Youth member relationships
  dependents?: DependentInfo[]; // For guardians - list of youth members they manage
  guardians?: GuardianInfo[]; // For youth members - list of guardians
  // Legal acceptance tracking
  legalAcceptance?: {
    termsVersion: string;
    privacyVersion: string;
    acceptedAt: Date;
    acceptanceMethod: string;
  };
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
  role: "club-admin" | "member"; // role in the club - matches ARCHITECTURE.md
  joinedAt: Date;
  lastModifiedAt: Date;
  isActive?: boolean; // false when club is soft-deleted
  deletionScheduledAt?: Date; // when permanent deletion will occur
  groupAccess?: GroupAccess[]; // nested group access within this club
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

export interface EventInvitation {
  eventId: string;
  response: "not replied" | "accepted" | "declined";
  invitedAt?: Date;
  respondedAt?: Date;
}

export interface ProfilePictureUploadResult {
  success: boolean;
  photoURL?: string;
  error?: string;
}
