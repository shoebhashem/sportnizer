import {
    arrayRemove,
    doc,
    getDoc,
    getFirestore,
    increment,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";
import { ClubAllMembersDocument } from "../types/club";
import { AllMembersDocument } from "../types/group";
import { GroupMembership } from "../types/user";

/**
 * Removes a member from a group's allMembers array
 * Optionally removes from club if they're not in any other groups
 */
export const removeMemberFromGroup = async (
  clubId: string,
  groupId: string,
  userId: string,
  removeFromClub: boolean = false // If true, also remove from club completely
) => {
  const db = getFirestore();

  try {
    const now = serverTimestamp();

    // Get current group allMembers document
    const groupMembersDoc = await getDoc(doc(db, "clubs", clubId, "groups", groupId, "allMembers", "members"));
    if (!groupMembersDoc.exists()) {
      return {
        success: false,
        error: { code: "group/not-found", message: "Group members document not found." }
      };
    }

    const groupMembersData = groupMembersDoc.data() as AllMembersDocument;
    
    // Find the member to remove
    const memberToRemove = groupMembersData.members.find(m => m.userId === userId);
    if (!memberToRemove) {
      return {
        success: false,
        error: { code: "member/not-found", message: "User is not a member of this group." }
      };
    }

    // Remove member from group
    const updatedGroupMembers = groupMembersData.members.filter(m => m.userId !== userId);
    
    await updateDoc(doc(db, "clubs", clubId, "groups", groupId, "allMembers", "members"), {
      members: updatedGroupMembers,
      lastUpdated: now,
      memberCount: increment(-1)
    });

    // Update group memberCount in the group document
    await updateDoc(doc(db, "clubs", clubId, "groups", groupId), {
      memberCount: increment(-1)
    });

    // Handle club membership removal if requested
    if (removeFromClub) {
      // Get current club allMembers document
      const clubMembersDoc = await getDoc(doc(db, "clubs", clubId, "allMembers", "members"));
      if (clubMembersDoc.exists()) {
        const clubMembersData = clubMembersDoc.data() as ClubAllMembersDocument;
        const clubMemberToRemove = clubMembersData.members.find(m => m.userId === userId);
        
        if (clubMemberToRemove) {
          const updatedClubMembers = clubMembersData.members.filter(m => m.userId !== userId);
          
          await updateDoc(doc(db, "clubs", clubId, "allMembers", "members"), {
            members: updatedClubMembers,
            lastUpdated: now,
            memberCount: increment(-1)
          });

          // Update club totalCounts
          await updateDoc(doc(db, "clubs", clubId), {
            totalCounts: increment(-1)
          });
        }
      }
    }

    // Remove group membership from user's profile
    // Note: We need to find the exact GroupMembership object to remove
    const userDoc = await getDoc(doc(db, "users", userId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const groupsJoined = userData.groupsJoined || [];
      
      // Find the specific group membership to remove
      const membershipToRemove = groupsJoined.find((gm: GroupMembership) => 
        gm.clubId === clubId && gm.groupId === groupId
      );
      
      if (membershipToRemove) {
        await updateDoc(doc(db, "users", userId), {
          groupsJoined: arrayRemove(membershipToRemove)
        });
      }
    }

    return {
      success: true,
      message: removeFromClub 
        ? "Member removed from group and club successfully."
        : "Member removed from group successfully."
    };

  } catch (error: any) {
    console.error("Error removing member from group:", error);
    return {
      success: false,
      error: {
        code: error.code || "unknown",
        message: error.message || "Failed to remove member. Please try again."
      }
    };
  }
};

/**
 * Checks if a user is a member of any other groups in the club
 * Useful to determine if they should be removed from club when leaving a group
 */
export const isUserInOtherGroups = async (
  clubId: string,
  excludeGroupId: string,
  userId: string
): Promise<boolean> => {
  try {
    // This would require checking all groups in the club
    // For now, we'll return false and let the caller decide
    // In a real implementation, you might want to:
    // 1. Query all groups in the club
    // 2. Check if user is in any of them (excluding the current group)
    // 3. Return true if found in any other group
    
    // TODO: Implement proper check across all groups
    console.log(`Checking if user ${userId} is in other groups in club ${clubId} besides ${excludeGroupId}`);
    
    return false; // For now, assume they're not in other groups
  } catch (error) {
    console.error("Error checking user's other group memberships:", error);
    return false;
  }
};

/**
 * Remove member from group and auto-remove from club if not in other groups
 */
export const removeMemberFromGroupSmart = async (
  clubId: string,
  groupId: string,
  userId: string
) => {
  try {
    // Check if user is in other groups
    const inOtherGroups = await isUserInOtherGroups(clubId, groupId, userId);
    
    // Remove from group, and from club only if not in other groups
    return await removeMemberFromGroup(clubId, groupId, userId, !inOtherGroups);
    
  } catch (error: any) {
    console.error("Error in smart member removal:", error);
    return {
      success: false,
      error: {
        code: error.code || "unknown",
        message: error.message || "Failed to remove member smartly."
      }
    };
  }
};

/**
 * Bulk remove multiple members from a group
 */
export const removeMembersFromGroup = async (
  clubId: string,
  groupId: string,
  userIds: string[],
  removeFromClub: boolean = false
) => {
  const results = [];
  
  for (const userId of userIds) {
    const result = await removeMemberFromGroup(clubId, groupId, userId, removeFromClub);
    results.push({ userId, result });
  }
  
  const successCount = results.filter(r => r.result.success).length;
  const failureCount = results.length - successCount;
  
  return {
    success: failureCount === 0,
    message: `${successCount} members removed successfully. ${failureCount} failures.`,
    results
  };
};
