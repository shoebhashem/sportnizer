// /services/orchestration/addRegularMemberToGroup.ts - Group invitation orchestration service
// Handles the complete invitation workflow following three-layer architecture
// Coordinates user existence check and branches to appropriate invitation flow

import { httpsCallable } from 'firebase/functions';
import { functions } from '../core/firebase';

export interface GroupInvitationRequest {
  emails: string[];
  clubId: string;
  clubName: string;
  groupId: string;
  groupName: string;
  inviterName: string;
  inviterUid: string;
}

export interface GroupInvitationResult {
  success: boolean;
  results?: {
    email: string;
    success: boolean;
    userExists: boolean;
    action: 'in_app_notification' | 'email_invitation' | 'error';
    error?: string;
    invitationId?: string;
  }[];
  error?: string;
}

export interface GroupInviteData {
  inviteId: string;
  clubId: string;
  clubName: string;
  groupId: string;
  groupName: string;
  inviterName: string;
  inviterUid: string;
  invitedAt: Date;
  status: 'pending' | 'accepted' | 'rejected';
  type: 'group_invitation';
}

export interface AcceptRejectInviteRequest {
  inviteId: string;
  action: 'accept' | 'reject';
  clubId: string;
  groupId: string;
}

export interface AcceptRejectResult {
  success: boolean;
  action: 'accepted' | 'rejected' | 'error';
  message: string;
  error?: string;
}

/**
 * Orchestrating service for group invitation workflow
 * Implements the new requirements-compliant invitation system
 */
