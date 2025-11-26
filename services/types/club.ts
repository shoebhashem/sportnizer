import { GuardianContact } from './group';

// Club document structure according to ARCHITECTURE.md
export interface ClubData {
  id: string;
  name: string;
  description: string;
  location: string;
  admins: string[]; // User IDs with club-admin role
  memberCount: number;
  isActive: boolean;
  createdAt: any; // Firestore Timestamp
  createdBy: string;
  lastModifiedAt: any; // Firestore Timestamp
  version: number;
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

