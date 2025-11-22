import type { RecipientSelection } from './common';

export interface PollData {
  title: string;
  options: string[];
  recipients: RecipientSelection;
}

// Poll document structure - follows similar pattern to events
export interface Poll {
  id: string;
  title: string;
  description?: string;
  options: string[];
  clubId: string;
  groupId?: string; // Present if group-specific poll
  subGroupIds?: string[]; // Present if sub-group specific poll
  targetScope: 'club' | 'group' | 'subgroup';
  targetMembers: string[]; // User IDs of invited members
  responses: {
    userId: string;
    selectedOption: number; // Index of selected option
    respondedAt: any; // Firestore Timestamp
  }[];
  isActive: boolean;
  createdAt: any; // Firestore Timestamp
  createdBy: string;
  lastModifiedAt: any; // Firestore Timestamp
  version: number;
}

export interface HomePoll {
  id: string;
  title: string;
  options: string[];
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  clubName: string;
  groupName?: string;
  clubId: string;
  groupId?: string;
  canEdit: boolean;
  userVote?: number; // Index of the option the user voted for
  votes: {
    [optionIndex: number]: {
      count: number;
      voters: {
        userId: string;
        voterName: string;
        votedAt: Date;
      }[];
    };
  };
  type: 'poll';
}
