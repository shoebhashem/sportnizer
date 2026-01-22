import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

/**
 * Firebase Function: Get Subgroup Details
 * 
 * Fetches a single subgroup's details including member count.
 * 
 * @param clubId - Club ID
 * @param groupId - Group ID
 * @param subgroupId - Subgroup ID
 * @returns Subgroup details with member count
 */

interface GetSubgroupRequest {
  clubId: string;
  groupId: string;
  subgroupId: string;
}

interface GetSubgroupResponse {
  success: boolean;
  subgroup?: {
    id: string;
    name: string;
    createdBy: string;
    createdAt: FirebaseFirestore.Timestamp | null;
    description: string;
    color: string;
    memberCount: number;
  };
  error?: string;
}

export const getSubgroup = onCall<GetSubgroupRequest>(
  { 
    region: 'europe-north1',
    cors: true 
  }, 
  async (request): Promise<GetSubgroupResponse> => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { clubId, groupId, subgroupId } = request.data;

    // Validate required fields
    if (!clubId || !groupId || !subgroupId) {
      throw new HttpsError(
        'invalid-argument',
        'clubId, groupId, and subgroupId are required'
      );
    }

    try {
      const db = getFirestore();

      // Fetch subgroup document
      const subgroupRef = db.doc(
        `clubs/${clubId}/groups/${groupId}/subgroups/${subgroupId}`
      );
      const subgroupDoc = await subgroupRef.get();

      if (!subgroupDoc.exists) {
        return {
          success: false,
          error: 'Subgroup not found'
        };
      }

      const data = subgroupDoc.data()!;

      // Fetch member count from allMembers document
      const membersRef = db.doc(
        `clubs/${clubId}/groups/${groupId}/subgroups/${subgroupId}/allMembers/members`
      );
      const membersDoc = await membersRef.get();
      const memberCount = membersDoc.exists 
        ? membersDoc.data()?.memberCount || 0 
        : 0;

      return {
        success: true,
        subgroup: {
          id: subgroupDoc.id,
          name: data.name || 'Unnamed',
          createdBy: data.createdBy || '',
          createdAt: data.createdAt || null,
          description: data.description || '',
          color: data.color || '',
          memberCount
        }
      };
    } catch (error) {
      console.error('Error fetching subgroup:', error);
      throw new HttpsError(
        'internal',
        'Failed to fetch subgroup',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
);
