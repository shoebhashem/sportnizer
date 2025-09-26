import type { RecipientSelection } from './common';

export interface AnnouncementData {
  title: string;
  content: string;
  recipients: RecipientSelection;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  clubId: string;
  groupId?: string;
  createdBy: string;
  createdAt: any;
  recipients: RecipientSelection;
  isActive: boolean;
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
