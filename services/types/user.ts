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
  groupAccess: GroupAccess[];
  groupsCreated?: number;
  events: EventInvitation[];
  eventsResponses: any[]; // TODO: Define proper EventResponses type
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  createdAt?: Date;
  lastActive?: Date;
}

// New access interfaces for user document
export interface ClubAccess {
  clubId: string;
  clubName: string;
  role: 'club-admin' | 'admin' | 'member'; // role in the club
  joinedAt: Date;
  lastModifiedAt: Date;
}

export interface GroupAccess {
  groupId: string;
  groupName: string;
  clubId: string;
  roles: string[]; // roles in the group (e.g., ['coach', 'member'])
  joinedAt: Date;
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
