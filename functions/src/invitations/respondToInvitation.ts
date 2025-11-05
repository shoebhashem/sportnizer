import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import {
    createClubMemberData,
    createGroupMemberData,
    createUserClubMembership,
    createUserGroupMembership
} from '../members/memberDataHelpers';
import { executeOrchestratorOperations } from '../members/orchestratorCore';
import { MembershipOperationRequest, RespondToInvitationRequest } from '../types/interfaces';
import { config } from '../utils/config';
import { handleCorsOptions, setCorsHeaders, validateHttpMethod } from '../utils/cors';
import {
    isInvitationExpired,
    validateInvitationAction,
    validateInvitationStatus,
    validateRequiredFields
} from '../utils/validation';

/**
 * Internal helper function to call the orchestrator
 * Uses the modular orchestrator function for membership operations
 */
async function callOrchestratorInternal(membershipRequest: MembershipOperationRequest) {
  console.log(`Calling modular orchestrator for user ${membershipRequest.uid}:`, membershipRequest.operations);
  
  try {
    // Call the shared orchestrator core function directly
    const result = await executeOrchestratorOperations(membershipRequest);
    return result;
  } catch (error: any) {
    console.error('Error calling modular orchestrator:', error);
    return {
      success: false,
      completedOperations: [],
      failedOperations: membershipRequest.operations,
      error: error.message || 'Failed to execute membership operations'
    };
  }
}

export const respondToInvitation = onRequest(
  {
    region: config.region,
    cors: true,
  },
  async (req, res) => {
    // Handle CORS
    setCorsHeaders(res);
    
    if (handleCorsOptions(req, res)) return;
    
    if (!validateHttpMethod(req, res, ['POST'])) return;

    try {
      const { invitationToken, uid, action }: RespondToInvitationRequest = req.body;
      console.log(`Processing invitation response - Token: ${invitationToken}, UID: ${uid}, Action: ${action}`);

      // Validate required fields
      validateRequiredFields(req.body, ['invitationToken', 'uid', 'action']);
      validateInvitationAction(action);

      // Get invitation details
      console.log(`Looking up invitation document: ${invitationToken}`);
      const invitationDoc = await admin.firestore()
        .collection('invitations')
        .doc(invitationToken)
        .get();

      if (!invitationDoc.exists) {
        console.log('Invitation document not found');
        res.status(404).json({ 
          success: false, 
          error: 'Invitation not found or expired' 
        });
        return;
      }

      const invitationData = invitationDoc.data();
      console.log('Invitation data found:', invitationData);

      // Validate invitation status
      validateInvitationStatus(invitationData);

      // Check if invitation has expired (if expiration is set)
      if (invitationData!.expiresAt && isInvitationExpired(invitationData!.expiresAt)) {
        res.status(400).json({ 
          success: false, 
          error: 'This invitation has expired' 
        });
        return;
      }

      // Fetch user from Firestore
      console.log(`Looking up user by UID: ${uid}`);
      const userRef = admin.firestore().collection('users').doc(uid);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        console.log('User document not found in Firestore');
        res.status(404).json({ 
          success: false, 
          error: 'User account not found. Please ensure you are signed in with the correct account.' 
        });
        return;
      }

      const userData = userDoc.data();
      console.log(`User found: ${uid}, Email: ${userData?.email}`);

      // Verify email matches the invitation
      if (userData?.email !== invitationData!.email) {
        console.log(`Email mismatch - Invitation: ${invitationData!.email}, User: ${userData?.email}`);
        res.status(400).json({ 
          success: false, 
          error: 'Email mismatch. Please sign in with the email address that received the invitation.' 
        });
        return;
      }

      if (action === 'reject') {
        // Mark invitation as rejected and delete
        console.log('Marking invitation as rejected and cleaning up');
        await invitationDoc.ref.update({
          used: true,
          status: 'rejected',
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          usedBy: uid,
        });

        // Delete the invitation after a short delay
        setTimeout(async () => {
          await invitationDoc.ref.delete();
        }, 1000);

        res.status(200).json({ 
          success: true, 
          message: 'Invitation rejected successfully' 
        });
        return;
      }

      // Handle accept action
      console.log(`Adding user ${uid} to group ${invitationData!.groupId} in club ${invitationData!.clubId}`);
      
      // Verify that the group exists
      const groupRef = admin.firestore()
        .collection('clubs')
        .doc(invitationData!.clubId)
        .collection('groups')
        .doc(invitationData!.groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        console.log('Group not found');
        res.status(404).json({ 
          success: false, 
          error: 'Group not found' 
        });
        return;
      }

      // Prepare data for the orchestrator
      const clubMemberData = createClubMemberData(uid, userData, invitationData, ['player']);
      const groupMemberData = createGroupMemberData(uid, userData, ['player']);
      const userClubInfo = createUserClubMembership(invitationData, false);
      const userGroupInfo = createUserGroupMembership(invitationData, ['player']);

      // Use the orchestrator to handle all membership operations
      const membershipRequest: MembershipOperationRequest = {
        operations: ['addToClub', 'addToGroup', 'updateUserClub', 'updateUserGroup'],
        clubId: invitationData!.clubId,
        groupId: invitationData!.groupId,
        uid: uid,
        clubMemberData: clubMemberData,
        groupMemberData: groupMemberData,
        userClubInfo: userClubInfo,
        userGroupInfo: userGroupInfo
      };

      console.log('Calling orchestrator for membership operations');
      
      // Call the orchestrator function directly (internal call)
      const orchestratorResult = await callOrchestratorInternal(membershipRequest);

      if (!orchestratorResult.success) {
        console.error('Orchestrator failed:', orchestratorResult.error);
        res.status(500).json({
          success: false,
          error: orchestratorResult.error || 'Failed to complete membership operations'
        });
        return;
      }

      console.log('Membership operations completed successfully');

      // Mark invitation as accepted (separate from membership operations)
      await invitationDoc.ref.update({
        used: true,
        status: 'accepted',
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        usedBy: uid,
      });
      console.log('All updates completed successfully');

      // Clean up invitation after successful processing
      setTimeout(async () => {
        await invitationDoc.ref.delete();
        console.log('Invitation cleaned up');
      }, 5000);

      res.status(200).json({ 
        success: true, 
        message: `Successfully joined ${invitationData!.groupName}!`,
        groupName: invitationData!.groupName
      });

    } catch (error) {
      console.error('Error responding to invitation:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);
