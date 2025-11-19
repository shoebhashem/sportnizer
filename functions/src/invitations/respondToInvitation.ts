import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { RespondToInvitationRequest } from '../types/interfaces';
import { config } from '../utils/config';
import { handleCorsOptions, setCorsHeaders, validateHttpMethod } from '../utils/cors';
import {
    isInvitationExpired,
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

      const batch = admin.firestore().batch();
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const currentDate = new Date(); // Use regular Date for array elements

      // 1. Add user to /clubs/{clubId}/allMembers/members (append to array)
      console.log('Adding user to club allMembers array');
      const clubMemberRef = admin.firestore()
        .collection('clubs')
        .doc(invitationData!.clubId)
        .collection('allMembers')
        .doc('members');
      
      const newClubMember = {
        userId: uid,
        roles: ['player'], // Default role for invited members
        photoURL: userData?.photoURL || '',
        name: userData?.displayName || userData?.email?.split('@')[0] || 'Unknown',
        email: userData?.email || '',
        addedBy: invitationData!.inviterUid,
        joinedAt: currentDate, // Use regular Date for arrays
        lastModifiedAt: currentDate,
        needsGuardian: userData?.needsGuardian || false,
        guardiansContacts: userData?.guardiansContacts || [],
      };

      batch.update(clubMemberRef, {
        membersList: admin.firestore.FieldValue.arrayUnion(newClubMember)
      });

      // 2. Add user to /clubs/{clubId}/groups/{groupId}/allMembers/members (append to array)
      console.log('Adding user to group allMembers array');
      const groupMemberRef = admin.firestore()
        .collection('clubs')
        .doc(invitationData!.clubId)
        .collection('groups')
        .doc(invitationData!.groupId)
        .collection('allMembers')
        .doc('members');
      
      const newGroupMember = {
        userId: uid,
        roles: ['player'], // Default role for invited members
        joinedAt: currentDate, // Use regular Date for arrays
        photoURL: userData?.photoURL || '',
        name: userData?.displayName || userData?.email?.split('@')[0] || 'Unknown',
        email: userData?.email || '',
        needsGuardian: userData?.needsGuardian || false,
        belongtoSubGroups: userData?.belongtoSubGroups || [],
        guardiansContacts: userData?.guardiansContacts || [],
      };

      batch.update(groupMemberRef, {
        membersList: admin.firestore.FieldValue.arrayUnion(newGroupMember)
      });

      // 3. Update user document /users/{uid}
      console.log('Updating user profile with club and group membership');
      // We already have userRef, userDoc, and userData from above
      
      let clubAccess = userData?.clubAccess || userData?.clubs || []; // Support backward compatibility
      let groupAccess = userData?.groupAccess || userData?.groupsJoined || [];

      // Add club membership if not already exists
      const existingClubIndex = clubAccess.findIndex((club: any) => club.clubId === invitationData!.clubId);
      if (existingClubIndex === -1) {
        clubAccess.push({
          clubId: invitationData!.clubId,
          clubName: invitationData!.clubName, // Use club name from invitation data
          role: 'member', // Updated field name
          joinedAt: currentDate, // Use regular Date for array elements
          lastModifiedAt: currentDate, // Add required field
        });
      }

      // Add group membership if not already exists
      const existingGroupIndex = groupAccess.findIndex((group: any) => group.groupId === invitationData!.groupId);
      if (existingGroupIndex === -1) {
        groupAccess.push({
          groupId: invitationData!.groupId,
          groupName: invitationData!.groupName,
          clubId: invitationData!.clubId,
          roles: ['member'], // Changed to roles array
          joinedAt: currentDate, // Use regular Date for array elements
          lastModifiedAt: currentDate, // Add required field
        });
      }

      batch.update(userRef, {
        clubAccess: clubAccess,
        groupAccess: groupAccess,
      });

      // 4. Update group member count
      batch.update(groupRef, {
        membersCount: admin.firestore.FieldValue.increment(1)
      });

      // 5. Mark invitation as accepted
      console.log('Marking invitation as accepted');
        batch.update(invitationDoc.ref, {
          used: true,
          status: 'accepted',
          usedAt: timestamp,
          usedBy: uid,
        });      // Execute all updates
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