export const addRegularMemberToGroupService = {
  /**
   * Main invitation workflow orchestrator
   * Checks user existence and branches to appropriate flow
   */
  async inviteUsersToGroup(request: GroupInvitationRequest): Promise<GroupInvitationResult> {
    try {
      console.log('🚀 Starting group invitation workflow:', {
        emails: request.emails,
        clubId: request.clubId,
        groupId: request.groupId
      });

      const results: GroupInvitationResult['results'] = [];

      // Process each email address
      for (const email of request.emails) {
        try {
          console.log(`👤 Processing invitation for: ${email}`);
          
          // Step 1: Check if user exists using atomic function
          const getUserByEmailFn = httpsCallable(functions, 'getUserByEmail');
          const userResult = await getUserByEmailFn({ email: email.trim().toLowerCase() });
          const userResponse = userResult.data as { 
            success: boolean; 
            userExists: boolean; 
            userId?: string; 
            error?: string; 
          };

          if (!userResponse.success) {
            console.error(`❌ Error checking user existence for ${email}:`, userResponse.error);
            results.push({
              email,
              success: false,
              userExists: false,
              action: 'error',
              error: userResponse.error || 'Failed to check user existence'
            });
            continue;
          }

          if (userResponse.userExists && userResponse.userId) {
            // User exists - create in-app notification
            console.log(`✅ User exists: ${userResponse.userId}, creating in-app notification`);
            
            const notificationResult = await this.createInAppGroupInvitation({
              userId: userResponse.userId,
              email,
              clubId: request.clubId,
              clubName: request.clubName,
              groupId: request.groupId,
              groupName: request.groupName,
              inviterName: request.inviterName,
              inviterUid: request.inviterUid
            });

            results.push({
              email,
              success: notificationResult.success,
              userExists: true,
              action: notificationResult.success ? 'in_app_notification' : 'error',
              error: notificationResult.error,
              invitationId: notificationResult.invitationId
            });
          } else {
            // User doesn't exist - send email invitation
            console.log(`📧 User doesn't exist, sending email invitation to: ${email}`);
            
            const emailResult = await this.sendEmailGroupInvitation({
              email,
              clubId: request.clubId,
              clubName: request.clubName,
              groupId: request.groupId,
              groupName: request.groupName,
              inviterName: request.inviterName,
              inviterUid: request.inviterUid
            });

            results.push({
              email,
              success: emailResult.success,
              userExists: false,
              action: emailResult.success ? 'email_invitation' : 'error',
              error: emailResult.error,
              invitationId: emailResult.invitationId
            });
          }

        } catch (error: any) {
          console.error(`❌ Error processing invitation for ${email}:`, error);
          results.push({
            email,
            success: false,
            userExists: false,
            action: 'error',
            error: error.message || 'Unknown error'
          });
        }
      }

      const successCount = results?.filter(r => r.success).length || 0;
      console.log(`📊 Invitation workflow completed: ${successCount}/${request.emails.length} successful`);

      return {
        success: successCount > 0,
        results
      };

    } catch (error: any) {
      console.error('❌ Error in group invitation workflow:', error);
      return {
        success: false,
        error: error.message || 'Failed to process group invitations'
      };
    }
  },

  /**
   * Create in-app notification for existing users
   */
  async createInAppGroupInvitation(params: {
    userId: string;
    email: string;
    clubId: string;
    clubName: string;
    groupId: string;
    groupName: string;
    inviterName: string;
    inviterUid: string;
  }): Promise<{ success: boolean; invitationId?: string; error?: string }> {
    try {
      console.log(`📱 Creating in-app invitation for user: ${params.userId}`);
      
      // Call atomic function to add groupInvite to user document
      const addGroupInviteFn = httpsCallable(functions, 'addGroupInviteToUser');
      const result = await addGroupInviteFn({
        userId: params.userId,
        inviteData: {
          clubId: params.clubId,
          clubName: params.clubName,
          groupId: params.groupId,
          groupName: params.groupName,
          inviterName: params.inviterName,
          inviterUid: params.inviterUid,
          invitedAt: new Date(),
          status: 'pending',
          type: 'group_invitation'
        }
      });

      const response = result.data as { success: boolean; invitationId?: string; error?: string };
      
      if (response.success) {
        console.log(`✅ In-app invitation created with ID: ${response.invitationId}`);
      } else {
        console.error(`❌ Failed to create in-app invitation:`, response.error);
      }

      return response;

    } catch (error: any) {
      console.error('❌ Error creating in-app invitation:', error);
      return {
        success: false,
        error: error.message || 'Failed to create in-app invitation'
      };
    }
  },

  /**
   * Send email invitation for non-existing users
   */
  async sendEmailGroupInvitation(params: {
    email: string;
    clubId: string;
    clubName: string;
    groupId: string;
    groupName: string;
    inviterName: string;
    inviterUid: string;
  }): Promise<{ success: boolean; invitationId?: string; error?: string }> {
    try {
      console.log(`📧 Sending email invitation to: ${params.email}`);
      
      // Call updated sendGroupInvitation atomic function
      const sendInvitationFn = httpsCallable(functions, 'sendGroupInvitation');
      const result = await sendInvitationFn({
        emails: [params.email],
        clubId: params.clubId,
        clubName: params.clubName,
        groupId: params.groupId,
        groupName: params.groupName,
        inviterName: params.inviterName,
        inviterUid: params.inviterUid
      });

      const response = result.data as { 
        success: boolean; 
        results?: { email: string; success: boolean; invitationToken?: string; error?: string }[]; 
        error?: string; 
      };

      if (response.success && response.results && response.results.length > 0) {
        const emailResult = response.results[0];
        return {
          success: emailResult.success,
          invitationId: emailResult.invitationToken,
          error: emailResult.error
        };
      } else {
        return {
          success: false,
          error: response.error || 'Failed to send email invitation'
        };
      }

    } catch (error: any) {
      console.error('❌ Error sending email invitation:', error);
      return {
        success: false,
        error: error.message || 'Failed to send email invitation'
      };
    }
  },

  /**
   * Handle accept/reject responses from existing users (in-app notifications)
   */
  async respondToGroupInvite(request: AcceptRejectInviteRequest): Promise<AcceptRejectResult> {
    try {
      console.log(`🔄 Processing invitation response:`, {
        inviteId: request.inviteId,
        action: request.action
      });

      // Call atomic function to handle the response
      const respondToInviteFn = httpsCallable(functions, 'respondToGroupInvite');
      const result = await respondToInviteFn(request);
      
      const response = result.data as AcceptRejectResult;
      
      console.log(`✅ Invitation response processed: ${response.action}`);
      return response;

    } catch (error: any) {
      console.error('❌ Error processing invitation response:', error);
      return {
        success: false,
        action: 'error',
        message: 'Failed to process invitation response',
        error: error.message || 'Unknown error'
      };
    }
  }
};
