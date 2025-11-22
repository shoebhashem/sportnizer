import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const updateUserPollInfo = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { userId, pollData, operation } = request.data;
      validateRequiredFields(request.data, ['userId', 'pollData', 'operation']);
      validateRequiredFields(pollData, ['pollId', 'pollName']);
      
      // 3. Perform single atomic operation
      const db = admin.firestore();
      const userRef = db.collection('users').doc(userId);
      
      // Verify user exists
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }
      
      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];
      
      // Find the relevant club access entry
      const clubIndex = clubAccess.findIndex((club: any) => club.clubId === pollData.clubId);
      if (clubIndex === -1) {
        throw new HttpsError('not-found', 'User is not a member of this club');
      }
      
      let pollAccess = clubAccess[clubIndex].pollAccess || [];
      
      if (operation === 'add') {
        // Add new poll access
        const newPollAccess = {
          pollId: pollData.pollId,
          pollName: pollData.pollName,
          response: 'pending', // pending initially until user responds
          targetScope: pollData.targetScope || 'club'
        };
        
        pollAccess.push(newPollAccess);
        
      } else if (operation === 'remove') {
        // Remove poll access
        pollAccess = pollAccess.filter((poll: any) => poll.pollId !== pollData.pollId);
        
      } else if (operation === 'update_response') {
        // Update poll response
        const pollIndex = pollAccess.findIndex((poll: any) => poll.pollId === pollData.pollId);
        if (pollIndex !== -1) {
          pollAccess[pollIndex].response = 'submitted';
        }
      }
      
      // Update the club access with new poll access
      clubAccess[clubIndex].pollAccess = pollAccess;
      
      await userRef.update({
        clubAccess: clubAccess,
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1)
      });
      
      // 4. Return consistent response
      return {
        success: true
      };
      
    } catch (error) {
      console.error('Error in updateUserPollInfo:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to update user poll info');
    }
  }
);
