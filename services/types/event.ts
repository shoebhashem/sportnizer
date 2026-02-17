import type { RecipientSelection } from "./common";

// Event response structure
export interface EventResponse {
  userId: string;
  userName: string;
  photoUrl?: string;
  response: "pending" | "accepted" | "declined";
  status: "pending" | "accepted" | "declined"; // Alias for response (for compatibility)
  respondedAt?: Date;

  // Youth/Guardian Support
  isYouthMember?: boolean; // True if this response is for a youth member
  guardianIds?: string[]; // Array of guardian userIds who can respond
  guardianNames?: string[]; // Names for display
  respondedBy?: string; // Guardian userId who last responded (for youth members)
  respondedByName?: string; // Guardian name who last responded
  responseHistory?: {
    // Track override history
    response: "accepted" | "declined";
    changedAt: Date;
    changedBy: string; // Guardian userId
    changedByName: string; // Guardian name
  }[];

  // Attendance Recording
  actualAttendance?: boolean; // Whether the person actually attended (recorded after event)
  recordedBy?: string; // User ID who recorded the attendance
  recordedAt?: Date; // When attendance was recorded
}

// Event document structure according to ARCHITECTURE.md
export interface EventData {
  id: string;
  title: string;
  description?: string;
  eventType?: "training" | "match" | "meeting" | "other"; // Event type for filtering
  clubId: string;
  clubName?: string; // For display purposes
  groupId?: string | null; // Present if group-specific event
  groupName?: string; // For display purposes
  subGroupIds?: string[]; // Present if sub-group specific event
  subGroupName?: string; // For display purposes (first subgroup)
  startDate: Date; // Changed from string to Date for easier manipulation
  startTime?: string;
  gatheringTime?: string | null;
  endDate?: Date | null; // Changed from string to Date
  endTime?: string | null;
  location?: string;
  targetScope?: "club" | "group" | "subgroup";

  // Additional fields for event management
  maxCapacity?: number | null; // Maximum attendees
  deadline?: Date | null; // Response deadline (Date object)
  capacityLimit?: number | null; // Legacy field for compatibility
  capacity?: { min: number | null; max: number } | null; // Structured capacity object
  responseDeadline?: string | null; // Legacy ISO string field

  // Recipients
  invitedUserIds?: string[];

  responses?: EventResponse[];
  responseSummary?: {
    totalInvited?: number;
    accepted: number;
    declined: number;
    pending: number;
    attended?: number; // Number who actually attended (after event completion)
  };

  isActive?: boolean;
  status?: "scheduled" | "completed" | "cancelled"; // Event status
  createdAt: Date; // Changed from any to Date
  createdBy: string;
  lastModifiedAt?: Date; // Changed from any to Date
  updatedAt?: Date; // Alias for lastModifiedAt
  version?: number;

  // Completion metadata (for attendance recording)
  completedAt?: Date; // When attendance was recorded
  completedBy?: string; // User ID who recorded attendance
  completedByName?: string; // Display name of who recorded

  // For display purposes (guardian view)
  recipientName?: string; // Which child is this event for
}

export interface RecurringSettings {
  frequency: "daily" | "weekly" | "monthly";
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, etc.
  endType: "never" | "after" | "on";
  endAfter?: number; // Number of occurrences
  endOn?: Date; // End date
}

export interface RecurringEventData {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location: string;
  type: "practice" | "game" | "meeting" | "other";
  visibility: "public" | "members-only";
  clubId: string;
  groupId: string;
  createdBy: string;

  // Recurring specific fields
  isRecurring: true;
  frequency: "daily" | "weekly" | "monthly";
  daysOfWeek?: number[]; // For weekly recurrence
  endType: "never" | "after" | "on";
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
  type: "practice" | "game" | "meeting" | "other";
  visibility: "public" | "members-only";
  clubId: string;
  groupId: string;
  createdBy: string;
  createdAt: any;

  // Recurring settings
  frequency: "daily" | "weekly" | "monthly";
  daysOfWeek?: number[];
  startTime: string; // Time as string (HH:mm)
  endTime: string;
  duration: number; // Duration in minutes

  // End conditions
  endType: "never" | "after" | "on";
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
  type: "practice" | "game" | "meeting" | "other";
  visibility: "public" | "members-only";
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
      status: "invited" | "accepted" | "declined" | "maybe";
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
  type: "practice" | "game" | "meeting" | "other";
  clubName: string;
  groupName: string;
  clubId: string;
  groupId: string;
  isRecurring: boolean;
  recurringEventId?: string;
  canEdit: boolean;
  attendanceStatus?: "invited" | "accepted" | "declined" | "maybe";
}
