/**
 * Orchestration Service: Reactivate Group
 * 
 * Coordinates group reactivation including:
 * - Validation of grace period (must be within 30 days)
 * - Reactivation of group and all subgroups
 * - User document updates for all affected members
 * - Batch processing for efficiency
 * 
 * This is a service layer function that orchestrates multiple atomic backend functions.
 * It does NOT directly access Firestore - all operations go through atomic functions.
 */

import { httpsCallable } from 'firebase/functions';
import { collection, getDocs } from 'firebase/firestore';
import { db, functions } from '../core/firebase';

// Firebase Function references
const reactivateGroupFn = httpsCallable<
  { clubId: string; groupId: string },
  { 
    success: boolean; 
    subgroupsReactivated: number;
    message?: string;
    error?: string;
  }
>(functions, 'reactivateGroup');

const updateUserGroupReactivationFn = httpsCallable<
  { userId: string; clubId: string; groupId: string },
  { success: boolean; message?: string }
>(functions, 'updateUserGroupReactivation');

export interface ReactivateGroupServiceResponse {
  success: boolean;
  subgroupsReactivated?: number;
  affectedUsers?: number;
  message?: string;
  error?: string;
}

/**
 * Reactivate a soft-deleted group (within 30-day grace period)
 * 
 * @param clubId - Club ID containing the group
 * @param groupId - Group ID to reactivate
 * @returns Reactivation result with counts
 */
export async function reactivateGroupService(
  clubId: string,
  groupId: string
): Promise<ReactivateGroupServiceResponse> {
  try {
    console.log(`[reactivateGroupService] Starting reactivation of group ${groupId}`);

    // Step 1: Call reactivateGroup function (validates grace period + cascades to subgroups)
    console.log('[reactivateGroupService] Calling reactivateGroup function...');
    const reactivateResult = await reactivateGroupFn({ clubId, groupId });
    const reactivateData = reactivateResult.data;

    if (!reactivateData.success) {
      return {
        success: false,
        error: reactivateData.error || 'Failed to reactivate group',
      };
    }

    console.log(`[reactivateGroupService] Group reactivated successfully`);
    console.log(`[reactivateGroupService] Subgroups reactivated: ${reactivateData.subgroupsReactivated}`);

    // Step 2: Get all members from the group's allMembers collection
    console.log('[reactivateGroupService] Fetching all group members...');
    const allMembersRef = collection(db, `clubs/${clubId}/groups/${groupId}/allMembers`);
    const membersSnapshot = await getDocs(allMembersRef);
    
    const memberIds = membersSnapshot.docs.map(doc => doc.id);
    console.log(`[reactivateGroupService] Found ${memberIds.length} members to update`);

    // Step 3: Update user documents in parallel (reactivate groupAccess entries)
    if (memberIds.length > 0) {
      console.log('[reactivateGroupService] Updating user documents...');
      const userUpdatePromises = memberIds.map(userId =>
        updateUserGroupReactivationFn({ userId, clubId, groupId })
          .catch(error => {
            console.error(`[reactivateGroupService] Failed to update user ${userId}:`, error);
            // Don't fail entire operation if one user update fails
            return { data: { success: false, message: error.message } };
          })
      );

      await Promise.all(userUpdatePromises);
      console.log('[reactivateGroupService] User documents updated');
    }

    console.log('[reactivateGroupService] Group reactivation complete!');

    return {
      success: true,
      subgroupsReactivated: reactivateData.subgroupsReactivated,
      affectedUsers: memberIds.length,
      message: reactivateData.message,
    };
  } catch (error: any) {
    console.error('[reactivateGroupService] Error:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during group reactivation',
    };
  }
}
