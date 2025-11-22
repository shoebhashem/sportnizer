import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const updateUserAnnouncementInfo = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { userId, announcementData, operation } = request.data;
      validateRequiredFields(request.data, ['userId', 'announcementData', 'operation']);
      validateRequiredFields(announcementData, ['announcementId', 'announcementName']);
      
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
      const clubIndex = clubAccess.findIndex((club: any) => club.clubId === announcementData.clubId);
      if (clubIndex === -1) {
        throw new HttpsError('not-found', 'User is not a member of this club');
      }
      
      let announcementAccess = clubAccess[clubIndex].announcementAccess || [];
      
      if (operation === 'add') {
        // Add new announcement access
        const newAnnouncementAccess = {
          announcementId: announcementData.announcementId,
          announcementName: announcementData.announcementName,
          targetScope: announcementData.targetScope || 'club'
        };
        
        announcementAccess.push(newAnnouncementAccess);
        
      } else if (operation === 'remove') {
        // Remove announcement access
        announcementAccess = announcementAccess.filter((announcement: any) => 
          announcement.announcementId !== announcementData.announcementId);
        
      } else if (operation === 'mark_read') {
        // Mark announcement as read
        const announcementIndex = announcementAccess.findIndex((announcement: any) => 
          announcement.announcementId === announcementData.announcementId);
        if (announcementIndex !== -1) {
          announcementAccess[announcementIndex].readAt = new Date();
        }
      }
      
      // Update the club access with new announcement access
      clubAccess[clubIndex].announcementAccess = announcementAccess;
      
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
      console.error('Error in updateUserAnnouncementInfo:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to update user announcement info');
    }
  }
);
