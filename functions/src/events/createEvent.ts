import * as admin from 'firebase-admin';
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { EventData } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const createEvent = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, eventId?: string, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubId, eventData }: { clubId: string, eventData: EventData } = request.data;
      validateRequiredFields(request.data, ['clubId', 'eventData']);
      validateRequiredFields(eventData, ['title', 'startDate', 'startTime', 'location']);
      
      // 3. Perform single atomic operation
      const db = admin.firestore();
      
      // Verify club exists
      const clubDoc = await db.collection('clubs').doc(clubId).get();
      if (!clubDoc.exists) {
        throw new HttpsError('not-found', 'Club not found');
      }
      
      // Create new event document
      const eventRef = db.collection('clubs').doc(clubId).collection('events').doc();
      
      await eventRef.set({
        id: eventRef.id,
        title: eventData.title,
        description: eventData.description || '',
        clubId: clubId,
        groupId: eventData.groupId || null, // Present if group-specific event
        subGroupIds: eventData.subGroupIds || [], // Present if sub-group specific event
        startDate: eventData.startDate,
        startTime: eventData.startTime,
        gatheringTime: eventData.gatheringTime || null,
        endDate: eventData.endDate || null,
        endTime: eventData.endTime || null,
        location: eventData.location,
        targetScope: eventData.targetScope || 'club', // 'club' | 'group' | 'subgroup'
        capacityLimit: eventData.capacityLimit || null,
        responseDeadline: eventData.responseDeadline || null,
        responses: eventData.responses || [], // Pre-populated by service layer
        isActive: eventData.isActive !== false,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
        lastModifiedAt: FieldValue.serverTimestamp(),
        version: 1
      });
      
      // 4. Return consistent response
      return {
        success: true,
        eventId: eventRef.id
      };
      
    } catch (error) {
      console.error('Error in createEvent:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to create event');
    }
  }
);
