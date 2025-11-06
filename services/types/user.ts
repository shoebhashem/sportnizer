import type { ClubMembership } from './club';
import type { GroupMembership } from './group';

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
  clubs: ClubMembership[];
  groupsJoined: GroupMembership[]; // Changed from 'groups' to match actual usage in codebase
  groupsCreated?: number;
  events: EventInvitation[];
  eventsResponses: EvenstResponses[];
  emailVerified?: boolean;
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  createdAt?: Date;
  lastActive?: Date;
}

export interface ClubMembership {
  clubId: string;
  clubName: string;
  isAdmin: boolean;
  joinedAt: Date;
  lastModifiedAt: Date;
}

export interface GroupMembership {
  groupId: string;
  clubId: string;
  groupName: string;
  roles: string[]; // e.g., ['admin', 'coach', 'member', 'guardian']
  joinedAt?: Date;
  lastModifiedAt: Date;
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
