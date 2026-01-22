import { httpsCallable } from 'firebase/functions';
import { functions } from './core/firebase';
import type { GroupMemberData } from './types/group';

/**
 * Subgroup data interface
 */
export interface SubGroup {
  id: string;
  name: string;
  createdBy: string;
  createdAt: any;
  description?: string;
  color?: string;
  memberCount: number;
}

/**
 * Subgroup Service
 * 
 * Manages subgroup operations following the three-layer architecture:
 * - UI Layer → Service Layer → Firebase Functions
 * 
 * Data Structure: /clubs/{clubId}/groups/{groupId}/subgroups/{subgroupId}
 * Each subgroup has: /allMembers/members (consistent with club/group pattern)
 */
class SubgroupService {
  /**
   * Fetch all subgroups for a group
   * Uses Firebase Function for secure access
   * 
   * @param clubId - Club ID
   * @param groupId - Group ID
   * @returns Array of subgroups with metadata and member counts
   */
  async fetchSubgroups(clubId: string, groupId: string): Promise<SubGroup[]> {
    try {
      console.log(`📂 Fetching subgroups for group ${groupId}`);

      // Call Firebase Function instead of direct Firestore access
      const getSubGroupsFn = httpsCallable(functions, 'getSubGroups');
      const result = await getSubGroupsFn({ clubId, groupId });
      
      const response = result.data as { success: boolean; subgroups?: any[]; error?: string };
      
      if (!response.success) {
        console.error(`❌ Failed to fetch subgroups: ${response.error}`);
        return [];
      }

      const subgroups: SubGroup[] = (response.subgroups || []).map((data: any) => ({
        id: data.id,
        name: data.name || 'Unnamed',
        createdBy: data.createdBy || '',
        createdAt: data.createdAt || null,
        description: data.description || '',
        color: data.color || '',
        memberCount: data.memberCount || 0
      }));

      console.log(`✅ Fetched ${subgroups.length} subgroups`);
      return subgroups;
    } catch (error) {
      console.error('❌ Error fetching subgroups:', error);
      return [];
    }
  }

  /**
   * Fetch single subgroup details
   * 
   * @param clubId - Club ID
   * @param groupId - Group ID
   * @param subgroupId - Subgroup ID
   * @returns Subgroup details or null if not found
   */
  async getSubgroup(clubId: string, groupId: string, subgroupId: string): Promise<SubGroup | null> {
    try {
      console.log(`📂 Fetching subgroup ${subgroupId}`);

      const getSubgroupFunction = httpsCallable(functions, 'getSubgroup');
      const result = await getSubgroupFunction({ 
        clubId, 
        groupId, 
        subgroupId 
      });
      
      const data = result.data as { 
        success: boolean; 
        subgroup?: SubGroup;
        error?: string;
      };
      
      if (!data.success || !data.subgroup) {
        console.log(`❌ Subgroup not found: ${subgroupId}`);
        return null;
      }

      console.log(`✅ Fetched subgroup: ${data.subgroup.name}`);
      return data.subgroup;
    } catch (error) {
      console.error('❌ Error fetching subgroup:', error);
      return null;
    }
  }

  /**
   * Fetch members of a subgroup
   * 
   * @param clubId - Club ID
   * @param groupId - Group ID
   * @param subgroupId - Subgroup ID
   * @returns Object with success flag and array of members
   */
  async getSubgroupMembers(
    clubId: string, 
    groupId: string, 
    subgroupId: string
  ): Promise<{ success: boolean; members: GroupMemberData[] }> {
    try {
      console.log(`👥 Fetching members for subgroup ${subgroupId}`);

      const getSubgroupMembersFunction = httpsCallable(functions, 'getSubgroupMembers');
      const result = await getSubgroupMembersFunction({ 
        clubId, 
        groupId, 
        subgroupId 
      });
      
      const data = result.data as { 
        success: boolean; 
        members: GroupMemberData[];
        memberCount: number;
        error?: string;
      };
      
      if (!data.success) {
        console.error(`❌ Error fetching subgroup members: ${data.error}`);
        return { success: false, members: [] };
      }
      
      console.log(`✅ Fetched ${data.memberCount} members`);
      
      return {
        success: true,
        members: data.members
      };
    } catch (error) {
      console.error('❌ Error fetching subgroup members:', error);
      return { success: false, members: [] };
    }
  }

