import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Updates a user's clubAccess entry to mark it as deleted/inactive
 * Also marks all groupAccess entries in that club as inactive
 * Marks user as inactive if they have no other active clubs
 */
export const updateUserClubDeletion = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, userMarkedInactive?: boolean, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { userId, clubId, isActive, deletionScheduledAt } = request.data;
      validateRequiredFields(request.data, ['userId', 'clubId', 'isActive']);
      
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
      
      // 4. Update clubAccess entry and all groupAccess entries within it
      const updatedClubAccess = userData.clubAccess.map((club: any) => {
        if (club.clubId === clubId) {
          const updatedClub: any = {
            ...club,
            isActive
          };
          
          // Add or remove deletionScheduledAt
          if (deletionScheduledAt) {
            updatedClub.deletionScheduledAt = Timestamp.fromMillis(deletionScheduledAt);
          } else if (club.deletionScheduledAt) {
            delete updatedClub.deletionScheduledAt;
          }
          
          // Update all groupAccess entries
          if (club.groupAccess) {
            updatedClub.groupAccess = club.groupAccess.map((group: any) => {
              const updatedGroup: any = {
                ...group,
                isActive
              };
              
              if (deletionScheduledAt) {
                updatedGroup.deletionScheduledAt = Timestamp.fromMillis(deletionScheduledAt);
              } else if (group.deletionScheduledAt) {
                delete updatedGroup.deletionScheduledAt;
              }
              
              return updatedGroup;
            });
          }
          
          return updatedClub;
        }
        return club;
      });
      
      // 5. Check if user should be marked inactive
      const hasOtherActiveClubs = updatedClubAccess.some(
        (club: any) => club.clubId !== clubId && club.isActive === true
      );
      
      const userMarkedInactive = !isActive && !hasOtherActiveClubs;
      
      // 6. Update user document
      const updateData: any = {
        clubAccess: updatedClubAccess,
        version: FieldValue.increment(1)
      };
      
      if (userMarkedInactive) {
        updateData.isActive = false;
        updateData.inactiveSince = FieldValue.serverTimestamp();
      } else if (isActive && userData.isActive === false) {
        // Reactivating - mark user as active if they were inactive
        updateData.isActive = true;
        updateData.inactiveSince = FieldValue.delete();
      }
      
      await userRef.update(updateData);
      
      console.log(`Updated user ${userId} clubAccess for club ${clubId}: isActive=${isActive}, userInactive=${userMarkedInactive}`);
      
      return {
        success: true,
        userMarkedInactive
      };
      
    } catch (error) {
      console.error('Error in updateUserClubDeletion:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to update user club deletion status');
    }
  }
);
