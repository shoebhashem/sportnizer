import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FunctionResponse, UpdateUserGroupInfoRequest } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const updateUserGroupInfo = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const { uid, groupInfo }: UpdateUserGroupInfoRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['uid', 'groupInfo']);
      validateRequiredFields(groupInfo, ['groupId', 'groupName', 'clubId', 'roles', 'joinedAt']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Updating group info for user ${uid}, group ${groupInfo.groupId}`);

      // Get user document
      const userRef = admin.firestore().collection('users').doc(uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User document not found');
      }

      const userData = userDoc.data();
      let groupsJoined = userData?.groupsJoined || [];

      // Check if group membership already exists
      const existingGroupIndex = groupsJoined.findIndex((group: any) => group.groupId === groupInfo.groupId);
      
      if (existingGroupIndex !== -1) {
        return {
          success: false,
          error: 'User is already a member of this group'
        };
      }

      // Add new group membership
      groupsJoined.push({
        groupId: groupInfo.groupId,
        groupName: groupInfo.groupName,
        clubId: groupInfo.clubId,
        roles: groupInfo.roles,
        joinedAt: groupInfo.joinedAt,
        lastModifiedAt: groupInfo.lastModifiedAt || groupInfo.joinedAt
      });

      // Update user document
      await userRef.update({
        groupsJoined: groupsJoined
      });

      console.log(`Successfully updated group info for user ${uid}`);

      return {
        success: true,
        message: `User group info updated successfully`
      };

    } catch (error) {
      console.error('Error in updateUserGroupInfo:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to update user group info');
    }
  }
);
