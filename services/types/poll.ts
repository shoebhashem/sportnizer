import type { RecipientSelection } from './common';

export interface PollData {
  title: string;
  options: string[];
  recipients: RecipientSelection;
}

export interface Poll {
  id: string;
  title: string;
  options: string[];
  clubId: string;
  groupId?: string;
  createdBy: string;
  createdAt: any;
  recipients: RecipientSelection;
  isActive: boolean;
  votes?: {
    [optionIndex: number]: {
      [userId: string]: {
        votedAt: Date;
        voterName: string;
      };
    };
  };
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
