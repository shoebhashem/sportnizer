// Group document structure according to ARCHITECTURE.md
export interface GroupData {
  id: string;
  name: string;
  description: string;
  clubId: string; // Parent club reference
  clubName: string; // Denormalized club name for easy access
  sport: string; // Sport type for this group
  coaches: string[]; // User IDs with coach role
  admins: string[]; // User IDs with group-admin role
  memberCount: number;
  subGroups: { id: string; name: string }[]; // Array of subgroup metadata for denormalization
  isActive: boolean;
  deletionScheduledAt?: any; // Firestore Timestamp - when permanent deletion will occur
  deletedBy?: string; // User ID who initiated deletion
  deletedAt?: any; // Firestore Timestamp - when soft delete occurred
  createdAt: any; // Firestore Timestamp
  createdBy: string;
  lastModifiedAt: any; // Firestore Timestamp
  version: number;
  // Group picture
  pictureUrl?: string; // URL of the group picture (uploaded via uploadGroupPicture CF)
  // Subscription limits
  maxMembers?: number; // Maximum members allowed in this group (default: 30)
}

export interface GuardianContact {
  guardianUid: string;
  guardianName: string;
  guardianEmail: string;
  relationship?: string;
}

export interface GroupMemberData {
  userId: string;
  roles: (
    | "club-admin"
    | "admin"
    | "coach"
    | "player"
    | "player-underage"
    | "guardian"
  )[]; // Updated role hierarchy
  joinedAt: any; // Firestore timestamp
  photoURL: string;
  name: string;
  email: string;
  needsGuardian: boolean; // true for child/youth members
  guardiansContacts: GuardianContact[]; // Guardian contact details (UPDATED)
}

// New interface for single document with members array
export interface AllMembersDocument {
  members: GroupMemberData[];
  lastUpdated: any; // Firestore timestamp
  memberCount: number;
}

export interface GroupWithDetails {
  id: string;
  name: string;
  sportType: string;
  description?: string;
  clubId: string;
  createdBy: string;
  createdAt: any;
  adminIds: string[];
  memberIds: string[];
  isActive: boolean;
  memberCount?: number;
  maxMembers?: number;
  clubName: string;
  isUserAdmin: boolean;
  isUserMember: boolean;
}

export interface ClubWithGroups {
  id: string;
  name: string;
  description?: string;
  location?: string;
  logoUrl?: string;
  isUserAdmin: boolean;
  isUserMember: boolean;
  joinedAt?: Date;
  totalMembers: number;
  groups: GroupWithDetails[];
}

export interface Coach {
  id: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  isVerified: boolean;
  addedAt: Date;
  addedBy: string;
}

export interface CoachInvitation {
  id: string;
  coachEmail: string;
  groupId: string;
  groupName: string;
  invitedBy: string;
  invitedAt: Date;
  status: "pending" | "accepted" | "declined";
}
