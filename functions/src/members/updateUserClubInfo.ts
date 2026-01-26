import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FunctionResponse, UpdateUserClubInfoRequest } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const updateUserClubInfo = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const { uid, clubInfo, role }: UpdateUserClubInfoRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['uid', 'clubInfo', 'role']);
      validateRequiredFields(clubInfo, ['clubId', 'clubName', 'role', 'joinedAt']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Updating club info for user ${uid}, club ${clubInfo.clubId}`);

      // Get user document
      const userRef = admin.firestore().collection('users').doc(uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User document not found');
      }

      const userData = userDoc.data();
      let clubAccess = userData?.clubAccess || []; // Support backward compatibility

      // Check if club membership already exists
      const existingClubIndex = clubAccess.findIndex((club: any) => club.clubId === clubInfo.clubId);
      
      if (existingClubIndex !== -1) {
        return {
          success: false,
          error: 'User is already a member of this club'
        };
      }

      // Add new club membership with new structure
      clubAccess.push({
        clubId: clubInfo.clubId,
        clubName: clubInfo.clubName,
        role: role,
        isActive: true,
        groupAccess: [], // Initialize empty groupAccess for the new club
        joinedAt: clubInfo.joinedAt,
        lastModifiedAt: clubInfo.lastModifiedAt,
      });

      // Update user document with new structure and increment version
      await userRef.update({
        clubAccess: clubAccess,
        version: admin.firestore.FieldValue.increment(1),
        lastModified: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Successfully updated club info for user ${uid}`);

      return {
        success: true,
        message: `User club info updated successfully`
      };

    } catch (error) {
      console.error('Error in updateUserClubInfo:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to update user club info');
    }
  }
);
