// /services/member.ts - Thin orchestration service for member operations
// Calls atomic Firebase Functions instead of direct Firestore operations

import { httpsCallable } from 'firebase/functions';
import { functions } from './core/firebase';

// Firebase Function references - these would be member management functions
const addMemberToClubFn = httpsCallable(functions, 'addMemberToClub');
const removeMemberFromClubFn = httpsCallable(functions, 'removeMemberFromClub');
const addMemberToGroupFn = httpsCallable(functions, 'addMemberToGroup');
const removeMemberFromGroupFn = httpsCallable(functions, 'removeMemberFromGroup');
const updateMemberRoleFn = httpsCallable(functions, 'updateMemberRole');

export const memberService = {
  /**
   * Add member to club
   */
  async addMemberToClub(clubId: string, memberData: {
    userId: string;
    role: 'club-admin' | 'member';
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await addMemberToClubFn({ clubId, memberData });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error adding member to club:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Remove member from club
   */
  async removeMemberFromClub(clubId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await removeMemberFromClubFn({ clubId, userId });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error removing member from club:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Add member to group
   */
  async addMemberToGroup(clubId: string, groupId: string, memberData: {
    userId: string;
    roles: string[];
    subGroups?: string[];
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await addMemberToGroupFn({ clubId, groupId, memberData });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error adding member to group:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Remove member from group
   */
  async removeMemberFromGroup(clubId: string, groupId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await removeMemberFromGroupFn({ clubId, groupId, userId });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error removing member from group:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update member role
   */
  async updateMemberRole(clubId: string, groupId: string | null, userId: string, newRoles: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await updateMemberRoleFn({ clubId, groupId, userId, newRoles });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error updating member role:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Add unconfirmed child to group (temporary implementation using addMemberToGroup)
   * TODO: Create dedicated addUnconfirmedChild Firebase Function if special logic is needed
   */
  async addUnconfirmedChild(groupId: string, childData: { name: string; birthDate?: string }): Promise<{ success: boolean; error?: string }> {
    try {
      // For now, use the existing addMemberToGroup function
      // In a real implementation, you might want a dedicated Firebase Function for unconfirmed children
      console.log('⚠️ addUnconfirmedChild: Using temporary implementation. Consider creating dedicated Firebase Function.');
      
      // This would need to be adapted based on your specific requirements for unconfirmed children
      // For now, return a placeholder response
      return { 
        success: false, 
        error: 'addUnconfirmedChild not fully implemented. Create dedicated Firebase Function for this functionality.' 
      };
    } catch (error: any) {
      console.error('❌ Error adding unconfirmed child:', error);
      return { success: false, error: error.message };
    }
  }
};
