export interface GroupData {
  id: string; // Added ID field
  name: string;
  sportType: string;
  description?: string;
  createdBy: string;
  createdAt: any;
  //participantsIds?: string[]; // Made optional since we're moving to subcollection
  isActive: boolean;
  memberCount: number;
  maxCount?: number;
  subGroups?: string[]; // name of the sugroups
  ageGroup?: number; // 1=children, 2=adults, 3=mixed
}

export interface GroupMemberData {
  userId: string;
  roles: string[]; // e.g., ["admin"], ["member"], ["coach"]
  joinedAt: any; // Firestore timestamp
  photoURL: string;
  name: string;
  email: string;
  needsGuardian: boolean; // true for child/youth members
  belongtoSubGroups?: string[]; // IDs of subgroups the member belongs to
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
