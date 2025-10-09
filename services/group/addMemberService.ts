import {
    arrayUnion,
    doc,
    getDoc,
    getFirestore,
    increment,
    serverTimestamp,
    Timestamp,
    updateDoc,
} from "firebase/firestore";
import { ClubAllMembersDocument, ClubMemberData } from "../types/club";
import { AllMembersDocument, GroupMemberData } from "../types/group";
import { GroupMembership } from "../types/user";

/**
 * Adds a member to both group and club allMembers arrays
 * This ensures dual membership as required by the new design
 */
export const addMemberToGroup = async (
  clubId: string,
  groupId: string,
  memberData: {
    userId: string;
    roles: ("admin" | "coach" | "player" | "guardian")[];
    photoURL: string;
    name: string;
    email: string;
    needsGuardian: boolean;
    guardiansContacts: string[];
    belongtoSubGroups?: string[];
  },
  addedBy: string
) => {
  const db = getFirestore();

  try {
    const now = serverTimestamp();

    // Prepare group member data
    const groupMemberData: GroupMemberData = {
      userId: memberData.userId,
      roles: memberData.roles,
      joinedAt: Timestamp.now(), // Use Timestamp.now() instead of serverTimestamp() for arrays
      photoURL: memberData.photoURL,
      name: memberData.name,
      email: memberData.email,
      needsGuardian: memberData.needsGuardian,
      guardiansContacts: memberData.guardiansContacts,
      belongtoSubGroups: memberData.belongtoSubGroups || []
    };

    // Prepare club member data
    const clubMemberData: ClubMemberData = {
      userId: memberData.userId,
      roles: memberData.roles, // Same roles apply to club membership
      photoURL: memberData.photoURL,
      name: memberData.name,
      email: memberData.email,
      addedBy: addedBy,
      joinedAt: Timestamp.now(), // Use Timestamp.now() instead of serverTimestamp() for arrays
      lastModifiedAt: Timestamp.now(), // Use Timestamp.now() instead of serverTimestamp() for arrays
      needsGuardian: memberData.needsGuardian,
      guardiansContacts: memberData.guardiansContacts
    };

    // Get current group allMembers document
    const groupMembersDoc = await getDoc(doc(db, "clubs", clubId, "groups", groupId, "allMembers", "members"));
    if (!groupMembersDoc.exists()) {
      throw new Error("Group members document not found");
    }

    const groupMembersData = groupMembersDoc.data() as AllMembersDocument;
    
    // Check if user is already a member of the group
    const existingGroupMember = groupMembersData.members.find(m => m.userId === memberData.userId);
    if (existingGroupMember) {
      return {
        success: false,
        error: { code: "member/already-exists", message: "User is already a member of this group." }
      };
    }

    // Get current club allMembers document
    const clubMembersDoc = await getDoc(doc(db, "clubs", clubId, "allMembers", "members"));
    if (!clubMembersDoc.exists()) {
      throw new Error("Club members document not found");
    }

    const clubMembersData = clubMembersDoc.data() as ClubAllMembersDocument;
    
    // Check if user is already a member of the club
    const existingClubMember = clubMembersData.members.find(m => m.userId === memberData.userId);

    // Update group allMembers document
    await updateDoc(doc(db, "clubs", clubId, "groups", groupId, "allMembers", "members"), {
      members: [...groupMembersData.members, groupMemberData],
      lastUpdated: now,
      memberCount: increment(1)
    });

    // Update club allMembers document (only if not already a member)
    if (!existingClubMember) {
      await updateDoc(doc(db, "clubs", clubId, "allMembers", "members"), {
        members: [...clubMembersData.members, clubMemberData],
        lastUpdated: now,
        memberCount: increment(1)
      });
    }

    // Update group memberCount in the group document
    await updateDoc(doc(db, "clubs", clubId, "groups", groupId), {
      memberCount: increment(1)
    });

    // Update club totalCounts if user wasn't already a club member
    if (!existingClubMember) {
      await updateDoc(doc(db, "clubs", clubId), {
        totalCounts: increment(1)
      });
    }

    // Add group membership to user's profile
    const groupMembership: GroupMembership = {
      clubId,
      groupId,
      groupName: "", // TODO: Fetch group name or pass it as parameter
      roles: memberData.roles,
      joinedAt: new Date(),
      lastModifiedAt: new Date()
    };

    await updateDoc(doc(db, "users", memberData.userId), {
      groupsJoined: arrayUnion(groupMembership)
    });

    return {
      success: true,
      message: "Member added successfully to both group and club."
    };

  } catch (error: any) {
    console.error("Error adding member to group:", error);
    return {
      success: false,
      error: {
        code: error.code || "unknown",
        message: error.message || "Failed to add member. Please try again."
      }
    };
  }
};

/**
 * Helper function to add a club admin as a group member
 * This allows club admins to be explicitly added to groups if needed
 */
export const addClubAdminToGroup = async (
  clubId: string,
  groupId: string,
  adminUserId: string,
  roles: ("admin" | "coach" | "player")[] = ["admin"], // Default to admin role
  addedBy: string
) => {
  try {
    // Fetch admin's profile from users collection
    const db = getFirestore();
    const userDoc = await getDoc(doc(db, "users", adminUserId));
    
    if (!userDoc.exists()) {
      return {
        success: false,
        error: { code: "user/not-found", message: "User not found." }
      };
    }

    const userData = userDoc.data();
    
    // Verify user is actually a club admin
    const clubMembersDoc = await getDoc(doc(db, "clubs", clubId, "allMembers", "members"));
    if (!clubMembersDoc.exists()) {
      return {
        success: false,
        error: { code: "club/not-found", message: "Club not found." }
      };
    }

    const clubMembersData = clubMembersDoc.data() as ClubAllMembersDocument;
    const adminMembership = clubMembersData.members.find(m => m.userId === adminUserId);
    
    if (!adminMembership || !adminMembership.roles.includes("club-admin")) {
      return {
        success: false,
        error: { code: "auth/not-club-admin", message: "User is not a club admin." }
      };
    }

    // Add the club admin to the group
    return await addMemberToGroup(
      clubId,
      groupId,
      {
        userId: adminUserId,
        roles: roles,
        photoURL: userData.photoURL || adminMembership.photoURL || "",
        name: userData.displayName || userData.name || adminMembership.name || "Admin",
        email: userData.email || adminMembership.email || "",
        needsGuardian: false, // Admins don't need guardians
        guardiansContacts: [],
        belongtoSubGroups: []
      },
      addedBy
    );

  } catch (error: any) {
    console.error("Error adding club admin to group:", error);
    return {
      success: false,
      error: {
        code: error.code || "unknown",
        message: error.message || "Failed to add club admin to group."
      }
    };
  }
};
