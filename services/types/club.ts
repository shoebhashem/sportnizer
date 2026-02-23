import { GuardianContact } from "./group";

// Club document structure according to ARCHITECTURE.md
export interface ClubData {
  id: string;
  name: string;
  description: string;
  location: string;
  admins: string[]; // User IDs with club-admin role
  memberCount: number;
  isActive: boolean;
  deletionScheduledAt?: any; // Firestore Timestamp - when permanent deletion will occur
  deletedBy?: string; // User ID who initiated deletion
  deletedAt?: any; // Firestore Timestamp - when soft delete occurred
  createdAt: any; // Firestore Timestamp
  createdBy: string;
  lastModifiedAt: any; // Firestore Timestamp
  version: number;
  // Subscription limits (usage tracking)
  activeGroupCount?: number; // Count of groups with isActive=true
  maxGroups?: number; // Maximum groups allowed in this club (default: 10)
  // Stripe Connect payment setup
  stripe?: {
    accountId: string;
    country: string;
    currency: string;
    status: "pending" | "active" | "restricted" | "inactive";
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
    onboardingComplete?: boolean;
    createdAt: any;
    lastUpdatedAt: any;
  };
}

export interface ClubMemberData {
  userId: string;
  roles: (
    | "club-admin"
    | "admin"
    | "coach"
    | "player"
    | "player-underage"
    | "guardian"
  )[]; // Updated role hierarchy
  photoURL: string;
  name: string;
  email: string;
  addedBy: string; // userId of who added this member
  joinedAt: any; // Firestore timestamp
  lastModifiedAt: any; // Firestore timestamp
  needsGuardian: boolean; // true for child/youth members
  guardiansContacts: GuardianContact[]; // Guardian contact details (UPDATED)
}

// New interface for club's single allMembers document
export interface ClubAllMembersDocument {
  members: ClubMemberData[];
  lastUpdated: any; // Firestore timestamp
  memberCount: number;
}
