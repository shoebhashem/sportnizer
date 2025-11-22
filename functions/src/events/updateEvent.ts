import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const updateEvent = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubId, eventId, eventData } = request.data;
      validateRequiredFields(request.data, ['clubId', 'eventId', 'eventData']);
      
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
        throw new HttpsError('permission-denied', 'Only event creator can update event details');
      }
      
      // Update only the provided fields
      const updateData: any = {
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1)
      };
      
      if (eventData.title) updateData.title = eventData.title;
      if (eventData.description !== undefined) updateData.description = eventData.description;
      if (eventData.startDate) updateData.startDate = eventData.startDate;
      if (eventData.startTime) updateData.startTime = eventData.startTime;
      if (eventData.endDate !== undefined) updateData.endDate = eventData.endDate;
      if (eventData.endTime !== undefined) updateData.endTime = eventData.endTime;
      if (eventData.location) updateData.location = eventData.location;
      
      await eventRef.update(updateData);
      
      // 4. Return consistent response
      return {
        success: true
      };
      
    } catch (error) {
      console.error('Error in updateEvent:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to update event');
    }
  }
);
