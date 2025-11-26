import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const createGroup = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, groupId?: string, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubId, groupData } = request.data;
      validateRequiredFields(request.data, ['clubId', 'groupData']);
      validateRequiredFields(groupData, ['name']);
      
      const trimmedName = groupData.name.trim();
      if (!trimmedName) {
        throw new HttpsError('invalid-argument', 'Group name cannot be empty');
      }

      // 3. Perform single atomic operation
      const db = admin.firestore();
      
      // Verify club exists
      const clubDoc = await db.collection('clubs').doc(clubId).get();
      if (!clubDoc.exists) {
        throw new HttpsError('not-found', 'Club not found');
      }
      
      // Check if group with this name already exists in this club
      const existingGroupQuery = await db.collection('clubs').doc(clubId).collection('groups')
        .where('name', '==', trimmedName).get();

      if (!existingGroupQuery.empty) {
        throw new HttpsError('already-exists', `A group with the name "${trimmedName}" already exists in this club.`);
      }
      
      // Create new group document
      const groupRef = db.collection('clubs').doc(clubId).collection('groups').doc();
      
      await groupRef.set({
        id: groupRef.id,
        name: trimmedName,
        description: groupData.description || '',
        clubId: clubId, // Parent club reference
        sport: groupData.sport || '',
        coaches: [], // User IDs with coach role
        admins: [request.auth.uid], // User IDs with group-admin role (creator becomes admin)
        memberCount: 0,
        subGroups: groupData.subGroups || [],
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: 1
      });

      // Initialize the allMembers document to ensure it exists for future operations
      const groupMemberRef = groupRef.collection('allMembers').doc('members');
      await groupMemberRef.set({
        members: [], // Empty array, will be populated when members are added
        memberCount: 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        version: 1
      });
      
      console.log(`Created group ${groupRef.id} with initialized members document`);
      
      // 4. Return consistent response
      return {
        success: true,
        groupId: groupRef.id
      };
      
    } catch (error) {
      console.error('Error in createGroup:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to create group');
    }
  }
);
