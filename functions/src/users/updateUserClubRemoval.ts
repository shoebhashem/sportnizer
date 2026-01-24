import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FunctionResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Update user document to remove club from clubAccess array
 * 
 * Atomic function for updating user document when removed from a club.
 * Removes the entire club entry from clubAccess[] array.
 * 
 * @param userId - User ID to update
 * @param clubId - Club ID to remove from clubAccess
 * @returns Success result
 */

export interface UpdateUserClubRemovalRequest {
  userId: string;
  clubId: string;
}

export const updateUserClubRemoval = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const { userId, clubId }: UpdateUserClubRemovalRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['userId', 'clubId']);

      console.log(`Removing club ${clubId} from user ${userId}'s clubAccess`);

      const db = admin.firestore();
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];

      // Filter out the club being removed
      const updatedClubAccess = clubAccess.filter((ca: any) => ca.clubId !== clubId);

      // Update user document
      await userRef.update({
        clubAccess: updatedClubAccess,
        version: admin.firestore.FieldValue.increment(1),
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`✅ Removed club ${clubId} from user ${userId}'s clubAccess`);

      return {
        success: true,
        message: 'User club access updated successfully',
      };
    } catch (error) {
      console.error('Error in updateUserClubRemoval:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to update user club removal');
    }
  }
);
