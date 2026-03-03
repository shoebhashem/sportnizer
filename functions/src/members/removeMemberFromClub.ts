import * as admin from 'firebase-admin';
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Remove member from club - Atomic operation (club member collection only)
 * 
 * This function ONLY removes the member from the club's allMembers collection.
 * It does NOT:
 * - Remove from groups/subgroups (caller's responsibility)
 * - Update user document (caller's responsibility)
 * - Update guardian tracking (caller's responsibility)
 * 
 * Atomic Function Pattern: Single responsibility, one document type
 * Use orchestration service (removeMemberFromClubService) for complete removal flow
 * 
 * @param clubId - Club ID to remove member from
 * @param userId - User ID to remove
 * @returns Success result
 */

export interface RemoveMemberFromClubRequest {
  clubId: string;
  userId: string;
}

export interface RemoveMemberFromClubResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export const removeMemberFromClub = onCall(
  {
    region: config.region,
  },
  async (request): Promise<RemoveMemberFromClubResponse> => {
    try {
      const { clubId, userId }: RemoveMemberFromClubRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'userId']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Removing user ${userId} from club ${clubId}`);

      const db = admin.firestore();

      // Verify club exists
      const clubRef = db.collection('clubs').doc(clubId);
      const clubDoc = await clubRef.get();

      if (!clubDoc.exists) {
        throw new HttpsError('not-found', 'Club not found');
      }

      // Get club allMembers document
      const clubMemberRef = clubRef.collection('allMembers').doc('members');
      const clubMembersDoc = await clubMemberRef.get();

      if (!clubMembersDoc.exists) {
        throw new HttpsError('not-found', 'Club members document not found');
      }

      const clubMembersData = clubMembersDoc.data();
      const currentMembers = clubMembersData?.members || [];

      // Find the member by userId
      const memberIndex = currentMembers.findIndex((member: any) => member.userId === userId);

      if (memberIndex === -1) {
        console.log(`User ${userId} is not a member of club ${clubId}`);
        return {
          success: false,
          error: 'User is not a member of this club',
        };
      }

      // Remove member from the array
      const updatedMembers = currentMembers.filter((member: any) => member.userId !== userId);

      // Update the members document
      await clubMemberRef.update({
        members: updatedMembers,
        memberCount: updatedMembers.length,
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp(),
      });

      console.log(`✅ Successfully removed user ${userId} from club ${clubId}`);

      return {
        success: true,
        message: 'Member removed from club successfully',
      };
    } catch (error) {
      console.error('Error in removeMemberFromClub:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to remove member from club');
    }
  }
);
