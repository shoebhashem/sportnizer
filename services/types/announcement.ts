import type { RecipientSelection } from './common';

export interface AnnouncementData {
  title: string;
  content: string;
  recipients: RecipientSelection;
}

// Announcement document structure - follows similar pattern to events and polls  
export interface Announcement {
  id: string;
  title: string;
  content: string;
  clubId: string;
  groupId?: string; // Present if group-specific announcement
  subGroupIds?: string[]; // Present if sub-group specific announcement
  targetScope: 'club' | 'group' | 'subgroup';
  targetMembers: string[]; // User IDs of target members
  readBy: {
    userId: string;
    readAt: any; // Firestore Timestamp
  }[];
  isActive: boolean;
  createdAt: any; // Firestore Timestamp
  createdBy: string;
  lastModifiedAt: any; // Firestore Timestamp
  version: number;
}

export interface HomeAnnouncement {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  clubName: string;
  groupName?: string;
  clubId: string;
  groupId?: string;
  canEdit: boolean;
  type: 'announcement';
}
