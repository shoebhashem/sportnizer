/**
 * TypeScript interfaces for Firebase Functions
 */

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

export interface GroupInvitationRequest {
  emails: string[];
  clubId: string;
  clubName: string;
  groupId: string;
  groupName: string;
  inviterName: string;
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

export interface ProcessGuardianInvitationRequest {
  invitationToken: string;
  guardianEmail: string;
  guardianName: string;
  guardianPhone?: string;
  relationship: string;
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
}

// Member management operation interfaces
export interface ClubMemberData {
  userId: string;
  roles: string[];
  photoURL: string;
  name: string;
  email: string;
  addedBy: string;
  joinedAt: Date;
  lastModifiedAt: Date;
  needsGuardian: boolean;
  guardiansContacts: any[];
}

export interface GroupMemberData {
  userId: string;
  roles: string[];
  joinedAt: Date;
  photoURL: string;
  name: string;
  email: string;
  needsGuardian: boolean;
  belongsToSubGroups: string[];
  guardiansContacts: any[];
}

export interface UserClubMembership {
  clubId: string;
  clubName: string;
  isAdmin: boolean;
  joinedAt: Date;
  lastModifiedAt: Date;
}

export interface UserGroupMembership {
  groupId: string;
  groupName: string;
  clubId: string;
  roles: string[];
  joinedAt: Date;
  lastModifiedAt: Date;
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
}

export interface UpdateUserGroupInfoRequest {
  uid: string;
  groupInfo?: UserGroupMembership; // Optional for remove operations
  groupId?: string; // Required for remove operations
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
export interface CreateSubGroupRequest {
  uid: string;
  clubId: string;
  groupId: string;
  subGroupName: string;
}

export interface CreateSubGroupResponse {
  success: boolean;
  message?: string;
  subGroupName?: string;
  error?: string;
}

// add member to Subgroup interfaces
export interface AddMemberToSubGroupRequest {
  clubId: string;
  groupId: string;
  subGroupName: string;
  userId: string;
}

export interface AddMemberToSubGroupResponse {
  success: boolean;
  message?: string;
  subGroupName?: string;
  error?: string;
}

// Remove member from Subgroup interfaces
export interface RemoveMemberFromSubGroupRequest {
  clubId: string;
  groupId: string;
  subGroupName: string;
  userId: string;
}

export interface RemoveMemberFromSubGroupResponse {
  success: boolean;
  message?: string;
  subGroupName?: string;
  error?: string;
}

// Remove member from Group interfaces
export interface RemoveMemberFromGroupRequest {
  clubId: string;
  groupId: string;
  userId: string;
}

export interface RemoveMemberFromGroupResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Event-related interfaces
export interface EventData {
  title: string;
  description: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  gatheringTime?: string; // ISO string - optional
  location: string;
  eventType: 'practice' | 'game' | 'meeting' | 'other';
  capacity?: {
    enabled: boolean;
    maxAttendees?: number;
  };
  responseDeadline?: {
    enabled: boolean;
    date?: string; // ISO string
  };
}

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
