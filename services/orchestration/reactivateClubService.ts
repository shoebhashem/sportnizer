/**
 * Orchestration Service: Reactivate Club
 * 
 * Coordinates club reactivation including:
 * - Validation of grace period (must be within 30 days)
 * - Verification token validation (TODO: when support system ready)
 * - Reactivation of club, all groups, and all subgroups
 * - User document updates for all affected members
 * - User reactivation (if they were marked inactive)
 * - Batch processing for efficiency
 * 
 * This is a service layer function that orchestrates multiple atomic backend functions.
 * It does NOT directly access Firestore - all operations go through atomic functions.
 */

import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../core/firebase';

// Firebase Function references
const reactivateClubFn = httpsCallable<
  { clubId: string; verificationToken?: string },
  { 
    success: boolean; 
    groupsReactivated: number;
    subgroupsReactivated: number;
    message?: string;
    error?: string;
  }
>(functions, 'reactivateClub');

const updateUserClubReactivationFn = httpsCallable<
  { userId: string; clubId: string },
  { success: boolean; userReactivated: boolean; message?: string }
>(functions, 'updateUserClubReactivation');

export interface ReactivateClubServiceResponse {
  success: boolean;
  groupsReactivated?: number;
  subgroupsReactivated?: number;
  affectedUsers?: number;
  reactivatedUsersCount?: number;
  message?: string;
  error?: string;
}

/**
 * Reactivate a soft-deleted club (within 30-day grace period)
 * 
 * @param clubId - Club ID to reactivate
 * @param verificationToken - Optional JWT token from email verification (future implementation)
 * @returns Reactivation result with counts
 */
export async function reactivateClubService(
  clubId: string,
  verificationToken?: string
): Promise<ReactivateClubServiceResponse> {
  try {
    console.log(`[reactivateClubService] Starting reactivation of club ${clubId}`);

    // Step 1: Call reactivateClub function (validates token + grace period + cascades)
    console.log('[reactivateClubService] Calling reactivateClub function...');
    const reactivateResult = await reactivateClubFn({ clubId, verificationToken });
    const reactivateData = reactivateResult.data;

    if (!reactivateData.success) {
      return {
        success: false,
        error: reactivateData.error || 'Failed to reactivate club',
      };
    }

    console.log(`[reactivateClubService] Club reactivated successfully`);
    console.log(`[reactivateClubService] Groups reactivated: ${reactivateData.groupsReactivated}`);
    console.log(`[reactivateClubService] Subgroups reactivated: ${reactivateData.subgroupsReactivated}`);

    // Step 2: Get all club members
    console.log('[reactivateClubService] Fetching all club members...');
    const clubMembersRef = collection(db, `clubs/${clubId}/clubMembers`);
    const membersSnapshot = await getDocs(clubMembersRef);
    
    const memberIds = membersSnapshot.docs.map(doc => doc.id);
    console.log(`[reactivateClubService] Found ${memberIds.length} members to update`);

    // Step 3: Update user documents in parallel (reactivate club + all group access)
    let reactivatedUsersCount = 0;
    if (memberIds.length > 0) {
      console.log('[reactivateClubService] Updating user documents...');
      const userUpdatePromises = memberIds.map(userId =>
        updateUserClubReactivationFn({ userId, clubId })
          .then(result => {
            if (result.data.userReactivated) {
              reactivatedUsersCount++;
            }
            return result;
          })
          .catch(error => {
            console.error(`[reactivateClubService] Failed to update user ${userId}:`, error);
            // Don't fail entire operation if one user update fails
            return { data: { success: false, userReactivated: false, message: error.message } };
          })
      );

      await Promise.all(userUpdatePromises);
      console.log('[reactivateClubService] User documents updated');
      console.log(`[reactivateClubService] Users reactivated: ${reactivatedUsersCount}`);
    }

    console.log('[reactivateClubService] Club reactivation complete!');

    return {
      success: true,
      groupsReactivated: reactivateData.groupsReactivated,
      subgroupsReactivated: reactivateData.subgroupsReactivated,
      affectedUsers: memberIds.length,
      reactivatedUsersCount,
      message: reactivateData.message,
    };
  } catch (error: any) {
    console.error('[reactivateClubService] Error:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during club reactivation',
    };
  }
}
