import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const deleteClub = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, error?: string}> => {
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
      const clubRef = db.collection('clubs').doc(clubId);
      
      // Verify club exists and user has permission
      const clubDoc = await clubRef.get();
      if (!clubDoc.exists) {
        throw new HttpsError('not-found', 'Club not found');
      }
      
      const club = clubDoc.data();
      if (!club?.admins?.includes(request.auth.uid)) {
        throw new HttpsError('permission-denied', 'Only club admins can delete clubs');
      }
      
      // Soft delete - mark as inactive
      await clubRef.update({
        isActive: false,
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1)
      });
      
      // 4. Return consistent response
      return {
        success: true
      };
      
    } catch (error) {
      console.error('Error in deleteClub:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to delete club');
    }
  }
);
