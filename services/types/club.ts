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

export interface ClubMembership {
  clubId: string;
  clubName: string;
  isAdmin: boolean;
  joinedAt: Date;
  lastModifiedAt: Date;
}

export interface ClubMemberData {
  userId: string;
  roles: string[]; // e.g., ["admin"], ["member"], ["coach", "member"]
  photoURL: string;
  name: string;
  email: string;
  addedBy: string; // userId of who added this member
  lastModifiedAt: Date;
}

