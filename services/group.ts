// /services/group.ts - Thin orchestration service for group operations
// Calls atomic Firebase Functions instead of direct Firestore operations

import type { DataCacheType } from "@/contexts/DataCacheContext";
import { httpsCallable } from "firebase/functions";
import { functions } from "./core/firebase";
import type {
    DeleteGroupServiceResponse,
    ReactivateGroupServiceResponse,
} from "./orchestration";
import { deleteGroupService, reactivateGroupService } from "./orchestration";
import type { GroupData } from "./types/group";
import { getUserProfile } from "./userProfile";

// Firebase Function references
const createGroupFn = httpsCallable(functions, "createGroup");
const updateGroupFn = httpsCallable(functions, "updateGroup");
const getGroupFn = httpsCallable(functions, "getGroup");

export const groupService = {
  /**
   * Create a new group within a club
   */
  async createGroup(
    clubId: string,
    groupName: string,
    groupData: Omit<
      GroupData,
      "id" | "createdAt" | "lastModifiedAt" | "version"
    >,
  ): Promise<{ success: boolean; groupId?: string; error?: string }> {
    try {
      const result = await createGroupFn({ clubId, groupName, groupData });
      return result.data as {
        success: boolean;
        groupId?: string;
        error?: string;
      };
    } catch (error: any) {
      console.error("❌ Error creating group:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update an existing group
   */
  async updateGroup(
    clubId: string,
    groupId: string,
    updates: Partial<GroupData>,
    cache?: import("@/contexts/DataCacheContext").DataCacheType,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await updateGroupFn({ clubId, groupId, updates });
      // Invalidate group caches
      if (cache) {
        cache.remove(`groupMembers_${clubId}_${groupId}`);
        cache.remove(`groupData_${clubId}_${groupId}`);
      }
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error("❌ Error updating group:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Delete a group (soft delete with 30-day grace period)
   * Uses orchestration service to handle user document updates
   */
  async deleteGroup(
    clubId: string,
    groupId: string,
    cache?: import("@/contexts/DataCacheContext").DataCacheType,
  ): Promise<DeleteGroupServiceResponse> {
    const result = await deleteGroupService(clubId, groupId);
    // Invalidate group caches
    if (cache) {
      cache.remove(`groupMembers_${clubId}_${groupId}`);
      cache.remove(`groupData_${clubId}_${groupId}`);
      cache.remove(`clubGroups_${clubId}_true`);
      cache.remove(`clubGroups_${clubId}_false`);
    }
    return result;
  },

  /**
   * Reactivate a soft-deleted group (within 30-day grace period)
   * Uses orchestration service to handle user document updates
   */
  async reactivateGroup(
    clubId: string,
    groupId: string,
  ): Promise<ReactivateGroupServiceResponse> {
    return reactivateGroupService(clubId, groupId);
  },

  /**
   * Get group data
   */
  async getGroup(
    clubId: string,
    groupId: string,
    cache?: DataCacheType,
  ): Promise<{ success: boolean; data?: GroupData; error?: string }> {
    const cacheKey = `groupData_${clubId}_${groupId}`;
    if (cache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        console.log(`🟢 [CACHE HIT] groupData for group ${groupId}`);
        return cached;
      } else {
        console.log(`🟡 [CACHE MISS] groupData for group ${groupId}`);
      }
    }
    try {
      const result = await getGroupFn({ clubId, groupId });
      const dataResult = result.data as {
        success: boolean;
        data?: GroupData;
        error?: string;
      };
      console.log(
        `🔵 [FIRESTORE READ] Fetched group data for group ${groupId}`,
      );
      if (cache) cache.set(cacheKey, dataResult);
      return dataResult;
    } catch (error: any) {
      console.error("❌ Error fetching group:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Fetch accessible groups for a user based on their clubAccess
   */
  async fetchAccessibleGroups(
    userProfile: any,
  ): Promise<{ success: boolean; groups: any[]; error?: string }> {
    try {
      if (!userProfile?.clubAccess) {
        return { success: true, groups: [] };
      }

      const accessibleGroups: any[] = [];

      // Extract groups from user's clubAccess array
      for (const clubAccess of userProfile.clubAccess) {
        if (clubAccess.groupAccess) {
          for (const groupAccess of clubAccess.groupAccess) {
            accessibleGroups.push({
              id: groupAccess.groupId,
              name: groupAccess.groupName,
              clubId: clubAccess.clubId,
              clubName: clubAccess.clubName,
              userRoles: groupAccess.roles || [],
              accessReason:
                clubAccess.role === "club-admin" ? "club-admin" : "member",
              memberCount: 0, // TODO: Get from group document if needed
              subGroups: groupAccess.subGroups || [],
            });
          }
        }
      }

      return { success: true, groups: accessibleGroups };
    } catch (error: any) {
      console.error("❌ Error fetching accessible groups:", error);
      return { success: false, groups: [], error: error.message };
    }
  },

  /**
   * Check if user can manage a group
   */
  canUserManageGroup(
    groupData: any,
    userId: string,
    userRoles: string[],
  ): boolean {
    if (!groupData || !userId) return false;

    // Check if user is the creator
    if (groupData.createdBy === userId) return true;

    // Check if user has admin or coach role
    return userRoles.includes("admin") || userRoles.includes("coach");
  },

  /**
   * Fetch subgroups for a group
   */
  /**
   * @deprecated Use subgroupService.fetchSubgroups() instead
   * This method is kept for backward compatibility but returns empty array
   */
  async fetchSubGroups(clubId: string, groupId: string): Promise<any[]> {
    console.warn(
      "⚠️ groupService.fetchSubGroups is deprecated. Use subgroupService.fetchSubgroups() instead",
    );
    return [];
  },

  /**
   * Fetch all groups for a user including their children's groups
   * This is used for guardians to see both their own groups and their dependents' groups
   */
  async fetchAllUserGroups(userProfile: any): Promise<{
    success: boolean;
    ownGroups: any[];
    childrenGroups: any[];
    allGroups: any[];
    error?: string;
  }> {
    try {
      if (!userProfile) {
        return {
          success: false,
          ownGroups: [],
          childrenGroups: [],
          allGroups: [],
          error: "No user profile provided",
        };
      }

      // 1. Get guardian's own groups
      const ownGroups: any[] = [];
      if (userProfile.clubAccess) {
        for (const clubAccess of userProfile.clubAccess) {
          if (clubAccess.groupAccess) {
            for (const groupAccess of clubAccess.groupAccess) {
              ownGroups.push({
                id: groupAccess.groupId,
                name: groupAccess.groupName,
                clubId: clubAccess.clubId,
                clubName: clubAccess.clubName,
                userRoles: groupAccess.roles || [],
                memberType: "self" as const,
                accessReason:
                  clubAccess.role === "club-admin" ? "club-admin" : "member",
                subGroups: groupAccess.subGroups || [],
              });
            }
          }
        }
      }

      // 2. Get children's groups
      const childrenGroups: any[] = [];
      if (userProfile.dependents && userProfile.dependents.length > 0) {
        for (const dependent of userProfile.dependents) {
          try {
            const childProfile = await getUserProfile(dependent.dependentUid);

            if (childProfile.success && childProfile.userProfile?.clubAccess) {
              for (const clubAccess of childProfile.userProfile.clubAccess) {
                if (clubAccess.groupAccess) {
                  for (const groupAccess of clubAccess.groupAccess) {
                    childrenGroups.push({
                      id: groupAccess.groupId,
                      name: groupAccess.groupName,
                      clubId: clubAccess.clubId,
                      clubName: clubAccess.clubName,
                      userRoles: groupAccess.roles || [],
                      memberType: "dependent" as const,
                      dependentName: dependent.dependentName,
                      dependentUid: dependent.dependentUid,
                      accessReason: "guardian",
                      subGroups: groupAccess.subGroups || [],
                    });
                  }
                }
              }
            }
          } catch (error) {
            console.error(
              `Error fetching profile for dependent ${dependent.dependentUid}:`,
              error,
            );
            // Continue with other dependents even if one fails
          }
        }
      }

      const allGroups = [...ownGroups, ...childrenGroups];

      return {
        success: true,
        ownGroups,
        childrenGroups,
        allGroups,
      };
    } catch (error: any) {
      console.error("❌ Error fetching all user groups:", error);
      return {
        success: false,
        ownGroups: [],
        childrenGroups: [],
        allGroups: [],
        error: error.message,
      };
    }
  },
};
