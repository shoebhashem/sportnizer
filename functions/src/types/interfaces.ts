/**
 * TypeScript interfaces for Firebase Functions
 */

// Notification interfaces
export type NotificationType =
  | "group_invitation"
  | "youth_member_invitation"
  | "club_admin_invitation"
  | "announcement"
  | "event"
  | "poll"
  | "role_changed"
  | "member_joined"
  | "event_cancelled"
  | "payment_request"
  | "news"
  | "news_updated";

export interface NotificationData {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  invitationToken?: string;
  sourceId?: string;
  sourceCollection?: string;
  read: boolean;
  dismissed: boolean;
  clubId: string;
  clubName: string;
  groupId?: string;
  groupName?: string;
  createdAt: any;
  readAt?: any;
  actionTakenAt?: any;
  priority?: "low" | "normal" | "high";
  actionUrl?: string;
  metadata?: {
    action?: "role_update" | "new_member";
    newRole?: string;
    existingRoles?: string[];
    [key: string]: any;
  };
}

export interface CreateNotificationRequest {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  invitationToken?: string;
  sourceId?: string;
  sourceCollection?: string;
  clubId: string;
  clubName: string;
  groupId?: string;
  groupName?: string;
  youthData?: YouthData; // Optional: Youth member data for youth invitations
  priority?: "low" | "normal" | "high";
  metadata?: {
    action?: "role_update" | "new_member";
    newRole?: string;
    existingRoles?: string[];
    [key: string]: any;
  };
  actionUrl?: string;
}

export interface CreateNotificationResponse {
  success: boolean;
  notificationId?: string;
  error?: string;
}

// Group invitation interfaces
export interface GroupInvitationData {
  email: string;
  clubId: string;
  clubName: string;
  groupId: string;
  groupName: string;
  inviterName: string;
  inviterUid: string;
  createdAt: any;
  used: boolean;
  status: "pending" | "accepted" | "rejected";
  usedAt?: any;
  usedBy?: string;
  expiresAt?: any;
}

export interface YouthData {
  childName: string;
  dateOfBirth: string;
  relationship: string;
}

export interface ExistingYouthData {
  youthUid: string;
  youthName: string;
}

export interface GroupInvitationRequest {
  emails: string[];
  clubId: string;
  clubName: string;
  groupId?: string; // Optional for club_admin invitations
  groupName?: string; // Optional for club_admin invitations
  inviterName: string;
  inviterUid?: string; // Optional: UID of inviter (defaults to request.auth.uid)
  invitationType?:
    | "regular"
    | "youth_member"
    | "youth_member_existing"
    | "youth_existing_new_guardian"
    | "club_admin"
    | "guardian"; // Optional: Type of invitation
  youthData?: YouthData; // Optional: Youth member data for NEW youth invitations
  existingYouthData?: ExistingYouthData; // Optional: Existing youth data for REUSE invitations
  guardianData?: {
    // Guardian-specific data: which youth the guardian is being linked to
    youthUid: string;
    youthName: string;
  };
  role?:
    | "player"
    | "player-underage"
    | "coach"
    | "admin"
    | "club-admin"
    | "guardian"; // Optional: Role to assign (defaults to 'player')
}

export interface ProcessInvitationRequest {
  invitationToken: string;
  userEmail: string;
}

export interface RespondToInvitationRequest {
  invitationToken: string;
  uid: string;
  action: "accept" | "reject";
}

// Email verification interfaces
export interface EmailVerificationData {
  uid: string;
  email: string;
  createdAt: any;
  expiresAt: Date;
  verified: boolean;
  verifiedAt?: any;
}

// Club and Group creation interfaces
export interface CreateClubRequest {
  clubName: string;
  uid: string;
}

export interface CreateClubResponse {
  success: boolean;
  clubId?: string;
  clubName?: string;
  message?: string;
  error?: string;
}

export interface CreateGroupRequest {
  clubId: string;
  groupName: string;
  sportType: string;
  uid: string;
}

export interface CreateGroupResponse {
  success: boolean;
  groupId?: string;
  groupName?: string;
  clubName?: string;
  message?: string;
  error?: string;
}

export interface SendEmailVerificationRequest {
  email: string;
  uid: string;
  fullName: string;
}

export interface SendEmailVerificationResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ResendVerificationEmailRequest {
  email: string;
}

