// services/group/createGroupService.ts

import {
    collection,
    doc,
    getDoc,
    getFirestore,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import { getCurrentUser } from "../auth/authService";
import { ClubAllMembersDocument } from "../types/club";
import { AllMembersDocument, GroupData } from "../types/group";

/**
 * Creates a new group inside a club.
 * NOTE: Group creators are NOT automatically added to the group's allMembers.
 * Only club admins can create groups.
 * If the creator wants to be a member, they must be explicitly added after creation.
 */
export const createGroup = async (
  clubId: string,
  groupName: string,
  sportType: string
) => {
  const user = getCurrentUser();
  if (!user) {
    return {
      success: false,
      error: { code: "auth/no-user", message: "You must be signed in to create a group." },
    };
  }

  const db = getFirestore();

  try {
    // First, get the club document to check if user is the creator
    const clubDoc = await getDoc(doc(db, "clubs", clubId));
    if (!clubDoc.exists()) {
      return {
        success: false,
        error: { code: "club/not-found", message: "Club not found." },
      };
    }

    const clubData = clubDoc.data();
    const isClubCreator = clubData.createdBy === user.uid;

    // Check if user is club admin (skip this check if user is the club creator - for immediate group creation after club creation)
    if (!isClubCreator) {
      const clubMembersDoc = await getDoc(doc(db, "clubs", clubId, "allMembers", "members"));
      if (!clubMembersDoc.exists()) {
        return {
          success: false,
          error: { code: "club/not-found", message: "Club members not found." },
        };
      }

      const clubMembersData = clubMembersDoc.data() as ClubAllMembersDocument;
      const userMembership = clubMembersData.members.find(m => m.userId === user.uid);
      
      if (!userMembership || !userMembership.roles.includes("club-admin")) {
        return {
          success: false,
          error: { code: "auth/insufficient-permissions", message: "Only club admins can create groups." },
        };
      }
    }

    // Generate a new group ID inside the club's groups subcollection
    const groupId = doc(collection(db, "clubs", clubId, "groups")).id;

    // Firestore server timestamp for createdAt
    const now = serverTimestamp();

    // Build the group data
    const groupData: GroupData = {
      id: groupId,
      name: groupName.trim(),
      sportType: sportType.trim(),
      createdBy: user.uid,
      createdAt: now,
      isActive: true,
      memberCount: 0, // Start with 0 members - creator is not auto-added
      maxCount: 30,
    };

    // Save the new group document
    await setDoc(doc(db, "clubs", clubId, "groups", groupId), groupData);

    // Create empty allMembers document for the group
    const allMembersDoc: AllMembersDocument = {
      members: [], // Empty - creator is not auto-added
      lastUpdated: now,
      memberCount: 0
    };

    // Add the empty allMembers document to the group
    await setDoc(doc(db, "clubs", clubId, "groups", groupId, "allMembers", "members"), allMembersDoc);

    return {
      success: true,
      groupId,
      message: "Group created successfully! You can now add members to the group.",
    };
  } catch (error: any) {
    console.error("Error creating group:", error);
    return {
      success: false,
      error: {
        code: error.code || "unknown",
        message: error.message || "Failed to create group. Please try again.",
      },
    };
  }
};
