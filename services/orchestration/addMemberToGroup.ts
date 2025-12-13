// /services/orchestration/addMemberToGroup.ts - Group invitation and member addition orchestration
// Coordinates email sending and member addition workflow following three-layer architecture

import { httpsCallable } from 'firebase/functions';
import { functions } from '../core/firebase';
import { fetchGroupMembers } from '../fetchGroupMembers';
import type { GroupMemberData } from '../types/group';

export interface GroupInvitationData {
  emails: string[];
  clubId: string;
  clubName: string;
  groupId: string;
  groupName: string;
  inviterName: string;
}

export interface InvitationSendResult {
  success: boolean;
  results?: {
    email: string;
    success: boolean;
    error?: string;
    invitationToken?: string;
  }[];
  error?: string;
}

export interface InvitationProcessResult {
  success: boolean;
  action: 'added_to_group' | 'already_member' | 'account_creation_required';
  message: string;
  userExists: boolean;
  error?: string;
}

/**
 * Orchestrating service for group invitation and member addition workflow
 * Handles the complete flow from email sending to member addition
 */
export const addMemberToGroupService = {
  /**
   * Add existing users directly to group (for users who are already logged in)
   * This method bypasses email invitation and directly adds users who already have accounts
   */
  async addExistingUsersToGroup(invitationData: GroupInvitationData): Promise<InvitationSendResult> {
    try {
      console.log('🚀 Orchestrating direct user addition to group:', {
        emails: invitationData.emails,
        clubId: invitationData.clubId,
        groupId: invitationData.groupId
      });

      const results: {
        email: string;
        success: boolean;
        error?: string;
        invitationToken?: string;
      }[] = [];

      // Process each email address
      for (const email of invitationData.emails) {
        try {
          console.log(`👤 Processing direct addition for: ${email}`);
          
          // Check if user exists
          const getUserByEmailFn = httpsCallable(functions, 'getUserByEmail');
          const userResult = await getUserByEmailFn({ email: email.trim().toLowerCase() });
          const userResponse = userResult.data as { success: boolean; userExists: boolean; userId?: string; userProfile?: any; error?: string };

          if (!userResponse.success) {
            console.error(`❌ Error looking up user ${email}:`, userResponse.error);
            results.push({
              email,
              success: false,
              error: userResponse.error || 'Failed to lookup user'
            });
            continue;
          }

          if (!userResponse.userExists) {
            console.log(`📧 User ${email} doesn't exist, will send email invitation instead`);
            // Fall back to email invitation for non-existing users
            const sendResult = await this.sendSingleEmailInvitation(email, invitationData);
            results.push(sendResult);
            continue;
          }

          const userId = userResponse.userId!;
          console.log(`✅ User exists: ${userId}`);

          // Check if user is already in the group
          const groupMembersResult = await fetchGroupMembers(invitationData.clubId, invitationData.groupId);
          
          if (groupMembersResult.success) {
            const existingMember = groupMembersResult.members.find((member: GroupMemberData) => member.userId === userId);
            
            if (existingMember) {
              console.log(`ℹ️ User ${email} is already a member of this group`);
              results.push({
                email,
                success: true,
                error: 'User is already a member of this group'
              });
              continue;
            }
          }

          // Add user to group directly
          console.log(`➕ Adding user ${email} to group...`);
          
          // Add to group collection
          const addMemberToGroupFn = httpsCallable(functions, 'addMemberToGroup');
          const memberData = {
            userId,
            name: userResponse.userProfile?.displayName || userResponse.userProfile?.name || email.split('@')[0],
            email: email.trim().toLowerCase(),
            roles: ['player'], // Default role for invited members (must be array)
            joinedAt: new Date(),
            photoURL: userResponse.userProfile?.photoURL || '',
            needsGuardian: false, // Default for adults
            belongsToSubGroups: [],
            guardiansContacts: []
          };

          const addResult = await addMemberToGroupFn({
            clubId: invitationData.clubId,
            groupId: invitationData.groupId,
            memberData
          });

          const addResponse = addResult.data as { success: boolean; error?: string };
          
          if (!addResponse.success) {
            console.error(`❌ Failed to add ${email} to group:`, addResponse.error);
            results.push({
              email,
              success: false,
              error: addResponse.error || 'Failed to add to group'
            });
            continue;
          }

          // Update user document
          console.log(`📄 Updating user document for ${email}...`);
          const updateUserGroupInfoFn = httpsCallable(functions, 'updateUserGroupInfo');
          const updateResult = await updateUserGroupInfoFn({
            uid: userId,
            clubId: invitationData.clubId,
            groupInfo: {
              groupId: invitationData.groupId,
              groupName: invitationData.groupName,
              joinedAt: new Date()
            },
            roles: ['player'],
            operation: 'add'
          });

          const updateResponse = updateResult.data as { success: boolean; error?: string };
          
          if (!updateResponse.success) {
            console.error(`❌ Failed to update user document for ${email}:`, updateResponse.error);
            results.push({
              email,
              success: false,
              error: updateResponse.error || 'Added to group but failed to update profile'
            });
            continue;
          }

          console.log(`🎉 Successfully added ${email} to group!`);
          results.push({
            email,
            success: true
          });

        } catch (error: any) {
          console.error(`❌ Error processing ${email}:`, error);
          results.push({
            email,
            success: false,
            error: error.message || 'Unknown error'
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      console.log(`📊 Direct addition completed: ${successCount} success, ${failureCount} failures`);

      return {
        success: successCount > 0,
        results
      };

    } catch (error: any) {
      console.error('❌ Error in addExistingUsersToGroup orchestration:', error);
      return {
        success: false,
        error: error.message || 'Failed to add users to group'
      };
    }
  },

  /**
   * Helper method to send a single email invitation
   */
  async sendSingleEmailInvitation(email: string, invitationData: GroupInvitationData): Promise<{
    email: string;
    success: boolean;
    error?: string;
    invitationToken?: string;
  }> {
    try {
      const sendGroupInvitationFn = httpsCallable(functions, 'sendGroupInvitation');
      const result = await sendGroupInvitationFn({
        ...invitationData,
        emails: [email]
      });

      const response = result.data as { success: boolean; results?: any[]; error?: string };

      if (!response.success || !response.results || response.results.length === 0) {
        return {
          email,
          success: false,
          error: response.error || 'Failed to send email invitation'
        };
      }

      return response.results[0];
    } catch (error: any) {
      return {
        email,
        success: false,
        error: error.message || 'Failed to send email invitation'
      };
    }
  },

  /**
   * Send group invitations via email
   * Orchestrates the email sending process using atomic functions
   */
  async sendInvitations(invitationData: GroupInvitationData): Promise<InvitationSendResult> {
    try {
      console.log('🚀 Orchestrating group invitation send:', {
        emails: invitationData.emails,
        clubId: invitationData.clubId,
        groupId: invitationData.groupId
      });

      // Call atomic function for sending emails
      const sendGroupInvitationFn = httpsCallable(functions, 'sendGroupInvitation');
      const result = await sendGroupInvitationFn(invitationData);

      const response = result.data as { success: boolean; results?: any[]; error?: string };

      if (!response.success) {
        console.error('❌ Failed to send invitations:', response.error);
        return { success: false, error: response.error };
      }

      console.log('✅ Invitations sent successfully');
      return {
        success: true,
        results: response.results
      };

    } catch (error: any) {
      console.error('❌ Error in sendInvitations orchestration:', error);
      return {
        success: false,
        error: error.message || 'Failed to send invitations'
      };
    }
  },

  /**
   * Process invitation when user clicks invitation link
   * Orchestrates user lookup, group membership check, and member addition
   */
  async processInvitation(invitationToken: string): Promise<InvitationProcessResult> {
    try {
      console.log('🚀 Orchestrating invitation processing for token:', invitationToken);

      // Step 1: Validate invitation token
      console.log('📋 Step 1: Validating invitation token...');
      const validateTokenFn = httpsCallable(functions, 'validateInvitationToken');
      const tokenResult = await validateTokenFn({ invitationToken });
      const tokenResponse = tokenResult.data as { success: boolean; isValid: boolean; invitationData?: any; error?: string };

      if (!tokenResponse.success || !tokenResponse.isValid) {
        console.error('❌ Invalid invitation token:', tokenResponse.error);
        return {
          success: false,
          action: 'account_creation_required',
          message: tokenResponse.error || 'Invalid invitation token',
          userExists: false,
          error: tokenResponse.error
        };
      }

      const invitationData = tokenResponse.invitationData;
      const invitedEmail = invitationData.email;

      // Step 2: Check if user exists
      console.log('👤 Step 2: Checking if user exists for email:', invitedEmail);
      const getUserByEmailFn = httpsCallable(functions, 'getUserByEmail');
      const userResult = await getUserByEmailFn({ email: invitedEmail });
      const userResponse = userResult.data as { success: boolean; userExists: boolean; userId?: string; userProfile?: any; error?: string };

      if (!userResponse.success) {
        console.error('❌ Error looking up user:', userResponse.error);
        return {
          success: false,
          action: 'account_creation_required',
          message: 'Error checking user account',
          userExists: false,
          error: userResponse.error
        };
      }

      // Step 3: Handle user doesn't exist case
      if (!userResponse.userExists) {
        console.log('🆕 User doesn\'t exist, account creation required');
        return {
          success: true,
          action: 'account_creation_required',
          message: 'Please create a Sportnizer account first, then you will be automatically added to the group.',
          userExists: false
        };
      }

      const userId = userResponse.userId!;
      console.log('✅ User exists:', userId);

      // Step 4: Check if user is already in the group
      console.log('🔍 Step 4: Checking if user is already in group...');
      const groupMembersResult = await fetchGroupMembers(invitationData.clubId, invitationData.groupId);
      
      if (groupMembersResult.success) {
        const existingMember = groupMembersResult.members.find((member: GroupMemberData) => member.userId === userId);
        
        if (existingMember) {
          console.log('ℹ️ User is already a member of this group');
          // Mark invitation as used
          const markUsedFn = httpsCallable(functions, 'markInvitationUsed');
          await markUsedFn({ 
            invitationToken, 
            userId, 
            status: 'accepted' 
          });
          
          return {
            success: true,
            action: 'already_member',
            message: 'You are already a member of this group.',
            userExists: true
          };
        }
      }

      // Step 5: Add user to group
      console.log('➕ Step 5: Adding user to group...');
      
      // 5a. Add to group collection
      const addMemberToGroupFn = httpsCallable(functions, 'addMemberToGroup');
      const memberData = {
        userId,
        displayName: userResponse.userProfile?.displayName || invitedEmail,
        email: invitedEmail,
        role: 'player', // Default role for invited members
        joinedAt: new Date(),
        isActive: true,
        belongsToSubGroups: []
      };

      const addResult = await addMemberToGroupFn({
        clubId: invitationData.clubId,
        groupId: invitationData.groupId,
        memberData
      });

      const addResponse = addResult.data as { success: boolean; error?: string };
      
      if (!addResponse.success) {
        console.error('❌ Failed to add member to group:', addResponse.error);
        return {
          success: false,
          action: 'account_creation_required',
          message: 'Error adding you to the group',
          userExists: true,
          error: addResponse.error
        };
      }

      // 5b. Update user document
      console.log('📄 Updating user document with group access...');
      const updateUserGroupInfoFn = httpsCallable(functions, 'updateUserGroupInfo');
      const updateResult = await updateUserGroupInfoFn({
        uid: userId,
        clubId: invitationData.clubId,
        groupInfo: {
          groupId: invitationData.groupId,
          groupName: invitationData.groupName,
          joinedAt: new Date()
        },
        roles: ['player'],
        operation: 'add'
      });

      const updateResponse = updateResult.data as { success: boolean; error?: string };
      
      if (!updateResponse.success) {
        console.error('❌ Failed to update user document:', updateResponse.error);
        // TODO: Consider rollback of group addition
        return {
          success: false,
          action: 'added_to_group',
          message: 'Added to group but failed to update profile',
          userExists: true,
          error: updateResponse.error
        };
      }

      // Step 6: Mark invitation as used
      console.log('✅ Marking invitation as used...');
      const markUsedFn = httpsCallable(functions, 'markInvitationUsed');
      await markUsedFn({ 
        invitationToken, 
        userId, 
        status: 'accepted' 
      });

      console.log('🎉 Successfully added user to group!');
      return {
        success: true,
        action: 'added_to_group',
        message: `You have been successfully added to ${invitationData.groupName}!`,
        userExists: true
      };

    } catch (error: any) {
      console.error('❌ Error in processInvitation orchestration:', error);
      return {
        success: false,
        action: 'account_creation_required',
        message: 'Error processing invitation',
        userExists: false,
        error: error.message || 'Failed to process invitation'
      };
    }
  }
};
