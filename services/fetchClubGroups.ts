// /services/fetchClubGroups.ts - Fetch all groups for a club
// Direct Firestore read operation (read-only, no security concerns)

import type { DataCacheType } from "@/contexts/DataCacheContext";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./core/firebase";

export interface ClubGroupData {
  id: string;
  name: string;
  description?: string;
  sport?: string;
  membersCount: number;
  createdBy: string;
  createdAt: any;
  isActive: boolean;
  deletionScheduledAt?: any;
}

export interface ClubGroupsResponse {
  success: boolean;
  groups: ClubGroupData[];
  error?: string;
}

/**
 * Fetch all groups within a club
 * Direct Firestore query since this is a read-only operation
 *
 * @param clubId - The club ID
 * @param includeDeleted - Whether to include soft-deleted groups (default: false)
 */
export const fetchClubGroups = async (
  clubId: string,
  includeDeleted: boolean = false,
  cache?: DataCacheType,
): Promise<ClubGroupsResponse> => {
  const cacheKey = `clubGroups_${clubId}_${includeDeleted}`;
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(
        `🟢 [CACHE HIT] clubGroups for club ${clubId} (includeDeleted: ${includeDeleted})`,
      );
      return cached;
    } else {
      console.log(
        `🟡 [CACHE MISS] clubGroups for club ${clubId} (includeDeleted: ${includeDeleted})`,
      );
    }
  }
  try {
    console.log(
      `📂 Fetching groups for club ${clubId} (includeDeleted: ${includeDeleted})...`,
    );
    // Query all groups in the club subcollection
    const groupsRef = collection(db, "clubs", clubId, "groups");
    // Only filter out inactive groups if includeDeleted is false
    const q = includeDeleted
      ? query(groupsRef)
      : query(groupsRef, where("isActive", "!=", false));
    const querySnapshot = await getDocs(q);
    const groups: ClubGroupData[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      groups.push({
        id: doc.id,
        name: data.name || "",
        description: data.description || "",
        sport: data.sport || "",
        membersCount: data.membersCount || 0,
        createdBy: data.createdBy || "",
        createdAt: data.createdAt,
        isActive: data.isActive !== false,
        deletionScheduledAt: data.deletionScheduledAt,
      });
    });
    console.log(
      `🔵 [FIRESTORE READ] Fetched ${groups.length} groups for club ${clubId}`,
    );
    const result = { success: true, groups };
    if (cache) cache.set(cacheKey, result);
    console.log(`✅ Fetched ${groups.length} groups for club ${clubId}`);
    return result;
  } catch (error: any) {
    console.error("❌ Error fetching club groups:", error);
    return {
      success: false,
      groups: [],
      error: error.message || "Failed to fetch club groups",
    };
  }
};

/**
 * Get group count for a club
 */
export const getClubGroupCount = async (clubId: string): Promise<number> => {
  const result = await fetchClubGroups(clubId);
  return result.success ? result.groups.length : 0;
};