export interface ResendVerificationEmailResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Auth-related interfaces
export interface CreateUserAccountRequest {
  email: string;
  fullName: string;
  uid: string;
  invitationToken?: string; // Optional invitation token for invitation-based signups
  // Legal acceptance data (required for new signups)
  legalAcceptance?: {
    termsVersion: string;
    privacyVersion: string;
    acceptanceMethod: "signup" | "login_re-acceptance" | "app_prompt";
    clientInfo: {
      platform: "ios" | "android" | "web";
      appVersion: string;
    };
  };
}

export interface CreateUserAccountResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface GetUserProfileRequest {
  uid: string;
}

export interface GetUserProfileResponse {
  success: boolean;
  userProfile?: any;
  error?: string;
}

// Guardian invitation interfaces
export interface GuardianInvitationData {
  groupId: string;
  groupName: string;
  memberId: string;
  memberName: string;
  memberBirthDate?: string;
  guardianEmails: string[];
  inviterUid: string;
  inviterName: string;
  createdAt: any;
  expiresAt: Date;
  status: "pending" | "accepted" | "rejected";
  used: boolean;
  usedAt?: any;
  usedBy?: string;
}

export interface SendGuardianInvitationsRequest {
  groupId: string;
  selectedMemberIds: string[];
  guardianEmails: string[];
}

// Shareable invitation interfaces
export interface ShareableInvitationData {
  inviteToken: string;
  groupId: string;
  groupName: string;
  inviterName: string;
  inviterUid: string;
  invitationType: "group-member" | "coach" | "admin";
  createdAt: any;
  expiresAt: any;
  isActive: boolean;
  maxUses: number | null; // null = unlimited
  currentUses: number;
  usedBy: string[]; // Array of user IDs
  metadata: {
    createdVia: string;
    platform: string;
  };
}

export interface GenerateShareableInviteRequest {
  clubId: string;
  groupId: string;
  groupName: string;
  inviterName: string;
  inviterUid: string;
  expirationDays?: number;
  maxUses?: number | null;
  invitationType?: "group-member" | "coach" | "admin";
}

export interface GenerateShareableInviteResponse {
  success: boolean;
  inviteToken?: string;
  inviteLink?: string;
  expiresAt?: string;
  error?: string;
}

// Generic response interfaces
export interface FunctionResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface InvitationResult {
  email?: string;
  memberId?: string;
  memberName?: string;
  success: boolean;
  error?: string;
  invitationToken?: string;
  guardianEmails?: string[];
  isExistingUser?: boolean; // Indicates if user already has an account
}

// Member management operation interfaces
export interface ClubMemberData {
  userId: string;
  roles: string[];
  photoURL: string;
  name: string;
  email?: string; // Optional for youth members
  addedBy: string;
  joinedAt: Date;
  lastModifiedAt: Date;
  needsGuardian: boolean;
  guardiansContacts: any[];
  // 🆕 Soft delete fields
  isActive?: boolean; // false = soft deleted, undefined/true = active
  inactiveSince?: Date | null; // When member was marked inactive
  scheduledForDeletion?: Date | null; // When permanent deletion is scheduled (30 days from inactiveSince)
  reactivatedAt?: Date; // When member was last reactivated
  reactivationCount?: number; // How many times member has been reactivated
}

export interface GroupMemberData {
  userId: string;
  roles: string[];
  joinedAt: Date;
  photoURL: string;
  name: string;
  email?: string; // Optional for youth members
  needsGuardian: boolean;
  guardiansContacts: any[];
  // 🆕 Soft delete fields
  isActive?: boolean; // false = soft deleted, undefined/true = active
  inactiveSince?: Date | null; // When member was marked inactive
  scheduledForDeletion?: Date | null; // When permanent deletion is scheduled (30 days from inactiveSince)
  reactivatedAt?: Date; // When member was last reactivated
  reactivationCount?: number; // How many times member has been reactivated
}

export interface UserClubMembership {
  clubId: string;
  clubName: string;
  role: string;
  joinedAt: Date;
  lastModifiedAt: Date;
  // 🆕 Soft delete fields
  isActive?: boolean; // false = soft deleted, undefined/true = active
  inactiveSince?: Date | null; // When club membership was marked inactive
  scheduledForDeletion?: Date | null; // When permanent deletion is scheduled
  reactivatedAt?: Date; // When membership was last reactivated
  reactivationCount?: number; // How many times reactivated
}

