// /services/fetchGroupMembers.ts - Read group members via Firebase Functions
// Calls getGroupMembers Firebase Function following three-layer architecture

import { httpsCallable } from 'firebase/functions';
import { functions } from './core/firebase';
import type { GroupMemberData } from './types/group';

export interface GroupMembersResponse {
  success: boolean;
  members: GroupMemberData[];
  error?: string;
}

/**
 * Fetch all members of a group via Firebase Function
 * Calls getGroupMembers Firebase Function instead of direct Firestore access
 */
export const fetchGroupMembers = async (clubId: string, groupId: string): Promise<GroupMembersResponse> => {
  try {
    // Call Firebase Function instead of direct Firestore access
    const getGroupMembersFn = httpsCallable(functions, 'getGroupMembers');
    const result = await getGroupMembersFn({ clubId, groupId });
    
    const response = result.data as { success: boolean; members?: any[]; memberCount?: number; error?: string };
    
    if (!response.success) {
      console.log(`Error fetching group members: ${response.error}`);
      return { success: false, members: [], error: response.error };
    }

    const members: GroupMemberData[] = response.members || [];

    console.log(`✅ Fetched ${members.length} members for group ${groupId} in club ${clubId}`);
    return { success: true, members };

  } catch (error: any) {
    console.error('❌ Error fetching group members:', error);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error message:', error.message);
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

    // TODO: Update this to fetch from new subgroup subcollections
    // For now, return empty array as subgroup membership is tracked separately
    console.warn('⚠️ fetchSubGroupMembers: Needs update to use new subgroup architecture');
    return { success: true, members: [] };

  } catch (error: any) {
    console.error('❌ Error fetching sub-group members:', error);
    return { 
      success: false, 
      members: [], 
      error: error.message || 'Failed to fetch sub-group members'
    };
  }
};
