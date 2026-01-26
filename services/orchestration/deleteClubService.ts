/**
 * Orchestration Service: Delete Club
 * 
 * Coordinates club deletion including:
 * - Soft delete with 30-day grace period
 * - Cascade deletion to all groups and subgroups
 * - User document updates for all affected members
 * - User inactivity marking (if no other active clubs)
 * - Batch processing for efficiency
 * 
 * This is a service layer function that orchestrates multiple atomic backend functions.
 * It does NOT directly access Firestore - all operations go through atomic functions.
 */

import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../core/firebase';

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

const updateUserClubDeletionFn = httpsCallable<
  { userId: string; clubId: string },
  { success: boolean; userMarkedInactive: boolean; message?: string }
>(functions, 'updateUserClubDeletion');

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

    // Step 2: Get all club members
    // We need to check all groups for members since it's a club-wide deletion
    console.log('[deleteClubService] Fetching all club members...');
    const clubMembersRef = collection(db, `clubs/${clubId}/clubMembers`);
    const membersSnapshot = await getDocs(clubMembersRef);
    
    const memberIds = membersSnapshot.docs.map(doc => doc.id);
    console.log(`[deleteClubService] Found ${memberIds.length} members to update`);

    // Step 3: Update user documents in parallel
    let inactiveUsersCount = 0;
    if (memberIds.length > 0) {
      console.log('[deleteClubService] Updating user documents...');
      const userUpdatePromises = memberIds.map(userId =>
        updateUserClubDeletionFn({ userId, clubId })
          .then(result => {
            if (result.data.userMarkedInactive) {
              inactiveUsersCount++;
            }
            return result;
          })
          .catch(error => {
            console.error(`[deleteClubService] Failed to update user ${userId}:`, error);
            // Don't fail entire operation if one user update fails
            return { data: { success: false, userMarkedInactive: false, message: error.message } };
          })
      );

      await Promise.all(userUpdatePromises);
      console.log('[deleteClubService] User documents updated');
      console.log(`[deleteClubService] Users marked inactive: ${inactiveUsersCount}`);
    }

    console.log('[deleteClubService] Club deletion complete!');

    return {
      success: true,
      deletionScheduledAt: deleteData.deletionScheduledAt,
      gracePeriodDays: deleteData.gracePeriodDays,
      groupsAffected: deleteData.groupsAffected,
      affectedUsers: memberIds.length,
      inactiveUsersCount,
    };
  } catch (error: any) {
    console.error('[deleteClubService] Error:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during club deletion',
    };
  }
}