export interface UserGroupMembership {
  groupId: string;
  groupName: string;
  roles: string[]; // User's roles in this group
  joinedAt: Date;
  lastModifiedAt: Date;
  // 🆕 Soft delete fields
  isActive?: boolean; // false = soft deleted, undefined/true = active
  inactiveSince?: Date | null; // When membership was marked inactive
  scheduledForDeletion?: Date | null; // When permanent deletion is scheduled
  reactivatedAt?: Date; // When membership was last reactivated
  reactivationCount?: number; // How many times reactivated
}

export interface AddMemberToClubRequest {
  clubId: string;
  memberData: ClubMemberData;
}

export interface AddMemberToGroupRequest {
  clubId: string;
  groupId: string;
  memberData: GroupMemberData;
}

export interface UpdateUserClubInfoRequest {
  uid: string;
  clubInfo: UserClubMembership;
  role: string;
}

export interface UpdateUserGroupInfoRequest {
  uid: string;
  groupInfo?: UserGroupMembership; // Optional for remove operations
  groupId?: string; // Required for remove operations
  clubId: string;
  roles?: string[];
  operation: "add" | "remove";
}

// Orchestration interface
export interface MembershipOperationRequest {
  operations: (
    | "addToClub"
    | "addToGroup"
    | "updateUserClub"
    | "updateUserGroup"
  )[];
  clubId?: string;
  groupId?: string;
  uid: string;
  clubMemberData?: ClubMemberData;
  groupMemberData?: GroupMemberData;
  userClubInfo?: UserClubMembership;
  userGroupInfo?: UserGroupMembership;
}

export interface MembershipOperationResponse {
  success: boolean;
  completedOperations: string[];
  failedOperations: string[];
  error?: string;
  message?: string;
}

// Subgroup interfaces
export interface SubGroupData {
  id: string;
  name: string;
  createdBy: string;
  createdAt: any;
  description?: string;
  color?: string;
  memberCount?: number;
}

export interface CreateSubGroupRequest {
  uid: string;
  clubId: string;
  groupId: string;
  subGroupName: string;
  description?: string;
  color?: string;
}

export interface CreateSubGroupResponse {
  success: boolean;
  message?: string;
  subGroupId?: string;
  subGroupName?: string;
  error?: string;
}

export interface UpdateSubGroupRequest {
  uid: string;
  clubId: string;
  groupId: string;
  subGroupId: string;
  name?: string;
  description?: string;
  color?: string;
}

export interface UpdateSubGroupResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface DeleteSubGroupRequest {
  uid: string;
  clubId: string;
  groupId: string;
  subGroupId: string;
}

export interface DeleteSubGroupResponse {
  success: boolean;
  message?: string;
  deletedMemberCount?: number;
  error?: string;
}

export interface GetSubGroupsRequest {
  clubId: string;
  groupId: string;
}

export interface GetSubGroupsResponse {
  success: boolean;
  subGroups?: SubGroupData[];
  error?: string;
}

// add member to Subgroup interfaces
export interface AddMemberToSubGroupRequest {
  clubId: string;
  groupId: string;
  subGroupId: string; // Changed from subGroupName to subGroupId
  userId: string;
}

export interface AddMemberToSubGroupResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Remove member from Subgroup interfaces
export interface RemoveMemberFromSubGroupRequest {
  clubId: string;
  groupId: string;
  subGroupId: string; // Changed from subGroupName to subGroupId
  userId: string;
}

export interface RemoveMemberFromSubGroupResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Remove member from Group interfaces
export interface RemoveMemberFromGroupRequest {
  clubId: string;
  groupId: string;
  userId: string;
  roleToRemove?: string; // Optional: Specific role to remove (for role de-accumulation)
}

export interface RemoveMemberFromGroupResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Event Response Interface (unified)
export interface EventResponse {
  userId: string;
  userName: string;
  photoUrl?: string; // Optional for backward compatibility
  response: "Accepted" | "declined" | "pending"; // User's RSVP status
  respondedAt?: any; // Timestamp - when they responded (undefined if still pending)

  // Youth/Guardian Support
  isYouthMember?: boolean; // True if this response is for a youth member
  guardianIds?: string[]; // Array of guardian userIds who can respond
  guardianNames?: string[]; // Names for display
  respondedBy?: string; // Guardian userId who last responded (for youth members)
  respondedByName?: string; // Guardian name who last responded
  responseHistory?: {
    // Track override history
    response: "Accepted" | "declined";
    changedAt: any; // Timestamp
    changedBy: string; // Guardian userId
    changedByName: string; // Guardian name
  }[];

