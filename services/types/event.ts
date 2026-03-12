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

  // LOK-stöd role for RF reporting
  lokRole?: "participant" | "leader";
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
  cancellationReason?: string; // If status is 'cancelled'
  cancelledAt?: Date; // When event was cancelled
  cancelledBy?: string; // User ID who cancelled the event
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

  // LOK-stöd reporting metadata
  lok?: {
    eligible: boolean; // Is this a LOK-eligible activity?
    durationMinutes?: number; // Calculated/stored activity duration
    reportedAt?: Date; // When submitted to RF
    reportingPeriod?: string; // e.g. "2026-H1" or "2026-H2"
    reportId?: string; // Reference to lokReports/{id}
  };

  // Recurring event fields
  isRecurring?: boolean; // True if part of a recurring series
  recurringEventId?: string; // ID of the master recurring event
  occurrenceIndex?: number; // 0-based index within the series
  isModified?: boolean; // True if individually modified (won't be affected by series edits)
}

// ============================================================================
// Recurring Event Types
// ============================================================================

export type RecurrenceFrequency = "weekly" | "biweekly" | "monthly";
export type RecurrenceEndType = "date" | "occurrences";

export interface RecurringSettings {
  frequency: RecurrenceFrequency;
  endType: RecurrenceEndType;
  seriesEndDate?: Date; // If endType is "date"
  occurrenceCount?: number; // If endType is "occurrences"
}

export interface RecurringEventMasterClient {
  id: string;
  clubId: string;
  title: string;
  description?: string | null;
  eventType: "training" | "match" | "meeting" | "other";
  location?: string | null;

  // Time template
  startTimeOfDay: string; // HH:mm
  endTimeOfDay: string; // HH:mm
  gatheringTimeOfDay?: string | null;
  durationMinutes: number;

  // Recurrence rule
  frequency: RecurrenceFrequency;
  dayOfWeek: number; // 0-6
  dayOfMonth?: number;

  // End condition
  endType: RecurrenceEndType;
  endDate?: Date;
  occurrenceCount?: number;

  // Generated occurrences
  occurrenceEventIds: string[];
  totalOccurrences: number;

  // Metadata
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  isActive: boolean;
  status: "active" | "cancelled";
}
