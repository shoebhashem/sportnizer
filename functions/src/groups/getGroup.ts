import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const getGroup = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, data?: any, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubId, groupId } = request.data;
      validateRequiredFields(request.data, ['clubId', 'groupId']);
      
      // 3. Perform atomic operations
      const db = admin.firestore();
      const groupDoc = await db.collection('clubs').doc(clubId).collection('groups').doc(groupId).get();
      
      if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Group not found');
      }
      
      const groupData = groupDoc.data();
      
      // Fetch club document to get club name
      const clubDoc = await db.collection('clubs').doc(clubId).get();
      const clubName = clubDoc.exists ? clubDoc.data()?.name || 'Unknown Club' : 'Unknown Club';
      
      // Verify user has access to this group (orchestration service can add more detailed access control)
      
      // 4. Return consistent response with clubName included
      return {
        success: true,
        data: {
          ...groupData,
          clubName
        }
      };
      
    } catch (error) {
      console.error('Error in getGroup:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to get group');
    }
  }
);