  // Optional comment on response (e.g. "Will be 15 min late")
  comment?: string; // Max 100 characters

  // Attendance tracking (filled after event by admins/coaches)
  actualAttendance?: boolean; // Did they actually attend?
  recordedBy?: string; // Who recorded attendance (userId)
  recordedAt?: any; // Timestamp - when attendance was recorded
}

// Event Document Interface (matches Firestore structure)
export interface EventDocument {
  // Event metadata
  eventId: string;
  title: string;
  description?: string | null;
  eventType: "training" | "match" | "meeting" | "other";

  // Timing
  startDate: any; // Timestamp
  endDate: any; // Timestamp
  gatheringTime?: any | null; // Timestamp - optional gathering time before event start
  responseDeadline?: any | null; // Timestamp - optional deadline for responses

  // Location
  location?:
    | string
    | {
        name: string;
        address?: string;
        coordinates?: { lat: number; lng: number };
      }
    | null;

  // Targeting & Recipients
  targetScope: {
    level: "club" | "group" | "subgroup"; // Created from which screen
    clubId: string;
    clubName: string;
    groupId?: string; // Required if level is 'group' or 'subgroup'
    groupName?: string;
    subgroupId?: string; // Required if level is 'subgroup'
    subgroupName?: string;
  };

  // List of user IDs invited to this event
  invitedUserIds: string[];

  // Optional role filter (if not specified, all members are invited)
  roleFilter?:
    | (
        | "player"
        | "player-underage"
        | "coach"
        | "admin"
        | "guardian"
        | "club-admin"
      )[]
    | null;

  // Capacity limits (optional)
  capacity?: {
    min?: number | null; // Minimum required attendees
    max?: number | null; // Maximum allowed attendees
  } | null;

  // Response tracking (embedded in main document)
  responses: EventResponse[];

  // Summary counts (automatically updated when responses change)
  responseSummary: {
    totalInvited: number;
    accepted: number;
    declined: number;
    pending: number;
    attended?: number; // Filled after event when attendance recorded
  };

  // Metadata
  createdBy: string; // userId of creator
  createdByName: string; // Display name of creator
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp

  // Event status
  status: "scheduled" | "completed" | "cancelled";
  cancellationReason?: string; // If status is 'cancelled'
  cancelledAt?: any; // Timestamp - when event was cancelled
  cancelledBy?: string; // userId of who cancelled the event
  isActive?: boolean; // Whether the event is active (for soft delete pattern)

  // Completion metadata (added when event is marked as completed)
  completedAt?: any; // Timestamp - when event was completed
  completedBy?: string; // userId of who completed the event
  completedByName?: string; // Display name of who completed the event

  // Recurring event fields
  isRecurring?: boolean; // True if this event is part of a recurring series
  recurringEventId?: string; // ID of the master recurring event document
  occurrenceIndex?: number; // 0-based index within the series (0 = first occurrence)
  isModified?: boolean; // True if this occurrence was individually modified (won't be affected by series edits)

  // Version tracking (for future notification system)
  version?: number; // Incremented on each update, used to trigger notifications
}

// Legacy EventData interface - keep for backward compatibility with existing UI
export interface EventData {
  title: string;
  description?: string;
  clubId: string;
  groupId?: string | null;
  subGroupIds?: string[];
  startDate: string; // ISO string
  startTime: string;
  gatheringTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  location: string;
  targetScope: "club" | "group" | "subgroup";
  capacityLimit?: number | null;
  responseDeadline?: string | null; // ISO string
  responses?: EventResponse[];
  isActive?: boolean;
}

// Legacy interface - keep for backward compatibility
export interface RecipientSelection {
  type: "selected-groups";
  groups: {
    groupId: string;
    scope: "entire" | "subgroups" | "members";
    subgroupIds?: string[];
    memberIds?: string[];
  }[];
  totalCount: number;
}

// New event creation interface (V2)
export interface CreateEventRequestV2 {
  clubId: string;
  clubName: string;
  eventType: "training" | "match" | "meeting" | "other";
  title: string;
  description?: string;
  startDate: string; // ISO string (date only)
  startTime?: string; // ISO string (full timestamp with time)
  endDate: string; // ISO string (date only)
  endTime?: string; // ISO string (full timestamp with time)
  gatheringTime?: string; // HH:mm format (e.g., "15:30") or ISO string for backward compatibility
  responseDeadline?: string; // ISO string
  location?:
    | string
    | {
        name: string;
        address?: string;
        coordinates?: { lat: number; lng: number };
      };

