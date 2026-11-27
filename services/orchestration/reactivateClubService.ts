/**
 * Orchestration Service: Reactivate Club
 * 
 * Coordinates club reactivation including:
 * - Validation of grace period (must be within 30 days)
 * - Verification token validation (TODO: when support system ready)
 * - Reactivation of club, all groups, and all subgroups
 * - Members' profiles (clubAccess) are restored by the reactivateClub
 *   Cloud Function itself
 * 
 * This is a service layer function that orchestrates multiple atomic backend functions.
 * It does NOT directly access Firestore - all operations go through atomic functions.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../core/firebase';

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

    // Members' profiles are restored server-side by reactivateClub.

    console.log('[reactivateClubService] Club reactivation complete!');

    return {
      success: true,
      groupsReactivated: reactivateData.groupsReactivated,
      subgroupsReactivated: reactivateData.subgroupsReactivated,
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
