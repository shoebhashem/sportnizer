import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const updateGroup = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubId, groupId, groupData } = request.data;
      validateRequiredFields(request.data, ['clubId', 'groupId', 'groupData']);
      
      // 3. Perform single atomic operation
      const db = admin.firestore();
      const groupRef = db.collection('clubs').doc(clubId).collection('groups').doc(groupId);
      
      // Verify group exists and user has permission
      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Group not found');
      }
      
      const group = groupDoc.data();
      const hasPermission = group?.admins?.includes(request.auth.uid) || 
                           group?.coaches?.includes(request.auth.uid);
      
      if (!hasPermission) {
        throw new HttpsError('permission-denied', 'Only group admins or coaches can update group details');
      }
      
      // Update only the provided fields
      const updateData: any = {
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1)
      };
      
      if (groupData.name) updateData.name = groupData.name.trim();
      if (groupData.description !== undefined) updateData.description = groupData.description;
      if (groupData.ageRange !== undefined) updateData.ageRange = groupData.ageRange;
      
      await groupRef.update(updateData);
      
      // 4. Return consistent response
      return {
        success: true
      };
      
    } catch (error) {
      console.error('Error in updateGroup:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to update group');
    }
  }
);
