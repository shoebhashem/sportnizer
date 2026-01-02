import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export interface MarkInvitationUsedRequest {
  invitationToken: string;
  userId: string | null; // Allow null for 'clicked' status when user doesn't exist yet
  status: 'clicked' | 'accepted' | 'rejected';
}

export interface MarkInvitationUsedResponse {
  success: boolean;
  error?: string;
}

export const markInvitationUsed = onCall(
  {
    region: config.region,
  },
  async (request): Promise<MarkInvitationUsedResponse> => {
    try {
      const { invitationToken, userId, status }: MarkInvitationUsedRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['invitationToken', 'status']);
      
      // For 'accepted' and 'rejected' status, userId is required
      if ((status === 'accepted' || status === 'rejected') && !userId) {
        throw new HttpsError('invalid-argument', 'userId is required for accepted/rejected status');
      }

      // Verify the user is authenticated (except for 'clicked' status)
      if (!request.auth && status !== 'clicked') {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Marking invitation ${invitationToken} as ${status} by user ${userId}`);

      const db = admin.firestore();

      // Update invitation document
      const updateData: any = {
        status,
        version: admin.firestore.FieldValue.increment(1)
      };

      if (status === 'clicked') {
        // For 'clicked', just update status and timestamp
        updateData.clickedAt = admin.firestore.FieldValue.serverTimestamp();
        if (userId) {
          updateData.clickedBy = userId;
        }
      } else {
        // For 'accepted' and 'rejected', mark as used
        updateData.used = true;
        updateData.usedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.usedBy = userId;
      }

      await db
        .collection('invitations')
        .doc(invitationToken)
        .update(updateData);

      console.log(`Successfully marked invitation as ${status}`);

      return {
        success: true
      };

    } catch (error) {
      console.error('Error in markInvitationUsed:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to mark invitation as used');
    }
  }
);
