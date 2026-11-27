/**
 * Orchestration Service: Delete Club
 * 
 * Coordinates club deletion including:
 * - Soft delete with 30-day grace period
 * - Cascade deletion to all groups and subgroups
 * - Members' profiles (clubAccess) are updated by the deleteClub
 *   Cloud Function itself
 * 
 * This is a service layer function that orchestrates multiple atomic backend functions.
 * It does NOT directly access Firestore - all operations go through atomic functions.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../core/firebase';

// Firebase Function references
const deleteClubFn = httpsCallable<
  { clubId: string; verificationToken?: string },
  { 
    success: boolean; 
    deletionScheduledAt: number;
    gracePeriodDays: number;
    groupsAffected: number;
    error?: string;
  }
>(functions, 'deleteClub');

export interface DeleteClubServiceResponse {
  success: boolean;
  deletionScheduledAt?: number;
  gracePeriodDays?: number;
  groupsAffected?: number;
  affectedUsers?: number;
  inactiveUsersCount?: number;
  error?: string;
}

/**
 * Delete a club (soft delete with 30-day grace period)
 * 
 * @param clubId - Club ID to delete
 * @param verificationToken - Optional JWT token from email verification (future implementation)
 * @returns Deletion result with scheduled deletion time
 */
export async function deleteClubService(
  clubId: string,
  verificationToken?: string
): Promise<DeleteClubServiceResponse> {
  try {
    console.log(`[deleteClubService] Starting soft deletion of club ${clubId}`);

    // Step 1: Call deleteClub function (soft delete + cascade to all groups/subgroups)
    console.log('[deleteClubService] Calling deleteClub function...');
    const deleteResult = await deleteClubFn({ clubId, verificationToken });
    const deleteData = deleteResult.data;

    if (!deleteData.success) {
      return {
        success: false,
        error: deleteData.error || 'Failed to delete club',
      };
    }

    console.log(`[deleteClubService] Club marked for deletion. Scheduled: ${new Date(deleteData.deletionScheduledAt).toISOString()}`);
    console.log(`[deleteClubService] Groups affected: ${deleteData.groupsAffected}`);

    // Members' profiles are updated server-side by deleteClub.

    console.log('[deleteClubService] Club deletion complete!');

    return {
      success: true,
      deletionScheduledAt: deleteData.deletionScheduledAt,
      gracePeriodDays: deleteData.gracePeriodDays,
      groupsAffected: deleteData.groupsAffected,
    };
  } catch (error: any) {
    console.error('[deleteClubService] Error:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during club deletion',
    };
  }
}
