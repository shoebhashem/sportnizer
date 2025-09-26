// Common interfaces used across multiple domains

export interface RecipientSelection {
  type: 'all' | 'specific';
  clubId?: string;
  groupIds?: string[];
  userIds?: string[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface SearchFilters {
  query?: string;
  sportType?: string;
  location?: string;
  isActive?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export type NewsFlowItem = {
  type: 'announcement';
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
} | {
  type: 'poll';
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
  userVote?: number;
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
};