  // Targeting
  targetScope: {
    level: "club" | "group" | "subgroup";
    groupId?: string;
    groupName?: string;
    subgroupId?: string;
    subgroupName?: string;
  };

  // Optional role filter (defaults to all members)
  roleFilter?: (
    | "player"
    | "player-underage"
    | "coach"
    | "admin"
    | "guardian"
    | "club-admin"
  )[];

  // Optional member selection (subset of members to target)
  selectedMemberIds?: string[];

  // Optional capacity limits
  capacity?: {
    min?: number;
    max?: number;
  };
  capacityLimit?: number; // Simplified capacity (used by frontend)

  // Creator info
  createdBy: string;
  createdByName: string;
}

// Legacy interface - keep for backward compatibility
export interface CreateEventRequest {
  clubId: string;
  eventData: EventData;
  recipients: RecipientSelection;
}

export interface CreateEventResponse {
  success: boolean;
  eventId?: string;
  totalRecipients?: number;
  message?: string;
  error?: string;
}

// ============================================================================
// Recurring Events
// ============================================================================

// Master document stored at /clubs/{clubId}/recurringEvents/{recurringEventId}
export interface RecurringEventMaster {
  recurringEventId: string;
  clubId: string;

  // Template data (used to generate occurrences)
  title: string;
  description?: string | null;
  eventType: "training" | "match" | "meeting" | "other";
  location?:
    | string
    | {
        name: string;
        address?: string;
        coordinates?: { lat: number; lng: number };
      }
    | null;

  // Time template (time-of-day, not specific dates)
  startTimeOfDay: string; // HH:mm format (e.g., "18:00")
  endTimeOfDay: string; // HH:mm format (e.g., "19:30")
  gatheringTimeOfDay?: string | null; // HH:mm format (optional)
  durationMinutes: number; // Duration in minutes

  // Recurrence rule
  frequency: "weekly" | "biweekly" | "monthly";
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ... 6 = Saturday (auto-derived from first occurrence)
  dayOfMonth?: number; // For monthly: which day of month (1-31)

  // End condition
  endType: "date" | "occurrences";
  endDate?: any; // Timestamp - if endType is "date"
  occurrenceCount?: number; // If endType is "occurrences"

  // Targeting (same as single events)
  targetScope: {
    level: "club" | "group" | "subgroup";
    clubId: string;
    clubName: string;
    groupId?: string;
    groupName?: string;
    subgroupId?: string;
    subgroupName?: string;
  };
  roleFilter?:
    | (
        | "player"
        | "player-underage"
        | "coach"
        | "admin"
        | "guardian"
        | "club-admin"
      )[]
    | null;
  capacityLimit?: number | null;
  responseDeadlineOffset?: number | null; // Hours before event start for response deadline (e.g., 24 = 1 day before)

  // Generated occurrence IDs (for quick lookup)
  occurrenceEventIds: string[];
  totalOccurrences: number;

  // Metadata
  createdBy: string;
  createdByName: string;
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp
  isActive: boolean;
  status: "active" | "cancelled"; // Series-level status
}

// Request to create a recurring event series
export interface CreateRecurringEventRequest {
  clubId: string;
  clubName: string;
  title: string;
  description?: string;
  eventType: "training" | "match" | "meeting" | "other";
  location: string;

  // Timing for the first occurrence
  startDate: string; // ISO string - date of first occurrence
  startTime: string; // ISO string - full timestamp with time
  endDate: string; // ISO string - date
  endTime: string; // ISO string - full timestamp with time
  gatheringTime?: string; // ISO string (optional)

  // Recurrence settings
  frequency: "weekly" | "biweekly" | "monthly";
  endType: "date" | "occurrences";
  seriesEndDate?: string; // ISO string - when the series ends (if endType is "date")
  occurrenceCount?: number; // How many occurrences (if endType is "occurrences")

  // Targeting (same as single events)
  targetScope: {
    level: "club" | "group" | "subgroup";
    groupId?: string;
    groupName?: string;
    subgroupId?: string;
    subgroupName?: string;
  };
  roleFilter?: (
    | "player"
    | "player-underage"
    | "coach"
    | "admin"
    | "guardian"
    | "club-admin"
  )[];
  selectedMemberIds?: string[];
  capacityLimit?: number;
  responseDeadline?: string; // ISO string - for first occurrence; offset calculated from this

