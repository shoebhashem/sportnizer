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
  groups: GroupMembership[];
  groupsCreated?: number;
  eventInvitations: EventInvitation[];
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  createdAt?: Date;
  lastActive?: Date;
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
