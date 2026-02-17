/**
 * Orchestration Service: Reactivate Group
 *
 * Coordinates group reactivation including:
 * - Validation of grace period (must be within 30 days)
 * - Reactivation of group and all subgroups
 * - User document updates for all affected members
 * - Guardian dependent sync for youth members
 * - Batch processing for efficiency
 *
 * This is a service layer function that orchestrates multiple atomic backend functions.
 * It does NOT directly access Firestore - all operations go through atomic functions.
 */

import { httpsCallable } from "firebase/functions";
import { functions } from "../core/firebase";

// Firebase Function references
const reactivateGroupFn = httpsCallable<
  { clubId: string; groupId: string },
  {
    success: boolean;
    subgroupsReactivated: number;
    message?: string;
    error?: string;
  }
>(functions, "reactivateGroup");

const getGroupMembersFn = httpsCallable<
  { clubId: string; groupId: string },
  { success: boolean; members: any[]; memberCount: number; error?: string }
>(functions, "getGroupMembers");

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

const updateGuardianDependentAccessFn = httpsCallable<
  { youthUid: string; guardianUid: string },
  { success: boolean; message?: string }
>(functions, "updateGuardianDependentAccess");

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
  groupId: string,
): Promise<ReactivateGroupServiceResponse> {
  try {
    console.log(
      `[reactivateGroupService] Starting reactivation of group ${groupId}`,
    );

    // Step 1: Call reactivateGroup function (validates grace period + cascades to subgroups)
    console.log("[reactivateGroupService] Calling reactivateGroup function...");
    const reactivateResult = await reactivateGroupFn({ clubId, groupId });
    const reactivateData = reactivateResult.data;

    if (!reactivateData.success) {
      return {
        success: false,
        error: reactivateData.error || "Failed to reactivate group",
      };
    }

    console.log(`[reactivateGroupService] Group reactivated successfully`);
    console.log(
      `[reactivateGroupService] Subgroups reactivated: ${reactivateData.subgroupsReactivated}`,
    );

    // Step 2: Get all members using backend function (bypasses security rules)
    console.log("[reactivateGroupService] Fetching all group members...");
    const membersResult = await getGroupMembersFn({ clubId, groupId });

    if (!membersResult.data.success) {
      console.warn(
        "[reactivateGroupService] Failed to fetch members, continuing anyway:",
        membersResult.data.error,
      );
    }

    const members = membersResult.data.members || [];
    const memberIds: string[] = members
      .map((m: any) => m.userId)
      .filter(Boolean);

    console.log(
      `[reactivateGroupService] Found ${memberIds.length} members to update`,
    );

    // Step 3: Update user documents in parallel (reactivate groupAccess entries)
    if (memberIds.length > 0) {
      console.log("[reactivateGroupService] Updating user documents...");
      const userUpdatePromises = memberIds.map((userId) =>
        updateUserGroupDeletionFn({
          userId,
          clubId,
          groupId,
          isActive: true,
        }).catch((error) => {
          console.error(
            `[reactivateGroupService] Failed to update user ${userId}:`,
            error,
          );
          return { data: { success: false, message: error.message } };
        }),
      );

      await Promise.all(userUpdatePromises);
      console.log("[reactivateGroupService] User documents updated");
    }

    // Step 4: Sync guardian dependents for youth members
    const youthMembers = members.filter(
      (m: any) => m.needsGuardian && m.guardiansContacts?.length > 0,
    );

    if (youthMembers.length > 0) {
      console.log(
        `[reactivateGroupService] Syncing ${youthMembers.length} youth members' guardian dependents...`,
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
                  `[reactivateGroupService] Failed to sync guardian ${guardian.guardianUid} for youth ${youth.userId}:`,
                  error,
                );
                return { data: { success: false } };
              }),
            );
          }
        }
      }

      await Promise.all(guardianSyncPromises);
      console.log("[reactivateGroupService] Guardian dependents synced");
    }

    console.log("[reactivateGroupService] Group reactivation complete!");

    return {
      success: true,
      subgroupsReactivated: reactivateData.subgroupsReactivated,
      affectedUsers: memberIds.length,
      message: reactivateData.message,
    };
  } catch (error: any) {
    console.error("[reactivateGroupService] Error:", error);
    return {
      success: false,
      error:
        error.message ||
        "An unexpected error occurred during group reactivation",
    };
  }
}
