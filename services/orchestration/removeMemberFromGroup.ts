/**
 * Orchestration Service: Remove Member from Group
 * 
 * Coordinates group-level member removal including:
 * - Permission validation (coach/admin/club-admin)
 * - Removal from group and all subgroups (cascade)
 * - User document updates
 * - Club admin contact information for escalation
 * 
 * SIMPLIFIED LOGIC:
 * - No guardian status pre-checks (backend handles all cascade)
 * - Backend automatically removes guardian roles when youth leaves
 * - Backend automatically marks inactive when roles[] becomes empty
 * 
 * This is a service layer function that orchestrates multiple atomic backend functions.
 * It does NOT directly access Firestore - all operations go through atomic functions.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../core/firebase';
import { getClubAdminContacts } from '../helpers/getClubAdminContacts';
import { memberService } from '../member';
import type { RemovalResult } from '../types/removal';

// Firebase Function references
const updateUserGroupRemovalFn = httpsCallable<
  { userId: string; clubId: string; groupId: string },
  { success: boolean; message?: string }
>(functions, 'updateUserGroupRemoval');

/**
 * Remove member from group (includes cascade to all subgroups)
 * 
 * Permission validation happens in the Firebase Function using request.auth.uid
 * to verify the calling user has admin/coach/club-admin role.
 * 
 * @param clubId - Club ID containing the group
 * @param groupId - Group ID to remove member from
 * @param userId - User ID to remove
 * @param roleToRemove - Optional: Specific role to remove (for role de-accumulation). If not provided, removes all roles.
 * @returns Detailed removal result with club admin contacts
 */
export async function removeMemberFromGroupService(
  clubId: string,
  groupId: string,
  userId: string,
  roleToRemove?: string
): Promise<RemovalResult> {
  try {
    console.log(`[removeMemberFromGroupService] Starting removal of user ${userId} from group ${groupId}`);
    if (roleToRemove) {
      console.log(`[removeMemberFromGroupService] Role-specific removal: ${roleToRemove}`);
    } else {
      console.log(`[removeMemberFromGroupService] Removing all roles`);
    }

    // Step 1: Call atomic function to remove from group (includes subgroup cascade)
    // Backend Firebase Function validates permissions using request.auth.uid
    // Backend automatically handles:
    // - Permission validation (coach/admin/club-admin)
    // - Guardian role removal when youth leaves
    // - Inactivity detection when roles[] becomes empty
    // - Club member list role updates
    console.log('[removeMemberFromGroupService] Removing from group and subgroups...');
    const removeResult = await memberService.removeMemberFromGroup(clubId, groupId, userId, roleToRemove);
    console.log('[removeMemberFromGroupService] Remove result:', removeResult);

    if (!removeResult.success) {
      return {
        success: false,
        error: removeResult.error || 'Failed to remove member from group',
      };
    }

    // Step 3: Update user document (remove group from groupAccess)
    console.log('[removeMemberFromGroupService] Updating user document...');
    await updateUserGroupRemovalFn({ userId, clubId, groupId });

    // Step 4: Get club admin contacts for escalation message
    const clubAdmins = await getClubAdminContacts(clubId);

    console.log('[removeMemberFromGroupService] Removal complete!');

    return {
      success: true,
      message: 'Member removed from group and all subgroups',
      clubAdminContacts: clubAdmins,
      removedFrom: {
        group: groupId,
        // Subgroups are automatically handled by removeMemberFromGroup cascade
      },
    };
  } catch (error: any) {
    console.error('[removeMemberFromGroupService] Error:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during group removal',
    };
  }
}
