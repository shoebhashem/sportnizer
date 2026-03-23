// /services/member.ts - Thin orchestration service for member operations
// Calls atomic Firebase Functions instead of direct Firestore operations

import { httpsCallable } from "firebase/functions";
import { functions } from "./core/firebase";

// Types for member contact details
export interface GuardianContactDetails {
  guardianUid: string;
  displayName: string;
  email: string;
  phoneNumber: string | null;
  relationship: string;
}

export interface MemberContactDetails {
  displayName: string;
  email: string;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  photoURL: string | null;
  isYouth: boolean;
}

export interface GetMemberContactDetailsResponse {
  success: boolean;
  member: MemberContactDetails;
  guardians?: GuardianContactDetails[];
  error?: string;
}

// Firebase Function references - these would be member management functions
const addMemberToClubFn = httpsCallable(functions, "addMemberToClub");
const removeMemberFromClubFn = httpsCallable(functions, "removeMemberFromClub");
const addMemberToGroupFn = httpsCallable(functions, "addMemberToGroup");
const removeMemberFromGroupFn = httpsCallable(
  functions,
  "removeMemberFromGroup",
);
const updateMemberRoleFn = httpsCallable(functions, "updateMemberRole");
const getMemberContactDetailsFn = httpsCallable(
  functions,
  "getMemberContactDetails",
);
const removeClubAdminFn = httpsCallable(functions, "removeClubAdmin");
const deleteUserAccountFn = httpsCallable(functions, "deleteUserAccount");

export const memberService = {
  /**
   * Add member to club
   */
  async addMemberToClub(
    clubId: string,
    memberData: {
      userId: string;
      role: "club-admin" | "member";
    },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await addMemberToClubFn({ clubId, memberData });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error("❌ Error adding member to club:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Remove member from club
   */
  async removeMemberFromClub(
    clubId: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await removeMemberFromClubFn({ clubId, userId });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error("❌ Error removing member from club:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Add member to group
   */
  async addMemberToGroup(
    clubId: string,
    groupId: string,
    memberData: {
      userId: string;
      roles: string[];
    },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await addMemberToGroupFn({ clubId, groupId, memberData });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error("❌ Error adding member to group:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Remove member from group
   * @param roleToRemove - Optional: Specific role to remove. If not provided, removes all roles.
   */
  async removeMemberFromGroup(
    clubId: string,
    groupId: string,
    userId: string,
    roleToRemove?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await removeMemberFromGroupFn({
        clubId,
        groupId,
        userId,
        roleToRemove,
      });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error("❌ Error removing member from group:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update member role
   */
  async updateMemberRole(
    clubId: string,
    groupId: string | null,
    userId: string,
    newRoles: string[],
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await updateMemberRoleFn({
        clubId,
        groupId,
        userId,
        newRoles,
      });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error("❌ Error updating member role:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Add unconfirmed child to group (temporary implementation using addMemberToGroup)
   * TODO: Create dedicated addUnconfirmedChild Firebase Function if special logic is needed
   */
  async addUnconfirmedChild(
    groupId: string,
    childData: { name: string; birthDate?: string },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // For now, use the existing addMemberToGroup function
      // In a real implementation, you might want a dedicated Firebase Function for unconfirmed children
      console.log(
        "⚠️ addUnconfirmedChild: Using temporary implementation. Consider creating dedicated Firebase Function.",
      );

      // This would need to be adapted based on your specific requirements for unconfirmed children
      // For now, return a placeholder response
      return {
        success: false,
        error:
          "addUnconfirmedChild not fully implemented. Create dedicated Firebase Function for this functionality.",
      };
    } catch (error: any) {
      console.error("❌ Error adding unconfirmed child:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get contact details for a group member
   * Permission:
   * - If groupId provided: Caller must be club-admin, admin, or coach in the group
   * - If groupId NOT provided: Caller must be club-admin (club-level access only)
   * For youth members, also fetches guardian contact details
   */
  async getMemberContactDetails(
    userId: string,
    clubId: string,
    groupId?: string,
  ): Promise<GetMemberContactDetailsResponse> {
    try {
      const result = await getMemberContactDetailsFn({
        userId,
        clubId,
        ...(groupId && { groupId }),
      });
      return result.data as GetMemberContactDetailsResponse;
    } catch (error: any) {
      console.error("❌ Error getting member contact details:", error);
      return {
        success: false,
        member: {
          displayName: "Unknown",
          email: "",
          phoneNumber: null,
          dateOfBirth: null,
          photoURL: null,
          isYouth: false,
        },
        error: error.message,
      };
    }
  },

  /**
   * Remove club-admin role from a user.
   * Only callable by another club-admin. Blocks if sole club-admin.
   */
  async removeClubAdmin(
    clubId: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string; updatedRoles?: string[] }> {
    try {
      const result = await removeClubAdminFn({ clubId, userId });
      return result.data as {
        success: boolean;
        error?: string;
        updatedRoles?: string[];
      };
    } catch (error: any) {
      console.error("❌ Error removing club admin:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Permanently delete the calling user's own account.
   * Pre-conditions: no active groups, no club-admin role, no active dependents.
   */
  async deleteUserAccount(): Promise<{
    success: boolean;
    reason?: string;
    message?: string;
    activeGroups?: { clubName: string; groupName: string }[];
    activeClubAdminClubs?: string[];
    activeDependents?: string;
  }> {
    try {
      const result = await deleteUserAccountFn({});
      return result.data as any;
    } catch (error: any) {
      console.error("❌ Error deleting user account:", error);
      return { success: false, message: error.message };
    }
  },
};
