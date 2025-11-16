import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { CreateGroupRequest, CreateGroupResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const createNewGroup = onCall(
  {
    region: config.region,
  },
  async (request): Promise<CreateGroupResponse> => {
    try {
      const { clubId, groupName, sportType, uid }: CreateGroupRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'groupName', 'sportType', 'uid']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Verify the authenticated user matches the uid in the request
      if (request.auth.uid !== uid) {
        throw new HttpsError('permission-denied', 'User can only create groups for themselves');
      }

      const trimmedGroupName = groupName.trim();
      const trimmedSportType = sportType.trim();
      
      if (!trimmedGroupName) {
        throw new HttpsError('invalid-argument', 'Group name cannot be empty');
      }

      if (!trimmedSportType) {
        throw new HttpsError('invalid-argument', 'Sport type cannot be empty');
      }

      console.log(`Creating new group "${trimmedGroupName}" in club ${clubId} for user ${uid}`);

      const db = admin.firestore();

      // First, get the club document to check if it exists and user permissions
      const clubDoc = await db.collection('clubs').doc(clubId).get();
      if (!clubDoc.exists) {
        throw new HttpsError('not-found', 'Club not found.');
      }

      const clubData = clubDoc.data();
      const isClubCreator = clubData?.createdBy === uid;

      // Check if user is club admin (skip this check if user is the club creator - for immediate group creation after club creation)
      if (!isClubCreator) {
        const clubMembersDoc = await db.collection('clubs').doc(clubId).collection('allMembers').doc('members').get();
        if (!clubMembersDoc.exists) {
          throw new HttpsError('not-found', 'Club members not found.');
        }

        const clubMembersData = clubMembersDoc.data();
        const userMembership = clubMembersData?.members?.find((m: any) => m.userId === uid);
        
        if (!userMembership || !userMembership.roles.includes('club-admin')) {
          throw new HttpsError('permission-denied', 'Only club admins can create groups.');
        }
      }

      // Generate a new group ID inside the club's groups subcollection
      const groupId = db.collection('clubs').doc(clubId).collection('groups').doc().id;

      const now = admin.firestore.FieldValue.serverTimestamp();

      // Build the group data
      const groupData = {
        id: groupId,
        name: trimmedGroupName,
        sportType: trimmedSportType,
        createdBy: uid,
        createdAt: now,
        isActive: true,
        memberCount: 0, // Start with 0 members - creator is not auto-added
        maxCount: 30,
        subGroups: [], // Array to store the names of sub groups
        version: 1, // Initial version
        lastModified: now,
      };

      // Create empty allMembers document for the group
      const allMembersDoc = {
        members: [], // Empty - creator is not auto-added
        lastUpdated: now,
        memberCount: 0,
        version: 1, // Initial version
        lastModified: now,
      };

      // Use a batch for atomicity
      const batch = db.batch();

      // Add group document
      batch.set(
        db.collection('clubs').doc(clubId).collection('groups').doc(groupId),
        groupData
      );

      // Add empty allMembers document to the group
      batch.set(
        db.collection('clubs').doc(clubId).collection('groups').doc(groupId).collection('allMembers').doc('members'),
        allMembersDoc
      );

      // Commit all operations atomically
      await batch.commit();

      console.log(`Successfully created group ${groupId} in club ${clubId} for user ${uid}`);

      return {
        success: true,
        groupId: groupId,
        message: 'Group created successfully! You can now add members to the group.'
      };

    } catch (error) {
      console.error('Error in createNewGroup:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to create group. Please try again.');
    }
  }
);
