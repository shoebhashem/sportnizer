// services/group/createGroupService.ts

import {
    arrayUnion,
    collection,
    doc,
    getFirestore,
    serverTimestamp,
    setDoc,
    Timestamp,
    updateDoc,
} from "firebase/firestore";
import { getCurrentUser } from "../auth/authService";
import { GroupData, GroupMembership } from "../types/group";

/**
 * Creates a new group inside a club and updates the user's group memberships.
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
    // Generate a new group ID inside the club's groups subcollection
    const groupId = doc(collection(db, "clubs", clubId, "groups")).id;

    // Firestore server timestamp for createdAt
    const now = serverTimestamp();

    // Build the group data
    const groupData: GroupData = {
      name: groupName.trim(),
      sportType: sportType.trim(),
      createdBy: user.uid,
      createdAt: now,
      participantsIds: [user.uid],
      isActive: true,
      memberCount: 1,
      maxCount: 30,
    };

    // Save the new group document
    await setDoc(doc(db, "clubs", clubId, "groups", groupId), groupData);

    // Build GroupMembership for the user document
    const membership: GroupMembership = {
      clubId,
      groupId,
      groupName: groupName.trim(),
      roles: ["admin"],
      joinedAt: Timestamp.now().toDate(),
      lastModifiedAt: Timestamp.now().toDate(),
    };

    // Update the user's groups array
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, {
      groups: arrayUnion(membership),
    });

    return {
      success: true,
      groupId,
      message: "Group created successfully and added to your profile!",
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
