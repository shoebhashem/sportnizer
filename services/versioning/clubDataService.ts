// /services/versioning/clubDataService.ts

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../core/firebase';
import { ClubMembership } from '../types/user';
import { CACHE_KEYS, FetchResult } from '../types/versioning';
import {
    checkDocumentVersion,
    saveToCacheWithVersion
} from './versionCheckService';

/**
 * Fetch club data with version checking
 */
export async function fetchClubDataWithVersioning(
  clubId: string
): Promise<FetchResult<any>> {
  try {
    console.log(`🏢 Fetching club data for: ${clubId}`);

    const documentPath = `clubs/${clubId}`;
    const cacheKey = CACHE_KEYS.CLUB_DATA(clubId);

    // Check if we need to update
    const versionCheck = await checkDocumentVersion(documentPath, cacheKey);

    if (!versionCheck.needsUpdate && versionCheck.data) {
      console.log(`✅ Using cached club data for ${clubId}`);
      return {
        success: true,
        data: versionCheck.data,
        version: versionCheck.localVersion,
      };
    }

    // Fetch fresh data
    console.log(`🔄 Fetching fresh club data for ${clubId}`);
    const docRef = doc(db, documentPath);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return {
        success: false,
        error: `Club ${clubId} not found`,
      };
    }

    const clubData = docSnap.data();
    const version = clubData.version || 1;

    // Save to cache
    await saveToCacheWithVersion(cacheKey, clubData, version);

    return {
      success: true,
      data: clubData,
      version,
    };

  } catch (error) {
    console.error(`❌ Error fetching club data for ${clubId}:`, error);
    return {
      success: false,
      error: `Failed to fetch club data: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Fetch club members with version checking
 */
export async function fetchClubMembersWithVersioning(
  clubId: string
): Promise<FetchResult<any>> {
  try {
    console.log(`👥 Fetching club members for: ${clubId}`);

    const documentPath = `clubs/${clubId}/allMembers/members`;
    const cacheKey = CACHE_KEYS.CLUB_MEMBERS(clubId);

    // Check if we need to update
    const versionCheck = await checkDocumentVersion(documentPath, cacheKey);

    if (!versionCheck.needsUpdate && versionCheck.data) {
      console.log(`✅ Using cached club members for ${clubId}`);
      return {
        success: true,
        data: versionCheck.data,
        version: versionCheck.localVersion,
      };
    }

    // Fetch fresh data
    console.log(`🔄 Fetching fresh club members for ${clubId}`);
    const docRef = doc(db, documentPath);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return {
        success: false,
        error: `Club members document not found for club ${clubId}`,
      };
    }

    const membersData = docSnap.data();
    const version = membersData.version || 1;

    // Save to cache
    await saveToCacheWithVersion(cacheKey, membersData, version);

    return {
      success: true,
      data: membersData,
      version,
    };

  } catch (error) {
    console.error(`❌ Error fetching club members for ${clubId}:`, error);
    return {
      success: false,
      error: `Failed to fetch club members: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Fetch user's club memberships with version checking
 */
export async function fetchUserClubMembershipsWithVersioning(
  clubs: ClubMembership[]
): Promise<FetchResult<ClubMembership[]>> {
  try {
    console.log(`🏢 Fetching updated data for ${clubs.length} club memberships`);

    const updatedClubs: ClubMembership[] = [];

    // Check each club for updates
    for (const clubMembership of clubs) {
      const clubDataResult = await fetchClubDataWithVersioning(clubMembership.clubId);
      
      if (clubDataResult.success && clubDataResult.data) {
        // Update club name if it has changed
        const updatedClubship = {
          ...clubMembership,
          clubName: clubDataResult.data.name || clubMembership.clubName,
        };
        updatedClubs.push(updatedClubship);
      } else {
        // Keep original if fetch failed
        updatedClubs.push(clubMembership);
      }
    }

    return {
      success: true,
      data: updatedClubs,
    };

  } catch (error) {
    console.error(`❌ Error fetching user club memberships:`, error);
    return {
      success: false,
      error: `Failed to fetch club memberships: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
