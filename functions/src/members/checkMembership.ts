/**
 * Check Membership Function
 * 
 * Securely checks if a user is already a member of a club and/or group
 * without exposing member lists to the client.
 * 
 * This function is called during invitation acceptance to prevent
 * duplicate memberships and ensure proper deduplication logic.
 */

import * as admin from 'firebase-admin';
import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

// Define region parameter
const region = defineString('REGION', { default: 'europe-north1' });

/**
 * Check if a user is a member of a club and/or group
 * 
 * @param userId - User ID to check
 * @param clubId - Club ID to check
 * @param groupId - Optional group ID to check
 * @returns Object with membership status
 */
export const checkMembership = onCall(
  { region },
  async (request) => {
    try {
      // Require authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const {
        userId,
        clubId,
        groupId
      } = request.data;

      // Validate required fields
      if (!userId || !clubId) {
        throw new HttpsError('invalid-argument', 'userId and clubId are required');
      }

      console.log(`🔍 Checking membership for user ${userId} in club ${clubId}${groupId ? `, group ${groupId}` : ''}`);

      const db = admin.firestore();

      // Check club membership
      let isClubMember = false;
      try {
        const clubMembersRef = db.collection('clubs').doc(clubId).collection('allMembers').doc('members');
        const clubMembersDoc = await clubMembersRef.get();
        
        if (clubMembersDoc.exists) {
          const membersData = clubMembersDoc.data();
          const membersArray = membersData?.members || [];
          // Check if user ID exists in the members array
          isClubMember = membersArray.some((member: any) => member.userId === userId || member.email === request.auth?.token.email);
        }
      } catch (error) {
        console.error('Error checking club membership:', error);
        // Continue even if club check fails
      }

      // Check group membership if groupId provided
      let isGroupMember = false;
      if (groupId) {
        try {
          const groupMembersRef = db.collection('clubs').doc(clubId)
            .collection('groups').doc(groupId)
            .collection('allMembers').doc('members');
          const groupMembersDoc = await groupMembersRef.get();
          
          if (groupMembersDoc.exists) {
            const membersData = groupMembersDoc.data();
            const membersArray = membersData?.members || [];
            // Check if user exists in the members array
            isGroupMember = membersArray.some((member: any) => 
              member.userId === userId || 
              member.email === request.auth?.token.email
            );
          }
        } catch (error) {
          console.error('Error checking group membership:', error);
          // Continue even if group check fails
        }
      }

      console.log(`✅ Membership check complete: Club=${isClubMember}, Group=${isGroupMember}`);

      return {
        success: true,
        isClubMember,
        isGroupMember,
        userId,
        clubId,
        groupId
      };

    } catch (error: any) {
      console.error('❌ Error checking membership:', error);
      
      // Re-throw HttpsErrors
      if (error instanceof HttpsError) {
        throw error;
      }
      
      // Wrap other errors
      throw new HttpsError('internal', error.message || 'Failed to check membership');
    }
  }
);
