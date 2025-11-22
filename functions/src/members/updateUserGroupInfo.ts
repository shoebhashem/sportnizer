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
      const { uid, clubId, groupInfo, roles, operation }: UpdateUserGroupInfoRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['uid', 'clubId', 'operation']);
      
      // Additional validation for operations
      if (operation === 'add') {
        if (!groupInfo || !roles) {
          throw new HttpsError('invalid-argument', 'For add operations, both groupInfo and roles are required');
        }
        validateRequiredFields(groupInfo, ['groupId', 'groupName', 'joinedAt']);
      } else if (operation === 'remove') {
        if (!groupInfo || !groupInfo.groupId) {
          throw new HttpsError('invalid-argument', 'For remove operations, groupInfo with groupId is required');
        }
      }

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
      let clubAccess = userData?.clubAccess || userData?.clubs || []; // Support backward compatibility
    
      // Find the club in the user's clubAccess array
      const existingClubIndex = clubAccess.findIndex((club: any) => club.clubId === clubId);
      
      if (existingClubIndex === -1) {
        throw new HttpsError('not-found', 'User is not a member of this club');
      }

      if (operation === 'add') {
        console.log(`Adding group info for user ${uid}, group ${groupInfo!.groupId} in club ${clubId} with roles:`, roles);

        // Get the club's groupAccess array (initialize if it doesn't exist)
        if (!clubAccess[existingClubIndex].groupAccess) {
          clubAccess[existingClubIndex].groupAccess = [];
        }
        
        const clubGroupAccess = clubAccess[existingClubIndex].groupAccess;

        // Check if group membership already exists in this club
        const existingGroupIndex = clubGroupAccess.findIndex((group: any) => group.groupId === groupInfo!.groupId);
        
        if (existingGroupIndex !== -1) {
          // Update existing membership with new roles
          clubGroupAccess[existingGroupIndex].roles = roles;
          clubGroupAccess[existingGroupIndex].lastModifiedAt = new Date();
          console.log(`Updated existing group membership with new roles for user ${uid}, group ${groupInfo!.groupId}`);
        } else {
          // Add new group membership to the club's groupAccess array
          clubGroupAccess.push({
            groupId: groupInfo!.groupId,
            groupName: groupInfo!.groupName,
            roles: roles,
            joinedAt: groupInfo!.joinedAt,
            lastModifiedAt: new Date()
          });
          console.log(`Added new group membership for user ${uid}, group ${groupInfo!.groupId}`);
        }

      } else if (operation === 'remove') {
        console.log(`Removing group info for user ${uid}, group ${groupInfo!.groupId} from club ${clubId}`);

        // Get the club's groupAccess array
        const clubGroupAccess = clubAccess[existingClubIndex].groupAccess || [];
        
        // Find the group membership in this club
        const existingGroupIndex = clubGroupAccess.findIndex((group: any) => group.groupId === groupInfo!.groupId);
        
        if (existingGroupIndex === -1) {
          return {
            success: false,
            error: 'User is not a member of this group'
          };
        }

        // Remove group membership from the club's groupAccess array
        clubAccess[existingClubIndex].groupAccess = clubGroupAccess.filter((group: any) => group.groupId !== groupInfo!.groupId);

      } else {
        throw new HttpsError('invalid-argument', 'operation must be either "add" or "remove"');
      }

      // Update user document with new nested structure
      await userRef.update({
        clubAccess: clubAccess
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
