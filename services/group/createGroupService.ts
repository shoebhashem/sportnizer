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
import { GroupData, GroupMemberData, GroupMembership } from "../types/group";

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

    // Build the group data (without participantsIds - using subcollection instead)
    const groupData: GroupData = {
      id: groupId, // Add the ID to match new interface
      name: groupName.trim(),
      sportType: sportType.trim(),
      createdBy: user.uid,
      createdAt: now,
      // participantsIds: [user.uid], // Removed - using allMembers subcollection instead
      isActive: true,
      memberCount: 1,
      maxCount: 30,
    };

    // Save the new group document
    await setDoc(doc(db, "clubs", clubId, "groups", groupId), groupData);

    // Add the creator to the allMembers subcollection
    const memberData: GroupMemberData = {
      userId: user.uid,
      roles: ["admin"], // Creator is an admin
      joinedAt: now,
      profilePictureUrl: user.photoURL || "",
      name: user.displayName || user.email?.split('@')[0] || "User",
      email: user.email || "",
      needsGuardian: false, // Creator is assumed to be adult
      belongtoSubGroups: []
    };

    // Add the creator to the allMembers subcollection
    await setDoc(doc(db, "clubs", clubId, "groups", groupId, "allMembers", user.uid), memberData);

    // Build GroupMembership for the user document
    const membership: GroupMembership = {
      clubId,
      groupId,
      groupName: groupName.trim(),
      roles: ["admin"],
      joinedAt: Timestamp.now().toDate(),
      lastModifiedAt: Timestamp.now().toDate(),
    };

    // Update the user's groupsJoined array (not groups)
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, {
      groupsJoined: arrayUnion(membership),
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
