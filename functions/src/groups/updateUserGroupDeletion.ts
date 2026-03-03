import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Updates a user's groupAccess entry to mark it as deleted/inactive
 * Used when a group is soft deleted or reactivated
 */
export const updateUserGroupDeletion = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { userId, clubId, groupId, isActive, deletionScheduledAt } = request.data;
      validateRequiredFields(request.data, ['userId', 'clubId', 'groupId']);
      
      // isActive is required for the operation, but we validate it separately
      if (isActive === undefined || isActive === null) {
        throw new HttpsError('invalid-argument', 'isActive field is required');
      }
      
      // 3. Get user document
      const db = admin.firestore();
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }
      
      const userData = userDoc.data();
      if (!userData?.clubAccess) {
        throw new HttpsError('not-found', 'User has no club access');
      }
      
      // 4. Update groupAccess entry
      const updatedClubAccess = userData.clubAccess.map((club: any) => {
        if (club.clubId === clubId) {
          return {
            ...club,
            groupAccess: club.groupAccess?.map((group: any) => {
              if (group.groupId === groupId) {
                const updatedGroup: any = {
                  ...group,
                  isActive
                };
                
                // Add or remove deletionScheduledAt
                if (deletionScheduledAt) {
                  updatedGroup.deletionScheduledAt = Timestamp.fromMillis(deletionScheduledAt);
                } else if (group.deletionScheduledAt) {
                  // Remove field when reactivating
                  delete updatedGroup.deletionScheduledAt;
                }
                
                return updatedGroup;
              }
              return group;
            }) || []
          };
        }
        return club;
      });
      
      // 5. Update user document
      await userRef.update({
        clubAccess: updatedClubAccess,
        version: FieldValue.increment(1)
      });
      
      console.log(`Updated user ${userId} groupAccess for group ${groupId}: isActive=${isActive}`);
      
      return {
        success: true
      };
      
    } catch (error) {
      console.error('Error in updateUserGroupDeletion:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to update user group deletion status');
    }
  }
);
