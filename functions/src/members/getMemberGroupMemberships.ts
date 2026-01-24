import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Get member's group memberships within a club
 * 
 * Reads user document to discover all groups and subgroups the member belongs to
 * in a specific club. This is used for removal operations to determine what needs
 * to be cleaned up.
 * 
 * Architecture: User document is single source of truth for memberships
 * - No data duplication in club member documents
 * - Cost efficient: 1 read per operation
 * - Always consistent with user's actual access
 * 
 * @param clubId - Club ID to search within
 * @param userId - User ID to check memberships for
 * @returns Object with groups array and subgroups object
 */

export interface GetMemberGroupMembershipsRequest {
  clubId: string;
  userId: string;
}

export interface GroupMembershipsResponse {
  success: boolean;
  groups: string[]; // Array of group IDs
  subgroups: {
    // Object mapping groupId to array of subgroup IDs
    [groupId: string]: string[];
  };
  error?: string;
}

export const getMemberGroupMemberships = onCall(
  {
    region: config.region,
  },
  async (request): Promise<GroupMembershipsResponse> => {
    try {
      const { clubId, userId }: GetMemberGroupMembershipsRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'userId']);

      console.log(`Getting group memberships for user ${userId} in club ${clubId}`);

      const db = admin.firestore();

      // Read user document (single source of truth)
      const userDoc = await db.collection('users').doc(userId).get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];

      // Find the club in user's clubAccess array
      const clubData = clubAccess.find((ca: any) => ca.clubId === clubId);

      if (!clubData) {
        console.log(`User ${userId} is not a member of club ${clubId}`);
        return {
          success: true,
          groups: [],
          subgroups: {},
        };
      }

      // Extract groups and subgroups
      const groupAccess = clubData.groupAccess || [];
      const groups: string[] = [];
      const subgroups: { [groupId: string]: string[] } = {};

      for (const groupData of groupAccess) {
        const groupId = groupData.groupId;
        groups.push(groupId);

        // Add subgroups if they exist
        if (groupData.subGroups && Array.isArray(groupData.subGroups) && groupData.subGroups.length > 0) {
          subgroups[groupId] = groupData.subGroups;
        }
      }

      console.log(`Found ${groups.length} groups and ${Object.keys(subgroups).length} groups with subgroups`);
      console.log('Groups:', groups);
      console.log('Subgroups:', JSON.stringify(subgroups));

      return {
        success: true,
        groups,
        subgroups,
      };
    } catch (error) {
      console.error('Error in getMemberGroupMemberships:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to get member group memberships');
    }
  }
);