  /**
   * Create a new subgroup
   * 
   * @param clubId - Club ID
   * @param groupId - Group ID
   * @param name - Subgroup name
   * @param uid - Creator user ID
   * @param description - Optional description
   * @param color - Optional color code
   * @returns Result with success flag and subgroup ID
   */
  async createSubgroup(
    clubId: string,
    groupId: string,
    name: string,
    uid: string,
    description?: string,
    color?: string
  ): Promise<{ success: boolean; subGroupId?: string; error?: string }> {
    try {
      console.log(`➕ Creating subgroup: ${name}`);

      const createSubGroupFn = httpsCallable(functions, 'createSubGroup');
      const result = await createSubGroupFn({
        uid,
        clubId,
        groupId,
        subGroupName: name,
        description,
        color
      });
      
      const data = result.data as { success: boolean; subGroupId?: string; subGroupName?: string; error?: string };

      if (data.success) {
        console.log(`✅ Subgroup created: ${data.subGroupId} (${data.subGroupName})`);
      } else {
        console.error(`❌ Failed to create subgroup: ${data.error}`);
      }

      return {
        success: data.success,
        subGroupId: data.subGroupId,
        error: data.error
      };
    } catch (error) {
      console.error('❌ Error creating subgroup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update subgroup details (name, description, color)
   * 
   * @param clubId - Club ID
   * @param groupId - Group ID
   * @param subgroupId - Subgroup ID
   * @param uid - User ID (for permission check)
   * @param updates - Fields to update
   * @returns Result with success flag
   */
  async updateSubgroup(
    clubId: string,
    groupId: string,
    subgroupId: string,
    uid: string,
    updates: { name?: string; description?: string; color?: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`✏️ Updating subgroup ${subgroupId}`);

      const updateSubGroupFn = httpsCallable(functions, 'updateSubGroup');
      const result = await updateSubGroupFn({
        uid,
        clubId,
        groupId,
        subGroupId: subgroupId,
        ...updates
      });
      
      const data = result.data as { success: boolean; message?: string; error?: string };

      if (data.success) {
        console.log(`✅ Subgroup updated successfully`);
      } else {
        console.error(`❌ Failed to update subgroup: ${data.error}`);
      }

      return {
        success: data.success,
        error: data.error
      };
    } catch (error) {
      console.error('❌ Error updating subgroup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Delete a subgroup
   * 
   * @param clubId - Club ID
   * @param groupId - Group ID
   * @param subgroupId - Subgroup ID
   * @param uid - User ID (for permission check)
   * @returns Result with success flag and deleted member count
   */
  async deleteSubgroup(
    clubId: string,
    groupId: string,
    subgroupId: string,
    uid: string
  ): Promise<{ success: boolean; deletedMemberCount?: number; error?: string }> {
    try {
      console.log(`🗑️ Deleting subgroup ${subgroupId}`);

      const deleteSubGroupFn = httpsCallable(functions, 'deleteSubGroup');
      const result = await deleteSubGroupFn({
        uid,
        clubId,
        groupId,
        subGroupId: subgroupId
      });
      
      const data = result.data as { success: boolean; message?: string; deletedMemberCount?: number; error?: string };

      if (data.success) {
        console.log(`✅ Subgroup deleted (${data.deletedMemberCount || 0} members removed)`);
      } else {
        console.error(`❌ Failed to delete subgroup: ${data.error}`);
      }

      return {
        success: data.success,
        deletedMemberCount: data.deletedMemberCount,
        error: data.error
      };
    } catch (error) {
      console.error('❌ Error deleting subgroup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Add member to subgroup
   * 
   * @param clubId - Club ID
   * @param groupId - Group ID
   * @param subgroupId - Subgroup ID
   * @param userId - User ID to add
   * @returns Result with success flag
   */
  async addMemberToSubgroup(
    clubId: string,
    groupId: string,
    subgroupId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`➕ Adding member ${userId} to subgroup ${subgroupId}`);

      const addMemberFn = httpsCallable(functions, 'addMemberToSubGroup');
      const result = await addMemberFn({
        clubId,
        groupId,
        subGroupId: subgroupId,
        userId
      });
      
      const data = result.data as { success: boolean; message?: string; error?: string };

      if (data.success) {
        console.log(`✅ Member added to subgroup`);
      } else {
        console.error(`❌ Failed to add member: ${data.error}`);
      }

      return {
        success: data.success,
        error: data.error
      };
    } catch (error) {
      console.error('❌ Error adding member to subgroup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Remove member from subgroup
   * 
   * @param clubId - Club ID
   * @param groupId - Group ID
   * @param subgroupId - Subgroup ID
   * @param userId - User ID to remove
   * @returns Result with success flag
   */
  async removeMemberFromSubgroup(
    clubId: string,
    groupId: string,
    subgroupId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`➖ Removing member ${userId} from subgroup ${subgroupId}`);

      const removeMemberFn = httpsCallable(functions, 'removeMemberFromSubGroup');
      const result = await removeMemberFn({
        clubId,
        groupId,
        subGroupId: subgroupId,
        userId
      });
      
      const data = result.data as { success: boolean; message?: string; error?: string };

      if (data.success) {
        console.log(`✅ Member removed from subgroup`);
      } else {
        console.error(`❌ Failed to remove member: ${data.error}`);
      }

      return {
        success: data.success,
        error: data.error
      };
    } catch (error) {
      console.error('❌ Error removing member from subgroup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if user can manage subgroups (admin, coach, group creator, or club admin)
   * 
   * @param group - Group data
   * @param userId - User ID to check
   * @param userRoles - User's roles in the group
   * @returns True if user can manage subgroups
   */
  canUserManageSubgroup(group: any, userId: string, userRoles: string[]): boolean {
    return (
      group?.createdBy === userId ||
      userRoles.includes('admin') ||
      userRoles.includes('coach') ||
      userRoles.includes('club-admin')
    );
  }
}

// Export singleton instance
export const subgroupService = new SubgroupService();
