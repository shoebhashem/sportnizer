import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export interface ValidateInvitationTokenRequest {
  invitationToken: string;
}

export interface ValidateInvitationTokenResponse {
  success: boolean;
  isValid: boolean;
  invitationData?: any;
  error?: string;
}

export const validateInvitationToken = onCall(
  {
    region: config.region,
  },
  async (request): Promise<ValidateInvitationTokenResponse> => {
    try {
      const { invitationToken }: ValidateInvitationTokenRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['invitationToken']);

      console.log(`Validating invitation token: ${invitationToken}`);

      const db = admin.firestore();

      // Get invitation document
      const invitationDoc = await db
        .collection('invitations')
        .doc(invitationToken)
        .get();

      if (!invitationDoc.exists) {
        console.log('Invitation not found');
        return {
          success: true,
          isValid: false,
          error: 'Invitation not found or expired'
        };
      }

      const invitationData = invitationDoc.data();

      // Check if invitation is already used
      if (invitationData?.used) {
        console.log('Invitation already used');
        return {
          success: true,
          isValid: false,
          error: 'This invitation has already been used'
        };
      }

      // Check if invitation status is pending
      if (invitationData?.status !== 'pending') {
        console.log(`Invitation status is not pending: ${invitationData?.status}`);
        return {
          success: true,
          isValid: false,
          error: 'This invitation is no longer valid'
        };
      }

      // Check if invitation has expired (7 days)
      const createdAt = invitationData?.createdAt?.toDate();
      if (createdAt) {
        const daysSinceCreated = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreated > 7) {
          console.log(`Invitation expired: ${daysSinceCreated} days old`);
          return {
            success: true,
            isValid: false,
            error: 'This invitation has expired'
          };
        }
      }

      console.log('Invitation is valid');
      return {
        success: true,
        isValid: true,
        invitationData
      };

    } catch (error) {
      console.error('Error in validateInvitationToken:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to validate invitation token');
    }
  }
);
