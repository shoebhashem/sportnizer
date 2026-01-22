import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export interface GetSubgroupMembersRequest {
  clubId: string;
  groupId: string;
  subgroupId: string;
}

export interface GetSubgroupMembersResponse {
  success: boolean;
  members: any[];
  memberCount: number;
  error?: string;
}

/**
 * Get all members of a subgroup
 * Returns members array from /clubs/{clubId}/groups/{groupId}/subgroups/{subgroupId}/allMembers/members
 * 
 * Permissions: Any authenticated user can read subgroup members (same as group members)
 */
export const getSubgroupMembers = onCall(
  { region: config.region },
  async (request): Promise<GetSubgroupMembersResponse> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubId, groupId, subgroupId } = request.data as GetSubgroupMembersRequest;
      validateRequiredFields(request.data, ['clubId', 'groupId', 'subgroupId']);

      // 3. Fetch subgroup members document
      const db = admin.firestore();
      const membersDoc = await db
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId)
        .collection('subgroups')
        .doc(subgroupId)
        .collection('allMembers')
        .doc('members')
        .get();

      if (!membersDoc.exists) {
        // Subgroup exists but has no members yet
        return {
          success: true,
          members: [],
          memberCount: 0
        };
      }

      const data = membersDoc.data();
      const members = data?.members || [];
      const memberCount = data?.memberCount || members.length;

      console.log(`✅ Fetched ${memberCount} members from subgroup ${subgroupId}`);

      return {
        success: true,
        members,
        memberCount
      };

    } catch (error) {
      console.error('❌ Error in getSubgroupMembers:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        `Failed to get subgroup members: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);
