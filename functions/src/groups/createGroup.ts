import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { checkGroupLimit, DEFAULT_LIMITS } from '../utils/limits';
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

      // 3. Verify club exists and check group creation limit
      const db = admin.firestore();
      
      // Verify club exists
      const clubRef = db.collection('clubs').doc(clubId);
      const clubDoc = await clubRef.get();
      if (!clubDoc.exists) {
        throw new HttpsError('not-found', 'Club not found');
      }
      
      const clubData = clubDoc.data();
      const clubName = clubData?.name || 'Unknown Club';
      const activeGroupCount = clubData?.activeGroupCount || 0;
      const maxGroups = clubData?.maxGroups || DEFAULT_LIMITS.maxGroups;
      
      // Check if group with this name already exists in this club
      const existingGroupQuery = await db.collection('clubs').doc(clubId).collection('groups')
        .where('name', '==', trimmedName).get();

      if (!existingGroupQuery.empty) {
        const existingGroup = existingGroupQuery.docs[0];
        const existingGroupData = existingGroup.data();
        
        // REACTIVATION SCENARIO: Group exists but is soft-deleted
        if (existingGroupData.isActive === false) {
          console.log(`Attempting to reactivate soft-deleted group ${existingGroup.id}`);
          
          // CRITICAL: Check limit for reactivation (same as creation)
          const limitCheck = checkGroupLimit(activeGroupCount, maxGroups, 'reactivate');
          if (!limitCheck.allowed) {
            throw new HttpsError('resource-exhausted', limitCheck.message);
          }
          
          // Reactivate the group
          await existingGroup.ref.update({
            isActive: true,
            deletionScheduledAt: admin.firestore.FieldValue.delete(),
            deletedBy: admin.firestore.FieldValue.delete(),
            deletedAt: admin.firestore.FieldValue.delete(),
            lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            // Update clubName (in case it changed), description and sport if provided
            clubName: clubData?.name || 'Unknown Club',
            ...(groupData.description && { description: groupData.description }),
            ...(groupData.sport && { sport: groupData.sport }),
          });
          
          // Increment club's active group counter
          await clubRef.update({
            activeGroupCount: admin.firestore.FieldValue.increment(1)
          });
          
          console.log(`Reactivated group ${existingGroup.id}. Club now has ${activeGroupCount + 1} active groups.`);
          
          return {
            success: true,
            groupId: existingGroup.id
          };
        }
        
        // Group exists and is active - cannot create duplicate
        throw new HttpsError('already-exists', `A group with the name "${trimmedName}" already exists in this club.`);
      }
      
      // NEW GROUP CREATION
      // Validate group creation limit
      const limitCheck = checkGroupLimit(activeGroupCount, maxGroups, 'create');
      if (!limitCheck.allowed) {
        throw new HttpsError('resource-exhausted', limitCheck.message);
      }
      
      // Create new group document with subscription limits
      const groupRef = db.collection('clubs').doc(clubId).collection('groups').doc();
      
      await groupRef.set({
        id: groupRef.id,
        name: trimmedName,
        description: groupData.description || '',
        clubId: clubId, // Parent club reference
        clubName: clubName, // Denormalized club name
        sport: groupData.sport || '',
        coaches: [], // User IDs with coach role
        admins: [request.auth.uid], // User IDs with group-admin role (creator becomes admin)
        memberCount: 0,
        subGroups: [], // Array of {id, name} for each subgroup
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: 1,
        // Subscription limits
        maxMembers: DEFAULT_LIMITS.maxMembers, // Free tier default: 30
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
      
      // Increment club's active group counter
      await clubRef.update({
        activeGroupCount: admin.firestore.FieldValue.increment(1)
      });
      
      console.log(`Created group ${groupRef.id} with initialized members document. Club now has ${activeGroupCount + 1} active groups.`);
      
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
