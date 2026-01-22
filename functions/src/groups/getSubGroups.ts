import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GetSubGroupsRequest, GetSubGroupsResponse, SubGroupData } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Get all subgroups for a group
 * 
 * Architecture: Queries /clubs/{clubId}/groups/{groupId}/subgroups collection
 * Returns: Array of subgroup objects with metadata and member counts
 */
export const getSubGroups = onCall(
  {
    region: config.region,
  },
  async (request): Promise<GetSubGroupsResponse> => {
    try {
      const { clubId, groupId } = request.data as GetSubGroupsRequest;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'groupId']);

      // Verify user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const db = admin.firestore();

      // Verify group exists
      const groupDoc = await db
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId)
        .get();
      
      if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Group not found');
      }

      // Query all subgroups
      const subgroupsSnapshot = await db
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId)
        .collection('subgroups')
        .get();

      const subgroups: SubGroupData[] = [];

      // For each subgroup, fetch member count from allMembers
      for (const docSnapshot of subgroupsSnapshot.docs) {
        const data = docSnapshot.data();
        
        // Fetch member count
        const membersDoc = await db
          .collection('clubs')
          .doc(clubId)
          .collection('groups')
          .doc(groupId)
          .collection('subgroups')
          .doc(docSnapshot.id)
          .collection('allMembers')
          .doc('members')
          .get();

        const memberCount = membersDoc.exists ? 
          (membersDoc.data()?.memberCount || 0) : 0;

        subgroups.push({
          id: docSnapshot.id,
          name: data.name || 'Unnamed',
          createdBy: data.createdBy || '',
          createdAt: data.createdAt || null,
          description: data.description || '',
          color: data.color || '',
          memberCount
        });
      }

      // Sort by creation date (newest first)
      subgroups.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });

      console.log(`✅ Fetched ${subgroups.length} subgroups for group ${groupId}`);

      return {
        success: true,
        subGroups: subgroups
      };

    } catch (error) {
      console.error('❌ Error fetching subgroups:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        `Failed to fetch subgroups: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);
