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
      const { uid, groupInfo, groupId, operation }: UpdateUserGroupInfoRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['uid', 'operation']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Get user document
      const userRef = admin.firestore().collection('users').doc(uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User document not found');
      }

      const userData = userDoc.data();
      let groupAccess = userData?.groupAccess || userData?.groupsJoined || []; // Support backward compatibility

      if (operation === 'add') {
        // Validate groupInfo for add operations
        if (!groupInfo) {
          throw new HttpsError('invalid-argument', 'groupInfo is required for add operations');
        }
        validateRequiredFields(groupInfo, ['groupId', 'groupName', 'clubId', 'roles', 'joinedAt']);

        console.log(`Adding group info for user ${uid}, group ${groupInfo.groupId}`);

        // Check if group membership already exists
        const existingGroupIndex = groupAccess.findIndex((group: any) => group.groupId === groupInfo.groupId);
        
        if (existingGroupIndex !== -1) {
          return {
            success: false,
            error: 'User is already a member of this group'
          };
        }

        // Add new group membership (structure remains the same)
        groupAccess.push({
          groupId: groupInfo.groupId,
          groupName: groupInfo.groupName,
          clubId: groupInfo.clubId,
          roles: groupInfo.roles,
          joinedAt: groupInfo.joinedAt,
          lastModifiedAt: groupInfo.lastModifiedAt || groupInfo.joinedAt
        });

      } else if (operation === 'remove') {
        // Validate groupId for remove operations
        if (!groupId) {
          throw new HttpsError('invalid-argument', 'groupId is required for remove operations');
        }

        console.log(`Removing group info for user ${uid}, group ${groupId}`);

        // Find and remove the group membership
        const existingGroupIndex = groupAccess.findIndex((group: any) => group.groupId === groupId);
        
        if (existingGroupIndex === -1) {
          return {
            success: false,
            error: 'User is not a member of this group'
          };
        }

        // Remove group membership
        groupAccess = groupAccess.filter((group: any) => group.groupId !== groupId);

      } else {
        throw new HttpsError('invalid-argument', 'operation must be either "add" or "remove"');
      }

      // Update user document with new structure
      await userRef.update({
        groupAccess: groupAccess
      });

      console.log(`Successfully ${operation === 'add' ? 'added' : 'removed'} group info for user ${uid}`);

      return {
        success: true,
        message: `User group info ${operation === 'add' ? 'added' : 'removed'} successfully`
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
