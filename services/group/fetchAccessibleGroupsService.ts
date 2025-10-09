// services/group/fetchAccessibleGroupsService.ts

import {
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
} from "firebase/firestore";
import { getCurrentUser } from "../auth/authService";
import { GroupData } from "../types/group";

/**
 * Extended group data with club information for display
 */
export interface AccessibleGroupData extends GroupData {
  clubId: string;
  clubName: string;
  userRoles: string[]; // User's roles in this group (empty if not a member)
  accessReason: "member" | "club-admin"; // Why user can access this group
}

/**
 * Fetches all groups that a user can access:
 * 1. Groups where user is a member (from user's groupsJoined)
 * 2. All groups in clubs where user is a club-admin
 */
export const fetchAccessibleGroups = async (
  userProfile: any // UserProfile type
): Promise<{
  success: boolean;
  groups: AccessibleGroupData[];
  error?: { code: string; message: string };
}> => {
  const user = getCurrentUser();
  if (!user || !userProfile) {
    return {
      success: false,
      groups: [],
      error: { code: "auth/no-user", message: "User not authenticated" },
    };
  }

  const db = getFirestore();

  try {
    const accessibleGroups: AccessibleGroupData[] = [];
    const processedGroupIds = new Set<string>(); // Avoid duplicates

    // 1. Add groups where user is a member (from userProfile.groupsJoined)
    for (const membership of userProfile.groupsJoined || []) {
      try {
        const groupDoc = await getDoc(
          doc(db, "clubs", membership.clubId, "groups", membership.groupId)
        );
        
        if (groupDoc.exists()) {
          const groupData = { id: groupDoc.id, ...groupDoc.data() } as GroupData;
          
          // Get club name
          const clubDoc = await getDoc(doc(db, "clubs", membership.clubId));
          const clubName = clubDoc.exists() ? clubDoc.data().name : "Unknown Club";

          accessibleGroups.push({
            ...groupData,
            clubId: membership.clubId,
            clubName,
            userRoles: membership.roles,
            accessReason: "member",
          });

          processedGroupIds.add(membership.groupId);
        }
      } catch (error) {
        console.warn(`Failed to fetch group ${membership.groupId}:`, error);
      }
    }

    // 2. Add all groups from clubs where user is admin (if not already added)
    const adminClubs = userProfile.clubs?.filter((club: any) => club.isAdmin) || [];
    
    for (const adminClub of adminClubs) {
      try {
        // Fetch all groups in this club
        const groupsSnapshot = await getDocs(
          collection(db, "clubs", adminClub.clubId, "groups")
        );

        for (const groupDoc of groupsSnapshot.docs) {
          const groupId = groupDoc.id;
          
          // Skip if already processed (user is also a member)
          if (processedGroupIds.has(groupId)) {
            continue;
          }

          const groupData = { id: groupId, ...groupDoc.data() } as GroupData;

          accessibleGroups.push({
            ...groupData,
            clubId: adminClub.clubId,
            clubName: adminClub.clubName,
            userRoles: [], // No specific roles since access is via club-admin
            accessReason: "club-admin",
          });

          processedGroupIds.add(groupId);
        }
      } catch (error) {
        console.warn(`Failed to fetch groups for club ${adminClub.clubId}:`, error);
      }
    }

    return {
      success: true,
      groups: accessibleGroups,
    };
  } catch (error: any) {
    console.error("Error fetching accessible groups:", error);
    return {
      success: false,
      groups: [],
      error: {
        code: error.code || "unknown",
        message: error.message || "Failed to fetch groups",
      },
    };
  }
};
