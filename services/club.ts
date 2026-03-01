// /services/club.ts - Thin orchestration service for club operations
// Calls atomic Firebase Functions instead of direct Firestore operations

import type { DataCacheType } from "@/contexts/DataCacheContext";
import { httpsCallable } from "firebase/functions";
import { functions } from "./core/firebase";
import type {
    DeleteClubServiceResponse,
    ReactivateClubServiceResponse,
} from "./orchestration";
import { deleteClubService, reactivateClubService } from "./orchestration";
import type { ClubData } from "./types/club";

// Firebase Function references
const createClubFn = httpsCallable(functions, "createClub");
const updateClubFn = httpsCallable(functions, "updateClub");
const getClubFn = httpsCallable(functions, "getClub");

export const clubService = {
  /**
   * Create a new club
   */
  async createClub(
    clubData: Omit<ClubData, "id" | "createdAt" | "lastModifiedAt" | "version">,
  ): Promise<{ success: boolean; clubId?: string; error?: string }> {
    try {
      const result = await createClubFn(clubData);
      return result.data as {
        success: boolean;
        clubId?: string;
        error?: string;
      };
    } catch (error: any) {
      console.error("❌ Error creating club:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update an existing club
   */
  async updateClub(
    clubId: string,
    updates: Partial<ClubData>,
    cache?: import("@/contexts/DataCacheContext").DataCacheType,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await updateClubFn({ clubId, updates });
      // Invalidate club caches
      if (cache) {
        cache.remove(`clubMembers_${clubId}`);
        cache.remove(`clubData_${clubId}`);
        cache.remove(`clubGroups_${clubId}_true`);
        cache.remove(`clubGroups_${clubId}_false`);
      }
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error("❌ Error updating club:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Delete a club (soft delete with 30-day grace period)
   * Uses orchestration service to handle user document updates
   *
   * @param clubId - Club ID to delete
   * @param verificationToken - Optional JWT token from email verification (future implementation)
   */
  async deleteClub(
    clubId: string,
    verificationToken?: string,
    cache?: import("@/contexts/DataCacheContext").DataCacheType,
  ): Promise<DeleteClubServiceResponse> {
    const result = await deleteClubService(clubId, verificationToken);
    // Invalidate club caches
    if (cache) {
      cache.remove(`clubMembers_${clubId}`);
      cache.remove(`clubData_${clubId}`);
      cache.remove(`clubGroups_${clubId}_true`);
      cache.remove(`clubGroups_${clubId}_false`);
    }
    return result;
  },

  /**
   * Reactivate a soft-deleted club (within 30-day grace period)
   * Uses orchestration service to handle user document updates
   *
   * @param clubId - Club ID to reactivate
   * @param verificationToken - Optional JWT token from email verification (future implementation)
   */
  async reactivateClub(
    clubId: string,
    verificationToken?: string,
  ): Promise<ReactivateClubServiceResponse> {
    return reactivateClubService(clubId, verificationToken);
  },

  /**
   * Get club data
   */
  async getClub(
    clubId: string,
    cache?: DataCacheType,
  ): Promise<{ success: boolean; data?: ClubData; error?: string }> {
    const cacheKey = `clubData_${clubId}`;
    if (cache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        console.log(`🟢 [CACHE HIT] clubData for club ${clubId}`);
        return cached;
      } else {
        console.log(`🟡 [CACHE MISS] clubData for club ${clubId}`);
      }
    }
    try {
      const result = await getClubFn({ clubId });
      const dataResult = result.data as {
        success: boolean;
        data?: ClubData;
        error?: string;
      };
      console.log(`🔵 [FIRESTORE READ] Fetched club data for club ${clubId}`);
      if (cache) cache.set(cacheKey, dataResult);
      return dataResult;
    } catch (error: any) {
      console.error("❌ Error fetching club:", error);
      return { success: false, error: error.message };
    }
  },
};
