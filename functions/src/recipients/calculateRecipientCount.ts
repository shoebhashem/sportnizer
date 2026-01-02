import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export interface CalculateRecipientCountRequest {
  selection: {
    type: 'entire-club' | 'selected-groups' | 'selected-subgroups' | 'mixed';
    clubId?: string;
    groups?: {
      groupId: string;
      groupName: string;
      scope: 'entire' | 'subgroups';
      subgroupIds?: string[];
    }[];
  };
}

export interface CalculateRecipientCountResponse {
  success: boolean;
  count?: number;
  breakdown?: {
    clubCount?: number;
    groupCounts?: { [groupId: string]: number };
    subgroupCounts?: { [subgroupId: string]: number };
  };
  error?: string;
}

export const calculateRecipientCount = onCall(
  {
    region: config.region,
  },
  async (request): Promise<CalculateRecipientCountResponse> => {
    try {
      const { selection }: CalculateRecipientCountRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['selection']);
      validateRequiredFields(selection, ['type']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Calculating recipient count for selection type: ${selection.type}`);

      const db = admin.firestore();
      let totalCount = 0;
      const breakdown: {
        clubCount?: number;
        groupCounts?: { [groupId: string]: number };
        subgroupCounts?: { [subgroupId: string]: number };
      } = {};

      if (selection.type === 'entire-club' && selection.clubId) {
        console.log(`Calculating count for entire club: ${selection.clubId}`);
        
        // Get all groups in the club and sum their member counts
        const groupsSnapshot = await db
          .collection('clubs')
          .doc(selection.clubId)
          .collection('groups')
          .get();

        let clubCount = 0;
        const groupCounts: { [groupId: string]: number } = {};

        for (const groupDoc of groupsSnapshot.docs) {
          const groupId = groupDoc.id;
          
          // Get members document for this group
          const membersDoc = await db
            .collection('clubs')
            .doc(selection.clubId)
            .collection('groups')
            .doc(groupId)
            .collection('allMembers')
            .doc('members')
            .get();

          if (membersDoc.exists) {
            const membersData = membersDoc.data();
            const memberCount = membersData?.memberCount || membersData?.members?.length || 0;
            groupCounts[groupId] = memberCount;
            clubCount += memberCount;
          }
        }

        totalCount = clubCount;
        breakdown.clubCount = clubCount;
        breakdown.groupCounts = groupCounts;

      } else if ((selection.type === 'selected-groups' || selection.type === 'mixed' || selection.type === 'selected-subgroups') && selection.groups) {
        console.log(`Calculating count for ${selection.groups.length} group selections`);
        
        const groupCounts: { [groupId: string]: number } = {};
        const subgroupCounts: { [subgroupId: string]: number } = {};

        for (const group of selection.groups) {
          // Extract clubId from groupId (assuming format: clubId or needs to be provided)
          // For now, we'll assume groups are within the same club context
          const clubId = selection.clubId || group.groupId.split('/')[0]; // Fallback logic
          
          if (group.scope === 'entire') {
            console.log(`Counting entire group: ${group.groupId}`);
            
            // Get all members in the group
            const membersDoc = await db
              .collection('clubs')
              .doc(clubId)
              .collection('groups')
              .doc(group.groupId)
              .collection('allMembers')
              .doc('members')
              .get();

            if (membersDoc.exists) {
              const membersData = membersDoc.data();
              const memberCount = membersData?.memberCount || membersData?.members?.length || 0;
              groupCounts[group.groupId] = memberCount;
              totalCount += memberCount;
            }

          } else if (group.scope === 'subgroups' && group.subgroupIds) {
            console.log(`Counting subgroups for group ${group.groupId}: ${group.subgroupIds.join(', ')}`);
            
            // Get members and filter by subgroups
            const membersDoc = await db
              .collection('clubs')
              .doc(clubId)
              .collection('groups')
              .doc(group.groupId)
              .collection('allMembers')
              .doc('members')
              .get();

            if (membersDoc.exists) {
              const membersData = membersDoc.data();
              const allMembers = membersData?.members || [];
              
              // Count members in specified subgroups
              let subgroupMemberCount = 0;
              const subgroupMemberCounts: { [subgroupId: string]: number } = {};

              for (const subgroupId of group.subgroupIds) {
                const membersInSubgroup = allMembers.filter((member: any) => 
                  member.belongsToSubGroups?.includes(subgroupId)
                );
                const count = membersInSubgroup.length;
                subgroupMemberCounts[subgroupId] = count;
                subgroupMemberCount += count;
              }

              // Store counts
              Object.assign(subgroupCounts, subgroupMemberCounts);
              totalCount += subgroupMemberCount;
            }
          }
        }

        breakdown.groupCounts = groupCounts;
        breakdown.subgroupCounts = subgroupCounts;
      }

      console.log(`Successfully calculated recipient count: ${totalCount}`);

      return {
        success: true,
        count: totalCount,
        breakdown
      };

    } catch (error) {
      console.error('Error in calculateRecipientCount:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to calculate recipient count');
    }
  }
);
