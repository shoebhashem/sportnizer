import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GetUserProfileRequest, GetUserProfileResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const getUserProfile = onCall(
  {
    region: config.region,
  },
  async (request): Promise<GetUserProfileResponse> => {
    try {
      const { uid }: GetUserProfileRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['uid']);

      // Verify the user is authenticated and matches the requested UID
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      if (request.auth.uid !== uid) {
        throw new HttpsError('permission-denied', 'Can only access your own profile');
      }

      console.log(`Fetching user profile for ${uid}`);

      const db = admin.firestore();

      // Get user profile document
      const userDoc = await db.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User profile not found');
      }

      const userProfile = userDoc.data();

      console.log(`Successfully retrieved user profile for ${uid}`);

      return {
        success: true,
        userProfile
      };

    } catch (error) {
      console.error('Error in getUserProfile:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to get user profile');
    }
  }
);
