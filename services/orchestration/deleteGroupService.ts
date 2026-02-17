/**
 * Orchestration Service: Delete Group
 *
 * Coordinates group deletion including:
 * - Soft delete with 30-day grace period
 * - Cascade deletion to all subgroups
 * - User document updates for all affected members
 * - Batch processing for efficiency
 *
 * This is a service layer function that orchestrates multiple atomic backend functions.
 * It does NOT directly access Firestore - all operations go through atomic functions.
 */

import { httpsCallable } from "firebase/functions";
import { functions } from "../core/firebase";

// Firebase Function references
const deleteGroupFn = httpsCallable<
  { clubId: string; groupId: string },
  {
    success: boolean;
    deletionScheduledAt: number;
    gracePeriodDays: number;
    subgroupsAffected: number;
    error?: string;
  }
>(functions, "deleteGroup");

const updateUserGroupDeletionFn = httpsCallable<
  {
    userId: string;
    clubId: string;
    groupId: string;
    isActive: boolean;
    deletionScheduledAt?: number;
  },
  { success: boolean; error?: string }
>(functions, "updateUserGroupDeletion");

const getGroupMembersFn = httpsCallable<
  { clubId: string; groupId: string },
  { success: boolean; members: any[]; memberCount: number; error?: string }
>(functions, "getGroupMembers");

const updateGuardianDependentAccessFn = httpsCallable<
  { youthUid: string; guardianUid: string },
  { success: boolean; message?: string }
>(functions, "updateGuardianDependentAccess");

export interface DeleteGroupServiceResponse {
  success: boolean;
  deletionScheduledAt?: number;
  gracePeriodDays?: number;
  subgroupsAffected?: number;
  affectedUsers?: number;
  error?: string;
}

/**
 * Delete a group (soft delete with 30-day grace period)
 *
 * @param clubId - Club ID containing the group
 * @param groupId - Group ID to delete
 * @returns Deletion result with scheduled deletion time
 */
export async function deleteGroupService(
  clubId: string,
  groupId: string,
): Promise<DeleteGroupServiceResponse> {
  try {
    console.log(
      `[deleteGroupService] Starting soft deletion of group ${groupId}`,
    );

    // Step 1: Call deleteGroup function (soft delete + cascade to subgroups)
    console.log("[deleteGroupService] Calling deleteGroup function...");
    const deleteResult = await deleteGroupFn({ clubId, groupId });
    const deleteData = deleteResult.data;

    if (!deleteData.success) {
      return {
        success: false,
        error: deleteData.error || "Failed to delete group",
      };
    }

    console.log(
      `[deleteGroupService] Group marked for deletion. Scheduled: ${new Date(deleteData.deletionScheduledAt).toISOString()}`,
    );
    console.log(
      `[deleteGroupService] Subgroups affected: ${deleteData.subgroupsAffected}`,
    );

    // Step 2: Get all members using backend function (bypasses security rules)
    console.log("[deleteGroupService] Fetching all group members...");
    const membersResult = await getGroupMembersFn({ clubId, groupId });

    if (!membersResult.data.success) {
      console.warn(
        "[deleteGroupService] Failed to fetch members, continuing anyway:",
        membersResult.data.error,
      );
    }

    const members = membersResult.data.members || [];
    const memberIds: string[] = members
      .map((m: any) => m.userId)
      .filter(Boolean);

    console.log(
      `[deleteGroupService] Found ${memberIds.length} members to update`,
    );

    // Step 3: Update user documents in parallel
    if (memberIds.length > 0) {
      console.log("[deleteGroupService] Updating user documents...");
      const userUpdatePromises = memberIds.map((userId) =>
        updateUserGroupDeletionFn({
          userId,
          clubId,
          groupId,
          isActive: false,
          deletionScheduledAt: deleteData.deletionScheduledAt,
        }).catch((error) => {
          console.error(
            `[deleteGroupService] Failed to update user ${userId}:`,
            error,
          );
          // Don't fail entire operation if one user update fails
          return { data: { success: false, message: error.message } };
        }),
      );

      await Promise.all(userUpdatePromises);
      console.log("[deleteGroupService] User documents updated");
    }

    // Step 4: Sync guardian dependents for youth members
    const youthMembers = members.filter(
      (m: any) => m.needsGuardian && m.guardiansContacts?.length > 0,
    );

    if (youthMembers.length > 0) {
      console.log(
        `[deleteGroupService] Syncing ${youthMembers.length} youth members' guardian dependents...`,
      );
      const guardianSyncPromises: Promise<any>[] = [];

      for (const youth of youthMembers) {
        for (const guardian of youth.guardiansContacts) {
          if (guardian.guardianUid) {
            guardianSyncPromises.push(
              updateGuardianDependentAccessFn({
                youthUid: youth.userId,
                guardianUid: guardian.guardianUid,
              }).catch((error) => {
                console.error(
                  `[deleteGroupService] Failed to sync guardian ${guardian.guardianUid} for youth ${youth.userId}:`,
                  error,
                );
                return { data: { success: false } };
              }),
            );
          }
        }
      }

      await Promise.all(guardianSyncPromises);
      console.log("[deleteGroupService] Guardian dependents synced");
    }

    console.log("[deleteGroupService] Group deletion complete!");

    return {
      success: true,
      deletionScheduledAt: deleteData.deletionScheduledAt,
      gracePeriodDays: deleteData.gracePeriodDays,
      subgroupsAffected: deleteData.subgroupsAffected,
      affectedUsers: memberIds.length,
    };
  } catch (error: any) {
    console.error("[deleteGroupService] Error:", error);
    return {
      success: false,
      error:
        error.message || "An unexpected error occurred during group deletion",
    };
  }
}
