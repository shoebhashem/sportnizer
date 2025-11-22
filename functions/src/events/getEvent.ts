import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const getEvent = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, data?: any, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubId, eventId } = request.data;
      validateRequiredFields(request.data, ['clubId', 'eventId']);
      
      // 3. Perform single atomic operation
      const db = admin.firestore();
      const eventDoc = await db.collection('clubs').doc(clubId).collection('events').doc(eventId).get();
      
      if (!eventDoc.exists) {
        throw new HttpsError('not-found', 'Event not found');
      }
      
      const eventData = eventDoc.data();
      
      // Verify user has access to this event (orchestration service can add more detailed access control)
      
      // 4. Return consistent response
      return {
        success: true,
        data: eventData
      };
      
    } catch (error) {
      console.error('Error in getEvent:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to get event');
    }
  }
);
