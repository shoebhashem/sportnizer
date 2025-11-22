import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const updateUserEventInfo = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { userId, eventData, operation } = request.data;
      validateRequiredFields(request.data, ['userId', 'eventData', 'operation']);
      validateRequiredFields(eventData, ['eventId', 'eventName', 'startDate', 'startTime', 'location']);
      
      // 3. Perform single atomic operation
      const db = admin.firestore();
      const userRef = db.collection('users').doc(userId);
      
      // Verify user exists
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }
      
      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];
      
      // Find the relevant club access entry
      const clubIndex = clubAccess.findIndex((club: any) => club.clubId === eventData.clubId);
      if (clubIndex === -1) {
        throw new HttpsError('not-found', 'User is not a member of this club');
      }
      
      let eventAccess = clubAccess[clubIndex].eventAccess || [];
      
      if (operation === 'add') {
        // Add new event access
        const newEventAccess = {
          eventId: eventData.eventId,
          eventName: eventData.eventName,
          startDate: eventData.startDate,
          startTime: eventData.startTime,
          location: eventData.location,
          response: 'pending', // pending initially until user responds
          targetScope: eventData.targetScope || 'club',
          targetId: eventData.targetId || eventData.clubId
        };
        
        eventAccess.push(newEventAccess);
        
      } else if (operation === 'remove') {
        // Remove event access
        eventAccess = eventAccess.filter((event: any) => event.eventId !== eventData.eventId);
        
      } else if (operation === 'update_response') {
        // Update event response
        const eventIndex = eventAccess.findIndex((event: any) => event.eventId === eventData.eventId);
        if (eventIndex !== -1) {
          eventAccess[eventIndex].response = eventData.response;
        }
      }
      
      // Update the club access with new event access
      clubAccess[clubIndex].eventAccess = eventAccess;
      
      await userRef.update({
        clubAccess: clubAccess,
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1)
      });
      
      // 4. Return consistent response
      return {
        success: true
      };
      
    } catch (error) {
      console.error('Error in updateUserEventInfo:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to update user event info');
    }
  }
);
