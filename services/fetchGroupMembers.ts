// /services/fetchGroupMembers.ts - Read group members directly from Firestore
// Fetches from /clubs/{clubId}/groups/{groupId}/allMembers/members/

import { doc, getDoc, getFirestore } from 'firebase/firestore';
import type { GroupMemberData } from './types/group';

export interface GroupMembersResponse {
  success: boolean;
  members: GroupMemberData[];
  error?: string;
}

/**
 * Fetch all members of a group
 * Reads from /clubs/{clubId}/groups/{groupId}/allMembers/members/
 */
export const fetchGroupMembers = async (clubId: string, groupId: string): Promise<GroupMembersResponse> => {
  try {
    const db = getFirestore();
    const membersDocRef = doc(db, 'clubs', clubId, 'groups', groupId, 'allMembers', 'members');
    const membersDoc = await getDoc(membersDocRef);

    if (!membersDoc.exists()) {
      console.log(`No members document found for group ${groupId} in club ${clubId}`);
      return { success: true, members: [] };
    }

    const data = membersDoc.data();
    const members: GroupMemberData[] = data?.members || [];

    console.log(`Fetched ${members.length} members for group ${groupId} in club ${clubId}`);
    return { success: true, members };

  } catch (error: any) {
    console.error('❌ Error fetching group members:', error);
    return { 
      success: false, 
      members: [], 
      error: error.message || 'Failed to fetch group members'
    };
  }
};

/**
 * Get member count for a group
 */
export const getGroupMemberCount = async (clubId: string, groupId: string): Promise<number> => {
  const result = await fetchGroupMembers(clubId, groupId);
  return result.success ? result.members.length : 0;
};

/**
 * Get members belonging to specific sub-groups
 */
export const fetchSubGroupMembers = async (
  clubId: string, 
  groupId: string, 
  subGroupIds: string[]
): Promise<GroupMembersResponse> => {
  try {
    const allMembersResult = await fetchGroupMembers(clubId, groupId);
    
    if (!allMembersResult.success) {
      return allMembersResult;
    }

    // Filter members who belong to any of the specified sub-groups
    const subGroupMembers = allMembersResult.members.filter(member => 
      member.belongsToSubGroups?.some(subGroup => subGroupIds.includes(subGroup))
    );

    return { success: true, members: subGroupMembers };

  } catch (error: any) {
    console.error('❌ Error fetching sub-group members:', error);
    return { 
      success: false, 
      members: [], 
      error: error.message || 'Failed to fetch sub-group members'
    };
  }
};
