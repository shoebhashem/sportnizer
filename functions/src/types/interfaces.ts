/**
 * TypeScript interfaces for Firebase Functions
 */

// Notification interfaces
export type NotificationType = 
  | 'group_invitation' 
  | 'youth_member_invitation'
  | 'announcement' 
  | 'event' 
  | 'poll'
  | 'role_changed'
  | 'member_joined'
  | 'event_cancelled';

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
  priority?: 'low' | 'normal' | 'high';
  actionUrl?: string;
  metadata?: {
    action?: 'role_update' | 'new_member';
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
  youthData?: YouthData;     // Optional: Youth member data for youth invitations
  priority?: 'low' | 'normal' | 'high';
  metadata?: {
    action?: 'role_update' | 'new_member';
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
  status: 'pending' | 'accepted' | 'rejected';
  usedAt?: any;
  usedBy?: string;
  expiresAt?: any;
}

export interface YouthData {
  childName: string;
  dateOfBirth: string;
  relationship: string;
}

export interface GroupInvitationRequest {
  emails: string[];
  clubId: string;
  clubName: string;
  groupId: string;
  groupName: string;
  inviterName: string;
  inviterUid?: string;       // Optional: UID of inviter (defaults to request.auth.uid)
  invitationType?: 'regular' | 'youth_member';  // Optional: Type of invitation
  youthData?: YouthData;     // Optional: Youth member data for youth invitations
  role?: 'member' | 'coach'; // Optional: Role to assign (defaults to 'member')
}

export interface ProcessInvitationRequest {
  invitationToken: string;
  userEmail: string;
}

export interface RespondToInvitationRequest {
  invitationToken: string;
  uid: string;
  action: 'accept' | 'reject';
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
  status: 'pending' | 'accepted' | 'rejected';
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
  invitationType: 'group-member' | 'coach' | 'admin';
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
  invitationType?: 'group-member' | 'coach' | 'admin';
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
  isExistingUser?: boolean;  // Indicates if user already has an account
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
  isActive?: boolean;  // false = soft deleted, undefined/true = active
  inactiveSince?: Date | null;  // When member was marked inactive
  scheduledForDeletion?: Date | null;  // When permanent deletion is scheduled (30 days from inactiveSince)
  reactivatedAt?: Date;  // When member was last reactivated
  reactivationCount?: number;  // How many times member has been reactivated
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
  isActive?: boolean;  // false = soft deleted, undefined/true = active
  inactiveSince?: Date | null;  // When member was marked inactive
  scheduledForDeletion?: Date | null;  // When permanent deletion is scheduled (30 days from inactiveSince)
  reactivatedAt?: Date;  // When member was last reactivated
  reactivationCount?: number;  // How many times member has been reactivated
}

export interface UserClubMembership {
  clubId: string;
  clubName: string;
  role: string;
  joinedAt: Date;
  lastModifiedAt: Date;
  // 🆕 Soft delete fields
  isActive?: boolean;  // false = soft deleted, undefined/true = active
  inactiveSince?: Date | null;  // When club membership was marked inactive
  scheduledForDeletion?: Date | null;  // When permanent deletion is scheduled
  reactivatedAt?: Date;  // When membership was last reactivated
  reactivationCount?: number;  // How many times reactivated
}

export interface UserGroupMembership {
  groupId: string;
  groupName: string;
  roles: string[]; // User's roles in this group
  joinedAt: Date;
  lastModifiedAt: Date;
  // 🆕 Soft delete fields
  isActive?: boolean;  // false = soft deleted, undefined/true = active
  inactiveSince?: Date | null;  // When membership was marked inactive
  scheduledForDeletion?: Date | null;  // When permanent deletion is scheduled
  reactivatedAt?: Date;  // When membership was last reactivated
  reactivationCount?: number;  // How many times reactivated
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
  operation: 'add' | 'remove';
}

// Orchestration interface
export interface MembershipOperationRequest {
  operations: ('addToClub' | 'addToGroup' | 'updateUserClub' | 'updateUserGroup')[];
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
  subGroupId: string;  // Changed from subGroupName to subGroupId
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
  subGroupId: string;  // Changed from subGroupName to subGroupId
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

// Event-related interfaces
export interface EventResponse {
  userId: string;
  userName: string;
  photoUrl: string;
  response: 'pending' | 'accepted' | 'declined';
  respondedAt?: Date;
}

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
  targetScope: 'club' | 'group' | 'subgroup';
  capacityLimit?: number | null;
  responseDeadline?: string | null; // ISO string
  responses?: EventResponse[];
  isActive?: boolean;
}

// Legacy interface - keep for backward compatibility
export interface RecipientSelection {
  type: 'selected-groups';
  groups: {
    groupId: string;
    scope: 'entire' | 'subgroups' | 'members';
    subgroupIds?: string[];
    memberIds?: string[];
  }[];
  totalCount: number;
}

// New level-based event creation interface
export interface CreateEventRequestV2 {
  clubId: string;
  level: 'club' | 'group' | 'subgroup';
  targetId?: string; // groupId when level is 'group' or 'subgroup'
  subgroupId?: string; // subgroupId when level is 'subgroup'
  eventData: EventData;
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
    eventType: 'practice' | 'game' | 'meeting' | 'other';
  };
  operation: 'add' | 'remove';
}

export interface UpdateUserEventsInfoResponse {
  success: boolean;
  updated: number;
  failed: string[];
  useBatchProcessing: boolean;
  message: string;
}
