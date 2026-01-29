import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export interface GetGroupMembersRequest {
  clubId: string;
  groupId: string;
}

export interface GetGroupMembersResponse {
  success: boolean;
  members: any[];
  memberCount: number;
  error?: string;
}

export const getGroupMembers = onCall(
  {
    region: config.region,
  },
  async (request): Promise<GetGroupMembersResponse> => {
    try {
      const { clubId, groupId }: GetGroupMembersRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'groupId']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Fetching group members for club ${clubId}, group ${groupId}`);

      const db = admin.firestore();

      // Get group members document
      const membersDocRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId)
        .collection('allMembers')
        .doc('members');

      const membersDoc = await membersDocRef.get();

      if (!membersDoc.exists) {
        console.log(`No members document found for group ${groupId} in club ${clubId}`);
        return {
          success: true,
          members: [],
          memberCount: 0
        };
      }

      const data = membersDoc.data();
      const allMembers = data?.members || [];

      // 🆕 FILTER: Only return active members (exclude soft-deleted members)
      const members = allMembers.filter((m: any) => m.isActive !== false);

      console.log(`Successfully retrieved ${members.length} active members (${allMembers.length - members.length} inactive) for group ${groupId} in club ${clubId}`);

      return {
        success: true,
        members,
        memberCount: members.length
      };

    } catch (error) {
      console.error('Error in getGroupMembers:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to get group members');
    }
  }
);
