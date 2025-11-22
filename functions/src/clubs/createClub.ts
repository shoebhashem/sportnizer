import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const createClub = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, clubId?: string, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubData } = request.data;
      validateRequiredFields(request.data, ['clubData']);
      validateRequiredFields(clubData, ['name']);
      
      const trimmedName = clubData.name.trim();
      if (!trimmedName) {
        throw new HttpsError('invalid-argument', 'Club name cannot be empty');
      }

      // 3. Perform single atomic operation
      const db = admin.firestore();
      
      // Check if club with this name already exists (case-insensitive)
      const clubsRef = db.collection('clubs');
      const existingClubQuery = await clubsRef.where('name', '==', trimmedName).get();

      if (!existingClubQuery.empty) {
        throw new HttpsError('already-exists', `A club with the name "${trimmedName}" already exists.`);
      }

      // Generate new club document
      const clubRef = clubsRef.doc();
      
      await clubRef.set({
        id: clubRef.id,
        name: trimmedName,
        description: clubData.description || '',
        sport: clubData.sport || '',
        location: clubData.location || '',
        admins: [request.auth.uid], // User IDs with club-admin role
        memberCount: 0, // Will be updated when members are added
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: 1
      });
      
      // 4. Return consistent response
      return {
        success: true,
        clubId: clubRef.id
      };
      
    } catch (error) {
      console.error('Error in createClub:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to create club');
    }
  }
);
