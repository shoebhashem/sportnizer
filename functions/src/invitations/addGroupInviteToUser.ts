import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export interface AddGroupInviteRequest {
  userId: string;
  inviteData: {
    clubId: string;
    clubName: string;
    groupId: string;
    groupName: string;
    inviterName: string;
    inviterUid: string;
    invitedAt: Date;
    status: 'pending';
    type: 'group_invitation';
  };
}

export interface AddGroupInviteResponse {
  success: boolean;
  invitationId?: string;
  error?: string;
}

export const addGroupInviteToUser = onCall(
  {
    region: config.region,
  },
  async (request): Promise<AddGroupInviteResponse> => {
    try {
      const { userId, inviteData }: AddGroupInviteRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['userId', 'inviteData']);
      validateRequiredFields(inviteData, [
        'clubId', 'clubName', 'groupId', 'groupName', 
        'inviterName', 'inviterUid', 'invitedAt', 'status', 'type'
      ]);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Adding group invite to user: ${userId} for group: ${inviteData.groupName}`);

      const db = admin.firestore();
      
      // Get user document
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User document not found');
      }

      const userData = userDoc.data();
      
      // Generate unique invitation ID
      const invitationId = db.collection('temp').doc().id;
      
      // Create the invitation object with ID
      const invitationWithId = {
        ...inviteData,
        inviteId: invitationId,
        invitedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Check if user already has clubAccess array, if not create it
      let clubAccess = userData?.clubAccess || [];
      
      // Find existing club access or create new one
      let existingClubIndex = clubAccess.findIndex((club: any) => club.clubId === inviteData.clubId);
      
      if (existingClubIndex >= 0) {
        // Club exists, add to groupInvites array
        if (!clubAccess[existingClubIndex].groupInvites) {
          clubAccess[existingClubIndex].groupInvites = [];
        }
        
        // Check if invitation already exists for this group
        const existingInvite = clubAccess[existingClubIndex].groupInvites.find(
          (invite: any) => invite.groupId === inviteData.groupId && invite.status === 'pending'
        );
        
        if (existingInvite) {
          return {
            success: false,
            error: 'Pending invitation already exists for this group'
          };
        }
        
        clubAccess[existingClubIndex].groupInvites.push(invitationWithId);
      } else {
        // Club doesn't exist in user's access, create new club entry with invitation
        clubAccess.push({
          clubId: inviteData.clubId,
          clubName: inviteData.clubName,
          role: null, // Will be set when invitation is accepted
          joinedAt: null, // Will be set when invitation is accepted
          lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          groupAccess: [], // Will be populated when invitation is accepted
          groupInvites: [invitationWithId]
        });
      }

      // Update user document
      await userRef.update({
        clubAccess: clubAccess,
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1)
      });

      console.log(`✅ Group invitation added to user ${userId} with ID: ${invitationId}`);

      return {
        success: true,
        invitationId: invitationId
      };

    } catch (error) {
      console.error('Error in addGroupInviteToUser:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to add group invitation to user');
    }
  }
);
