/**
 * TypeScript interfaces for Firebase Functions
 */

// Group invitation interfaces
export interface GroupInvitationData {
  email: string;
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
  userEmail: string;
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

export interface SendEmailVerificationRequest {
  email: string;
  uid: string;
  fullName: string;
}

export interface ResendVerificationEmailRequest {
  email: string;
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
