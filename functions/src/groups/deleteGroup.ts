import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const deleteGroup = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubId, groupId } = request.data;
      validateRequiredFields(request.data, ['clubId', 'groupId']);
      
      // 3. Perform single atomic operation
      const db = admin.firestore();
      const groupRef = db.collection('clubs').doc(clubId).collection('groups').doc(groupId);
      
      // Verify group exists and user has permission
      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Group not found');
      }
      
      const group = groupDoc.data();
      if (!group?.admins?.includes(request.auth.uid)) {
        throw new HttpsError('permission-denied', 'Only group admins can delete groups');
      }
      
      // Soft delete - mark as inactive
      await groupRef.update({
        isActive: false,
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1)
      });
      
      // 4. Return consistent response
      return {
        success: true
      };
      
    } catch (error) {
      console.error('Error in deleteGroup:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to delete group');
    }
  }
);
