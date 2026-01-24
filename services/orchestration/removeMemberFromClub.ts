/**
 * Orchestration Service: Remove Member from Club
 * 
 * Coordinates complete club-level member removal including:
 * - Permission validation (club-admin only)
 * - Guardian/dependent status checking
 * - Removal from all groups and subgroups (cascade)
 * - User document updates
 * - Guardian tracking updates
 * - Inactivity marking
 * 
 * This is a service layer function that orchestrates multiple atomic backend functions.
 * It does NOT directly access Firestore - all operations go through atomic functions.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../core/firebase';
import { getClubAdminContacts } from '../helpers/getClubAdminContacts';
import { memberService } from '../member';
import type { GroupMemberships, GuardianDependentStatus, RemovalResult } from '../types/removal';

// Firebase Function references
const checkGuardianDependentStatusFn = httpsCallable<
  { userId: string; clubId: string },
  GuardianDependentStatus
>(functions, 'checkGuardianDependentStatus');

const getMemberGroupMembershipsFn = httpsCallable<
  { clubId: string; userId: string },
  GroupMemberships
>(functions, 'getMemberGroupMemberships');

const updateUserClubRemovalFn = httpsCallable<
  { userId: string; clubId: string },
  { success: boolean; message?: string }
>(functions, 'updateUserClubRemoval');

const updateGuardianDependentClubRemovalFn = httpsCallable<
  { guardianUid: string; youthUid: string; clubId: string },
  { success: boolean; message?: string }
>(functions, 'updateGuardianDependentClubRemoval');

const checkAndMarkGuardianInactiveFn = httpsCallable<
  { guardianUid: string },
  { success: boolean; markedInactive: boolean; reason: string }
>(functions, 'checkAndMarkGuardianInactive');

const markUserInactiveFn = httpsCallable<
  { userId: string },
  { success: boolean; markedInactive: boolean; reason: string }
>(functions, 'markUserInactive');

/**
 * Remove member from club (complete cascade removal)
 * 
 * @param clubId - Club ID to remove member from
 * @param userId - User ID to remove
 * @param currentUserRole - Role of user performing the removal
 * @returns Detailed removal result with cleanup actions
 */
export async function removeMemberFromClubService(
  clubId: string,
  userId: string,
  currentUserRole: string
): Promise<RemovalResult> {
  try {
    console.log(`[removeMemberFromClubService] Starting removal of user ${userId} from club ${clubId}`);

    // Step 1: Validate permissions (only club-admin can remove from club)
    if (currentUserRole !== 'club-admin') {
      const clubAdmins = await getClubAdminContacts(clubId);
      return {
        success: false,
        error: 'Only club administrators can remove members from the club',
        clubAdminContacts: clubAdmins,
      };
    }

    // Step 2: Check guardian/dependent status
    console.log('[removeMemberFromClubService] Checking guardian/dependent status...');
    const statusCheckResult = await checkGuardianDependentStatusFn({ userId, clubId });
    const statusCheck = statusCheckResult.data;

    // Step 3: BLOCK if guardian has dependents in this club
    if (statusCheck.isGuardian && statusCheck.dependentsInThisClub && statusCheck.dependentsInThisClub > 0) {
      console.log(`[removeMemberFromClubService] Blocking removal - guardian has ${statusCheck.dependentsInThisClub} dependents`);
      return {
        success: false,
        error: `Cannot remove guardian while ${statusCheck.dependentsInThisClub} dependent(s) are still members of this club`,
        details: {
          dependents: statusCheck.dependentIds,
          suggestion: 'Please remove dependents first or transfer guardianship',
        },
      };
    }

    // Step 4: Discover all group memberships
    console.log('[removeMemberFromClubService] Discovering group memberships...');
    const membershipsResult = await getMemberGroupMembershipsFn({ clubId, userId });
    const memberships = membershipsResult.data;

    console.log(`[removeMemberFromClubService] Found ${memberships.groups.length} groups`);

    // Step 5: Remove from all groups (each includes subgroup cascade)
    for (const groupId of memberships.groups) {
      console.log(`[removeMemberFromClubService] Removing from group ${groupId}...`);
      const groupRemoveResult = await memberService.removeMemberFromGroup(clubId, groupId, userId);
      
      if (!groupRemoveResult.success) {
        console.error(`[removeMemberFromClubService] Failed to remove from group ${groupId}:`, groupRemoveResult.error);
        // Continue with other groups even if one fails
      }
    }

    // Step 6: Remove from club
    console.log('[removeMemberFromClubService] Removing from club...');
    const clubRemoveResult = await memberService.removeMemberFromClub(clubId, userId);
    
    if (!clubRemoveResult.success) {
      return {
        success: false,
        error: clubRemoveResult.error || 'Failed to remove member from club',
      };
    }

    // Step 7: Update user document
    console.log('[removeMemberFromClubService] Updating user document...');
    await updateUserClubRemovalFn({ userId, clubId });

    let guardiansNotified = 0;
    let userMarkedInactive = false;

    // Step 8: Handle youth-specific cleanup
    if (statusCheck.isYouth) {
      console.log('[removeMemberFromClubService] Handling youth member cleanup...');
      
      // Update all guardians' dependent tracking
      if (statusCheck.guardians) {
        for (const guardian of statusCheck.guardians) {
          console.log(`[removeMemberFromClubService] Updating guardian ${guardian.guardianUid}...`);
          await updateGuardianDependentClubRemovalFn({
            guardianUid: guardian.guardianUid,
            youthUid: userId,
            clubId,
          });
          guardiansNotified++;
        }
      }

      // Check if youth should be marked inactive
      if (!statusCheck.hasOtherClubs) {
        console.log('[removeMemberFromClubService] Marking youth as inactive...');
        const inactiveResult = await markUserInactiveFn({ userId });
        userMarkedInactive = inactiveResult.data.markedInactive;

        // Check if any guardian should also be marked inactive
        if (statusCheck.guardians) {
          for (const guardian of statusCheck.guardians) {
            console.log(`[removeMemberFromClubService] Checking guardian ${guardian.guardianUid} for inactivity...`);
            await checkAndMarkGuardianInactiveFn({ guardianUid: guardian.guardianUid });
          }
        }
      }
    }

    // Step 9: Check if regular user should be marked inactive
    if (!statusCheck.isYouth && !statusCheck.hasOtherClubs) {
      console.log('[removeMemberFromClubService] Marking user as inactive...');
      const inactiveResult = await markUserInactiveFn({ userId });
      userMarkedInactive = inactiveResult.data.markedInactive;
    }

    console.log('[removeMemberFromClubService] Removal complete!');

    // Calculate all subgroups that were removed
    const allSubgroups = Object.values(memberships.subgroups).flat();

    return {
      success: true,
      message: 'Member completely removed from club, all groups, and subgroups',
      removedFrom: {
        club: clubId,
        groups: memberships.groups,
        subgroups: allSubgroups,
      },
      cleanupActions: {
        userMarkedInactive,
        guardiansNotified,
      },
    };
  } catch (error: any) {
    console.error('[removeMemberFromClubService] Error:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during club removal',
    };
  }
}
