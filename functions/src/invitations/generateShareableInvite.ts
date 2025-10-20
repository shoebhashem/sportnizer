import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export interface GenerateShareableInviteRequest {
  groupId: string;
  groupName: string;
  inviterName: string;
  inviterUid: string;
  expirationDays?: number; // Optional, defaults to 7 days
  maxUses?: number | null; // Optional, defaults to unlimited (null)
  invitationType?: 'group-member' | 'coach' | 'admin'; // Optional, defaults to 'group-member'
}

export interface GenerateShareableInviteResponse {
  success: boolean;
  inviteToken?: string;
  inviteLink?: string;
  expiresAt?: string;
  error?: string;
}

export const generateShareableInvite = onCall(
  {
    region: config.region,
  },
  async (request): Promise<GenerateShareableInviteResponse> => {
    try {
      const { 
        groupId, 
        groupName, 
        inviterName,
        expirationDays = 7,
        maxUses = null, // null = unlimited
        invitationType = 'group-member'
      }: GenerateShareableInviteRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['groupId', 'groupName', 'inviterName']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Validate expiration days
      if (expirationDays < 1 || expirationDays > 30) {
        throw new HttpsError('invalid-argument', 'Expiration days must be between 1 and 30');
      }

      // Verify user has permission to create invites for this group
      const groupRef = admin.firestore().collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Group not found');
      }

      const groupData = groupDoc.data();
      
      // Check if user is admin of the group or club-admin
      const isGroupAdmin = groupData?.adminIds?.includes(request.auth.uid);
      
      // TODO: Add club-admin check when we have club hierarchy
      // const isClubAdmin = await checkClubAdminStatus(request.auth.uid, groupData?.clubId);
      
      if (!isGroupAdmin) {
        throw new HttpsError('permission-denied', 'Only group admins can create shareable invites');
      }

      // Generate unique invitation token
      const inviteToken = admin.firestore().collection('shareableInvites').doc().id;
      
      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expirationDays);

      // Create invitation document
      const shareableInviteData = {
        inviteToken,
        groupId,
        groupName,
        inviterName,
        inviterUid: request.auth.uid,
        invitationType,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        isActive: true,
        maxUses,
        currentUses: 0,
        usedBy: [], // Array of user IDs who used this invite
        // Store metadata for analytics/tracking
        metadata: {
          createdVia: 'shareable-link-generator',
          platform: 'universal'
        }
      };

      // Save to Firestore
      await admin.firestore()
        .collection('shareableInvites')
        .doc(inviteToken)
        .set(shareableInviteData);

      // Generate the universal invite link
      // Note: We use the same base URL structure as other invites for consistency
      const baseUrl = config.baseUrl || 'https://sportnizer.app';
      const inviteLink = `${baseUrl}/join/${inviteToken}`;

      console.log(`Created shareable invite: ${inviteToken} for group: ${groupName}`);

      return {
        success: true,
        inviteToken,
        inviteLink,
        expiresAt: expiresAt.toISOString()
      };

    } catch (error: any) {
      console.error('Error generating shareable invite:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to generate shareable invite');
    }
  }
);
