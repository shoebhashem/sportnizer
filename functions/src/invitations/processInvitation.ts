import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { ProcessInvitationRequest } from '../types/interfaces';
import { config } from '../utils/config';
import { handleCorsOptions, setCorsHeaders, validateHttpMethod } from '../utils/cors';
import { createOrUpdateUserWithGroup } from '../utils/userManagement';
import { validateEmailMatch, validateInvitationStatus, validateRequiredFields } from '../utils/validation';

export const processInvitation = onRequest(
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
      const { invitationToken, userEmail }: ProcessInvitationRequest = req.body;
      console.log(`Processing invitation request - Token: ${invitationToken}, Email: ${userEmail}`);

      // Validate required fields
      validateRequiredFields(req.body, ['invitationToken', 'userEmail']);

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

      // Check if invitation has already been used
      if (invitationData!.used) {
        console.log('Invitation already used');
        res.status(400).json({ 
          success: false, 
          error: 'This invitation has already been used' 
        });
        return;
      }

      // Verify email matches
      console.log(`Verifying email match - Invitation: ${invitationData!.email}, User: ${userEmail.trim().toLowerCase()}`);
      validateEmailMatch(invitationData!.email, userEmail);

      // Find user by email
      console.log(`Looking up user by email: ${userEmail}`);
      const userRecord = await admin.auth().getUserByEmail(userEmail);
      console.log(`User found: ${userRecord.uid}`);

      // Check if group exists
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

      // Add user to group members and update user profile
      console.log('Updating group with new member and user profile');
      
      const batch = admin.firestore().batch();

      // Add user to group members subcollection
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
      await createOrUpdateUserWithGroup(userRecord, invitationData!.groupId, 'member');
      
      console.log(`Added group ${invitationData!.groupId} to user ${userRecord.uid} using GroupMembership structure`);

      // Mark invitation as used
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
        try {
          await invitationDoc.ref.delete();
          console.log('Invitation cleaned up');
        } catch (cleanupError) {
          console.error('Error cleaning up invitation:', cleanupError);
        }
      }, 5000);

      console.log(`Successfully added user to group: ${invitationData!.groupName}`);
      res.status(200).json({ 
        success: true, 
        message: `Successfully added to ${invitationData!.groupName}` 
      });

    } catch (error) {
      console.error('Error processing invitation:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);
