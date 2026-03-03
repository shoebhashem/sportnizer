import * as admin from 'firebase-admin';
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Mark user as inactive if they have no club memberships
 * 
 * Users with no club memberships are marked inactive for potential cleanup.
 * Inactive users remain in the system but can be archived/deleted after 3 months.
 * 
 * This function checks clubAccess.length === 0 before marking inactive.
 * 
 * @param userId - User ID to check and potentially mark inactive
 * @returns Result indicating if user was marked inactive and why
 */

export interface MarkUserInactiveRequest {
  userId: string;
}

export interface MarkUserInactiveResponse {
  success: boolean;
  markedInactive: boolean;
  reason: string;
  error?: string;
}

export const markUserInactive = onCall(
  {
    region: config.region,
  },
  async (request): Promise<MarkUserInactiveResponse> => {
    try {
      const { userId }: MarkUserInactiveRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['userId']);

      console.log(`Checking if user ${userId} should be marked inactive`);

      const db = admin.firestore();
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];

      if (clubAccess.length > 0) {
        console.log(`User ${userId} has ${clubAccess.length} club membership(s) - keeping active`);
        return {
          success: true,
          markedInactive: false,
          reason: 'User still has club memberships',
        };
      }

      // No club memberships - mark inactive
      console.log(`User ${userId} has no club memberships - marking inactive`);

      await userRef.update({
        isActive: false,
        inactiveSince: FieldValue.serverTimestamp(),
        lastModified: FieldValue.serverTimestamp(),
      });

      console.log(`✅ Marked user ${userId} as inactive`);

      return {
        success: true,
        markedInactive: true,
        reason: 'No club memberships remaining',
      };
    } catch (error) {
      console.error('Error in markUserInactive:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to mark user inactive');
    }
  }
);
