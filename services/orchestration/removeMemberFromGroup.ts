/**
 * Orchestration Service: Remove Member from Group
 * 
 * Coordinates group-level member removal including:
 * - Permission validation (coach/admin/club-admin)
 * - Guardian/dependent status checking
 * - Removal from group and all subgroups (cascade)
 * - User document updates
 * - Guardian tracking updates (for youth members)
 * - Club admin contact information for escalation
 * 
 * This is a service layer function that orchestrates multiple atomic backend functions.
 * It does NOT directly access Firestore - all operations go through atomic functions.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../core/firebase';
import { getClubAdminContacts } from '../helpers/getClubAdminContacts';
import { memberService } from '../member';
import type { GuardianDependentStatus, RemovalResult } from '../types/removal';

// Firebase Function references
const checkGuardianDependentStatusFn = httpsCallable<
  { userId: string; clubId: string },
  GuardianDependentStatus
>(functions, 'checkGuardianDependentStatus');

const updateUserGroupRemovalFn = httpsCallable<
  { userId: string; clubId: string; groupId: string },
  { success: boolean; message?: string }
>(functions, 'updateUserGroupRemoval');

const updateGuardianDependentClubRemovalFn = httpsCallable<
  { guardianUid: string; youthUid: string; clubId: string },
  { success: boolean; message?: string }
>(functions, 'updateGuardianDependentClubRemoval');

/**
 * Remove member from group (includes cascade to all subgroups)
 * 
 * @param clubId - Club ID containing the group
 * @param groupId - Group ID to remove member from
 * @param userId - User ID to remove
 * @param currentUserRole - Role of user performing the removal
 * @returns Detailed removal result with club admin contacts
 */
export async function removeMemberFromGroupService(
  clubId: string,
  groupId: string,
  userId: string,
  currentUserRole: string
): Promise<RemovalResult> {
  try {
    console.log(`[removeMemberFromGroupService] Starting removal of user ${userId} from group ${groupId}`);

    // Step 1: Validate permissions
    const canRemove = ['admin', 'coach', 'club-admin'].includes(currentUserRole);
    if (!canRemove) {
      return {
        success: false,
        error: 'Insufficient permissions. Only coaches, admins, and club admins can remove members from groups.',
      };
    }

    // Step 2: Check guardian/dependent status
    console.log('[removeMemberFromGroupService] Checking guardian/dependent status...');
    const statusCheckResult = await checkGuardianDependentStatusFn({ userId, clubId });
    const statusCheck = statusCheckResult.data;

    // Step 3: Call atomic function to remove from group (includes subgroup cascade)
    console.log('[removeMemberFromGroupService] Removing from group and subgroups...');
    const removeResult = await memberService.removeMemberFromGroup(clubId, groupId, userId);

    if (!removeResult.success) {
      return {
        success: false,
        error: removeResult.error || 'Failed to remove member from group',
      };
    }

    // Step 4: Update user document (remove group from groupAccess)
    console.log('[removeMemberFromGroupService] Updating user document...');
    await updateUserGroupRemovalFn({ userId, clubId, groupId });

    // Step 5: Handle youth-specific cleanup
    if (statusCheck.isYouth && statusCheck.guardians) {
      console.log('[removeMemberFromGroupService] Updating guardians for youth member...');
      
      // Note: We update the full club access since guardians track by club, not by group
      // The guardian's dependent.clubAccess array will be updated to reflect current state
      for (const guardian of statusCheck.guardians) {
        console.log(`[removeMemberFromGroupService] Updating guardian ${guardian.guardianUid}...`);
        // This updates the guardian's view of the dependent's access
        // The actual implementation reads the youth's current clubAccess and syncs it
        await updateGuardianDependentClubRemovalFn({
          guardianUid: guardian.guardianUid,
          youthUid: userId,
          clubId, // Pass club context
        });
      }
    }

    // Step 6: Get club admin contacts for escalation message
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