  // Creator info
  createdBy: string;
  createdByName: string;
}

export interface CreateRecurringEventResponse {
  success: boolean;
  recurringEventId?: string;
  occurrenceEventIds?: string[];
  totalOccurrences?: number;
  totalRecipients?: number;
  message?: string;
  error?: string;
}

// Request to edit recurring event(s)
export interface EditRecurringEventRequest {
  clubId: string;
  eventId: string; // The specific occurrence being edited
  recurringEventId: string; // The master recurring event ID
  scope: "single" | "future"; // "single" = this occurrence only, "future" = this and all future

  // Updated fields (only include what changed)
  title?: string;
  description?: string;
  eventType?: "training" | "match" | "meeting" | "other";
  location?: string;
  startTime?: string; // ISO string
  endTime?: string; // ISO string
  gatheringTime?: string | null; // ISO string or null to remove
  capacityLimit?: number | null;
  responseDeadline?: string | null; // ISO string or null to remove
}

// Request to cancel recurring event(s)
export interface CancelRecurringEventRequest {
  clubId: string;
  eventId: string; // The specific occurrence
  recurringEventId: string; // The master recurring event ID
  scope: "single" | "future"; // "single" = this occurrence only, "future" = this and all future
  cancellationReason?: string;
}

// Update event response request
export interface UpdateEventResponseRequest {
  eventId: string;
  clubId: string;
  userId: string; // Target user to respond for
  response: "Accepted" | "declined";
  respondedBy?: string; // Optional: Who is making this response (if different from userId)
  comment?: string; // Optional comment on response (max 100 characters)
}

export interface UpdateEventResponseResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Record attendance request
export interface RecordAttendanceRequest {
  eventId: string;
  clubId: string;
  attendanceRecords: {
    userId: string;
    attended: boolean;
  }[];
  recordedBy: string; // Admin/coach userId
}

export interface RecordAttendanceResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Statistics interfaces
export interface MemberEventStats {
  userName: string;
  eventsInvitedTo: number;
  eventsAccepted: number;
  eventsDeclined: number;
  eventsAttended: number;
  attendanceRate: number;
  responseRate: number;
  byEventType: {
    training: { invited: number; attended: number };
    match: { invited: number; attended: number };
    meeting: { invited: number; attended: number };
    other: { invited: number; attended: number };
  };
  lastUpdated: any; // Timestamp
}

export interface YearlyAttendanceStatistics {
  year: number;
  groupId: string;
  groupName: string;
  clubId: string;
  memberStats: {
    [userId: string]: MemberEventStats;
  };
  groupAggregates: {
    totalEvents: number;
    totalEventsByType: {
      training: number;
      match: number;
      meeting: number;
      other: number;
    };
    averageAttendanceRate: number;
  };
  createdAt: any; // Timestamp
  lastUpdated: any; // Timestamp
}

export interface GetStatisticsRequest {
  clubId: string;
  groupId: string;
  year: number;
}

export interface GetStatisticsResponse {
  success: boolean;
  statistics?: YearlyAttendanceStatistics;
  message?: string;
  error?: string;
}

export interface UpdateUserEventsInfoRequest {
  userIds: string[];
  eventData: {
    eventId: string;
    clubId: string;
    title: string;
    startTime: string; // ISO string
    eventType: "practice" | "game" | "meeting" | "other";
  };
  operation: "add" | "remove";
}

export interface UpdateUserEventsInfoResponse {
  success: boolean;
  updated: number;
  failed: string[];
  useBatchProcessing: boolean;
  message: string;
}

// ============================================================================
// News Interfaces
// ============================================================================

export interface NewsDocument {
  // News metadata
  newsId: string;
  title: string;
  description: string;

  // Targeting & Recipients
  targetScope: {
    level: "club" | "group" | "subgroup";
    clubId: string;
    clubName: string;
    groupId?: string;
    groupName?: string;
    subgroupId?: string;
    subgroupName?: string;
  };

  // List of user IDs who should see this news
  // For youth members: Contains guardian userIds
  recipientUserIds: string[];

  // Optional role filter
  roleFilter?:
    | (
        | "player"
        | "player-underage"
        | "coach"
        | "admin"
        | "guardian"
        | "club-admin"
      )[]
    | null;

