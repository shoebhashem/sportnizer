import type { RecipientSelection } from './common';

export interface EventData {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  gatheringTime?: Date;
  location: string;
  type: 'practice' | 'game' | 'meeting' | 'other';
  mode: 'simple' | 'advanced'; // Simple or advanced creation mode
  duration?: number; // Duration in minutes for simple mode
  capacity?: {
    enabled: boolean;
    maxAttendees?: number;
  };
  isRecurring?: boolean;
  recurringSettings?: RecurringSettings;
  visibility: 'public' | 'members-only';
  clubId: string;
  groupId: string;
  createdBy: string;
  createdAt: any;
  isActive: boolean;
}

export interface RecurringSettings {
  frequency: 'daily' | 'weekly' | 'monthly';
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, etc.
  endType: 'never' | 'after' | 'on';
  endAfter?: number; // Number of occurrences
  endOn?: Date; // End date
}

export interface RecurringEventData {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location: string;
  type: 'practice' | 'game' | 'meeting' | 'other';
  visibility: 'public' | 'members-only';
  clubId: string;
  groupId: string;
  createdBy: string;
  
  // Recurring specific fields
  isRecurring: true;
  frequency: 'daily' | 'weekly' | 'monthly';
  daysOfWeek?: number[]; // For weekly recurrence
  endType: 'never' | 'after' | 'on';
  endAfter?: number; // Number of occurrences
  endOn?: Date; // End date
  
  // Recipients
  recipients: RecipientSelection;
}

export interface RecurringEventMaster {
  id: string;
  title: string;
  description: string;
  location: string;
  type: 'practice' | 'game' | 'meeting' | 'other';
  visibility: 'public' | 'members-only';
  clubId: string;
  groupId: string;
  createdBy: string;
  createdAt: any;
  
  // Recurring settings
  frequency: 'daily' | 'weekly' | 'monthly';
  daysOfWeek?: number[];
  startTime: string; // Time as string (HH:mm)
  endTime: string;
  duration: number; // Duration in minutes
  
  // End conditions
  endType: 'never' | 'after' | 'on';
  endAfter?: number;
  endOn?: Date;
  
  // Status
  isActive: boolean;
  
  // Recipients
  recipients: RecipientSelection;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  gatheringTime?: Date;
  location: string;
  type: 'practice' | 'game' | 'meeting' | 'other';
  visibility: 'public' | 'members-only';
  clubId: string;
  groupId: string;
  createdBy: string;
  createdAt: any;
  isActive: boolean;
  
  // Capacity management
  capacity?: {
    enabled: boolean;
    maxAttendees?: number;
  };
  
  // Recurring event reference
  isRecurring: boolean;
  recurringEventId?: string; // Reference to RecurringEventMaster
  
  // Attendees
  attendees?: {
    [userId: string]: {
      status: 'invited' | 'accepted' | 'declined' | 'maybe';
      respondedAt?: Date;
    };
  };
}

export interface HomeEvent {
  id: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location: string;
  type: 'practice' | 'game' | 'meeting' | 'other';
  clubName: string;
  groupName: string;
  clubId: string;
  groupId: string;
  isRecurring: boolean;
  recurringEventId?: string;
  canEdit: boolean;
  attendanceStatus?: 'invited' | 'accepted' | 'declined' | 'maybe';
}
