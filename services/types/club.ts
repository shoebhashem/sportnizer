export interface ClubData {
  name: string;
  description?: string;
  location?: string;
  website?: string;
  logoUrl?: string;
  createdBy: string;
  createdAt: any;
  adminIds: string[];
  memberIds: string[];
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

export interface CreateClubAndGroupRequest {
  clubName: string;
  groupName: string;
  sportType: string;
  description?: string;
  location?: string;
}
