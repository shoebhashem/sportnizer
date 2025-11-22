// /services/versioning/groupDataService.ts

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../core/firebase';
import { GroupMembership } from '../types/user';
import { CACHE_KEYS, FetchResult } from '../types/versioning';
import {
    checkDocumentVersion,
    saveToCacheWithVersion
} from './versionCheckService';

/**
 * Fetch group data with version checking
 */
export async function fetchGroupDataWithVersioning(
  clubId: string,
  groupId: string
): Promise<FetchResult<any>> {
  try {
    console.log(`🏆 Fetching group data for: ${groupId} in club ${clubId}`);

    const documentPath = `clubs/${clubId}/groups/${groupId}`;
    const cacheKey = CACHE_KEYS.GROUP_DATA(groupId);

    // Check if we need to update
    const versionCheck = await checkDocumentVersion(documentPath, cacheKey);

    if (!versionCheck.needsUpdate && versionCheck.data) {
      console.log(`✅ Using cached group data for ${groupId}`);
      return {
        success: true,
        data: versionCheck.data,
        version: versionCheck.localVersion,
      };
    }

    // Fetch fresh data
    console.log(`🔄 Fetching fresh group data for ${groupId}`);
    const docRef = doc(db, documentPath);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return {
        success: false,
        error: `Group ${groupId} not found in club ${clubId}`,
      };
    }

    const groupData = docSnap.data();
    const version = groupData.version || 1;

    // Save to cache
    await saveToCacheWithVersion(cacheKey, groupData, version);

    return {
      success: true,
      data: groupData,
      version,
    };

  } catch (error) {
    console.error(`❌ Error fetching group data for ${groupId}:`, error);
    return {
      success: false,
      error: `Failed to fetch group data: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Fetch group members with version checking
 */
export async function fetchGroupMembersWithVersioning(
  clubId: string,
  groupId: string
): Promise<FetchResult<any>> {
  try {
    console.log(`👥 Fetching group members for: ${groupId} in club ${clubId}`);

    const documentPath = `clubs/${clubId}/groups/${groupId}/allMembers/members`;
    const cacheKey = CACHE_KEYS.GROUP_MEMBERS(groupId);

    // Check if we need to update
    const versionCheck = await checkDocumentVersion(documentPath, cacheKey);

    if (!versionCheck.needsUpdate && versionCheck.data) {
      console.log(`✅ Using cached group members for ${groupId}`);
      return {
        success: true,
        data: versionCheck.data,
        version: versionCheck.localVersion,
      };
    }

    // Fetch fresh data
    console.log(`🔄 Fetching fresh group members for ${groupId}`);
    const docRef = doc(db, documentPath);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return {
        success: false,
        error: `Group members document not found for group ${groupId}`,
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
    console.error(`❌ Error fetching group members for ${groupId}:`, error);
    return {
      success: false,
      error: `Failed to fetch group members: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Fetch user's group memberships with version checking
 */
export async function fetchUserGroupMembershipsWithVersioning(
  groups: GroupMembership[]
): Promise<FetchResult<GroupMembership[]>> {
  try {
    console.log(`🏆 Fetching updated data for ${groups.length} group memberships`);

    const updatedGroups: GroupMembership[] = [];

    // Check each group for updates
    for (const groupMembership of groups) {
      const groupDataResult = await fetchGroupDataWithVersioning(
        groupMembership.clubId, 
        groupMembership.groupId
      );
      
      if (groupDataResult.success && groupDataResult.data) {
        // Update group name if it has changed
        const updatedGroupship = {
          ...groupMembership,
          groupName: groupDataResult.data.name || groupMembership.groupName,
        };
        updatedGroups.push(updatedGroupship);
      } else {
        // Keep original if fetch failed
        updatedGroups.push(groupMembership);
      }
    }

    return {
      success: true,
      data: updatedGroups,
    };

  } catch (error) {
    console.error(`❌ Error fetching user group memberships:`, error);
    return {
      success: false,
      error: `Failed to fetch group memberships: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
