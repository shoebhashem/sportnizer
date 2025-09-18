import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { RespondToInvitationRequest } from '../types/interfaces';
import { config } from '../utils/config';
import { handleCorsOptions, setCorsHeaders, validateHttpMethod } from '../utils/cors';
import { createOrUpdateUserWithGroup } from '../utils/userManagement';
import {
    isInvitationExpired,
    validateEmailMatch,
    validateInvitationAction,
    validateInvitationStatus,
    validateRequiredFields
} from '../utils/validation';

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
      const { invitationToken, userEmail, action }: RespondToInvitationRequest = req.body;
      console.log(`Processing invitation response - Token: ${invitationToken}, Email: ${userEmail}, Action: ${action}`);

      // Validate required fields
      validateRequiredFields(req.body, ['invitationToken', 'userEmail', 'action']);
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

      // Verify email matches
      console.log(`Verifying email match - Invitation: ${invitationData!.email}, User: ${userEmail.trim().toLowerCase()}`);
      validateEmailMatch(invitationData!.email, userEmail);

      // Find user by email
      console.log(`Looking up user by email: ${userEmail}`);
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(userEmail);
        console.log(`User found: ${userRecord.uid}`);
      } catch (authError: any) {
        console.log('User not found in Auth:', authError?.message || authError);
        res.status(404).json({ 
          success: false, 
          error: 'User account not found. Please create an account first or sign in with the correct email address.' 
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
          usedBy: userRecord.uid,
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
      console.log(`Adding user ${userRecord.uid} to group ${invitationData!.groupId}`);
      const groupRef = admin.firestore().collection('groups').doc(invitationData!.groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        console.log('Group not found');
        res.status(404).json({ 
          success: false, 
          error: 'Group not found' 
        });
        return;
      }

      const batch = admin.firestore().batch();

      // Add user to group members subcollection
      console.log('Adding user to group members subcollection');
      const memberRef = admin.firestore()
        .collection('groups')
        .doc(invitationData!.groupId)
        .collection('members')
        .doc(userRecord.uid);
      
      batch.set(memberRef, {
        role: 'member',
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        invitedBy: invitationData!.inviterUid,
      });

      // Update group member count
      batch.update(groupRef, {
        membersCount: admin.firestore.FieldValue.increment(1)
      });

      // Create or update user profile
      console.log('Adding group to user profile with new schema');
      await createOrUpdateUserWithGroup(userRecord, invitationData!.groupId, 'member');
      
      console.log(`Added group ${invitationData!.groupId} to user ${userRecord.uid} using new GroupMembership structure`);

      // Mark invitation as accepted
      console.log('Marking invitation as accepted');
      batch.update(invitationDoc.ref, {
        used: true,
        status: 'accepted',
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        usedBy: userRecord.uid,
      });

      // Execute all updates
      await batch.commit();
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