  // Email delivery
  emailDelivery: {
    enabled: boolean;
    sentAt?: any; // Timestamp
    sentCount?: number;
    failedCount?: number;
  };

  // Read tracking
  readBy?: {
    userId: string;
    userName?: string;
    readAt: any; // Timestamp
  }[];
  readCount?: number;

  // Comment tracking
  commentCount?: number;

  // Metadata
  createdBy: string;
  createdByName: string;
  createdAt: any; // Timestamp
  updatedAt?: any; // Timestamp

  // Status
  isActive: boolean;
  version: number;
}

export interface CreateNewsRequest {
  clubId: string;
  clubName: string;
  title: string;
  description: string;

  // Targeting
  targetScope: {
    level: "club" | "group" | "subgroup";
    groupId?: string;
    groupName?: string;
    subgroupId?: string;
    subgroupName?: string;
  };

  // Optional role filter (defaults to all members)
  roleFilter?: (
    | "player"
    | "player-underage"
    | "coach"
    | "admin"
    | "guardian"
    | "club-admin"
  )[];

  // Optional selected member IDs (further filters recipients)
  selectedMemberIds?: string[];

  // Email delivery option
  sendEmail?: boolean;

  // Creator info
  createdBy: string;
  createdByName: string;
}

export interface CreateNewsResponse {
  success: boolean;
  newsId?: string;
  totalRecipients?: number;
  emailsSent?: number;
  emailsFailed?: number;
  message?: string;
  error?: string;
}

export interface UpdateNewsRequest {
  newsId: string;
  clubId: string;
  title?: string;
  description?: string;
  updatedBy: string;
  updatedByName: string;
}

export interface UpdateNewsResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface DeleteNewsRequest {
  newsId: string;
  clubId: string;
}

export interface DeleteNewsResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface MarkNewsReadRequest {
  newsId: string;
  clubId: string;
  userId: string;
}

export interface MarkNewsReadResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// News Comment interfaces
export interface NewsComment {
  commentId: string;
  newsId: string;
  clubId: string;
  text: string;
  createdBy: string;
  createdByName: string;
  createdAt: any; // Timestamp
}

export interface AddNewsCommentRequest {
  newsId: string;
  clubId: string;
  text: string;
}

export interface AddNewsCommentResponse {
  success: boolean;
  commentId?: string;
  message?: string;
  error?: string;
}

export interface DeleteNewsCommentRequest {
  newsId: string;
  clubId: string;
  commentId: string;
}

export interface DeleteNewsCommentResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Legal acceptance interfaces
export interface LegalAcceptanceRequest {
  termsVersion: string;
  privacyVersion: string;
  acceptanceMethod: "signup" | "login_re-acceptance" | "app_prompt";
  clientInfo: {
    platform: "ios" | "android" | "web";
    appVersion: string;
  };
}

export interface LegalAcceptanceResponse {
  success: boolean;
  acceptanceId?: string;
  error?: string;
}

export interface LegalConfigResponse {
  success: boolean;
  config?: {
    currentTermsVersion: string;
    currentPrivacyVersion: string;
    termsLastUpdated: any;
    privacyLastUpdated: any;
    termsEffectiveDate: any;
    privacyEffectiveDate: any;
    materialChangesSummary: string | null;
  };
  error?: string;
}

// ============================================================================
// Sync Event Recipients (Add new members to an existing event)
// ============================================================================

export interface SyncEventRecipientsRequest {
  clubId: string;
  eventId: string;
  /** "preview" returns the diff without making changes; "confirm" applies the sync */
  mode: "preview" | "confirm";
  /** For recurring events: "single" = this occurrence only, "future" = this + all future */
  scope?: "single" | "future";
  /** Required when scope is "future" */
  recurringEventId?: string;
}

export interface SyncMemberDiff {
  userId: string;
  userName: string;
  photoUrl?: string | null;
}

export interface SyncEventRecipientsResponse {
  success: boolean;
  /** Members who are in the group but not yet in the event */
  added: SyncMemberDiff[];
  /** Members who are in the event but no longer in the group (informational only) */
  removed: SyncMemberDiff[];
  /** Count of members already in the event and still in the group */
  unchanged: number;
  /** Number of recurring occurrences updated (only for scope="future") */
  updatedOccurrences?: number;
  message?: string;
  error?: string;
}
