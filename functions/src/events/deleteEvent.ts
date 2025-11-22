import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const deleteEvent = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, error?: string}> => {
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
      const eventRef = db.collection('clubs').doc(clubId).collection('events').doc(eventId);
      
      // Verify event exists and user has permission
      const eventDoc = await eventRef.get();
      if (!eventDoc.exists) {
        throw new HttpsError('not-found', 'Event not found');
      }
      
      const event = eventDoc.data();
      if (event?.createdBy !== request.auth.uid) {
        // TODO: Add more sophisticated permission checking (club admins, group admins, etc.)
        throw new HttpsError('permission-denied', 'Only event creator can delete events');
      }
      
      // Soft delete - mark as inactive
      await eventRef.update({
        isActive: false,
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1)
      });
      
      // 4. Return consistent response
      return {
        success: true
      };
      
    } catch (error) {
      console.error('Error in deleteEvent:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to delete event');
    }
  }
);
