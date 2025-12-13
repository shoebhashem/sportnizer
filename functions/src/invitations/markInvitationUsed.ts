import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export interface MarkInvitationUsedRequest {
  invitationToken: string;
  userId: string;
  status: 'accepted' | 'rejected';
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
      validateRequiredFields(request.data, ['invitationToken', 'userId', 'status']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Marking invitation ${invitationToken} as ${status} by user ${userId}`);

      const db = admin.firestore();

      // Update invitation document
      await db
        .collection('invitations')
        .doc(invitationToken)
        .update({
          used: true,
          status,
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          usedBy: userId,
          version: admin.firestore.FieldValue.increment(1)
        });

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
