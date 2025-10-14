import { GuardianContact } from './group';

export interface ClubData {
  name: string;
  description?: string;
  location?: string;
  website?: string;
  logoUrl?: string;
  createdBy: string;
  createdAt: any;
  adminIds: string[];
  memberIds?: string[]; // Made optional since we're moving to subcollection
  totalCounts: number;
  isActive: boolean;
}


export interface ClubMemberData {
  userId: string;
  roles: ("club-admin" | "admin" | "coach" | "player" | "guardian")[]; // Updated role hierarchy
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

