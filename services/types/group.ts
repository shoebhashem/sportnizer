export interface GroupData {
  name: string;
  sportType: string;
  description?: string;
  createdBy: string;
  createdAt: any;
  participantsIds: string[];
  isActive: boolean;
  memberCount: number;
  maxCount?: number;
}

export interface GroupMembership {
  groupId: string;
  groupName: string;
  roles: string[]; // e.g., ['admin', 'coach', 'member', 'guardian']
  joinedAt?: Date;
  lastModifiedAt: Date;
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
  status: 'pending' | 'accepted' | 'declined';
}
