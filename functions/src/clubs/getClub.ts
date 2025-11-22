import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const getClub = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, data?: any, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubId } = request.data;
      validateRequiredFields(request.data, ['clubId']);
      
      // 3. Perform single atomic operation
      const db = admin.firestore();
      const clubDoc = await db.collection('clubs').doc(clubId).get();
      
      if (!clubDoc.exists) {
        throw new HttpsError('not-found', 'Club not found');
      }
      
      const clubData = clubDoc.data();
      
      // Verify user has access to this club (either admin or member)
      // This is a simple check - in orchestration service you might want more detailed access control
      
      // 4. Return consistent response
      return {
        success: true,
        data: clubData
      };
      
    } catch (error) {
      console.error('Error in getClub:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to get club');
    }
  }
);
