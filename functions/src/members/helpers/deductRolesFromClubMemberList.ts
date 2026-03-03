import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Deducts roles from a member's club member list
 * Removes ONE instance of each specified role
 * Marks member as inactive if roles array becomes empty
 *
 * @param clubId - The club ID
 * @param userId - The user ID
 * @param rolesToDeduct - Array of roles to remove (one instance each)
 * @returns Result with inactivity status and remaining roles
 */
export async function deductRolesFromClubMemberList(params: {
  clubId: string;
  userId: string;
  rolesToDeduct: string[];
}): Promise<{
  success: boolean;
  isNowInactive: boolean;
  remainingRoles: string[];
  error?: string;
}> {
  const { clubId, userId, rolesToDeduct } = params;

  try {
    console.log(
      `💳 Deducting roles from club member list: user=${userId}, roles=[${rolesToDeduct.join(", ")}]`,
    );

    const db = admin.firestore();
    const clubMembersRef = db
      .collection("clubs")
      .doc(clubId)
      .collection("allMembers")
      .doc("members");

    const clubMembersDoc = await clubMembersRef.get();

    if (!clubMembersDoc.exists) {
      console.error(`❌ Club members document not found for club ${clubId}`);
      return {
        success: false,
        isNowInactive: false,
        remainingRoles: [],
        error: "Club members document not found",
      };
    }

    const clubMembersData = clubMembersDoc.data();
    const clubMembers = clubMembersData?.members || [];
    const clubMemberIndex = clubMembers.findIndex(
      (m: any) => m.userId === userId,
    );

    if (clubMemberIndex === -1) {
      console.warn(`⚠️ User ${userId} not found in club ${clubId} member list`);
      return {
        success: false,
        isNowInactive: false,
        remainingRoles: [],
        error: "User not found in club member list",
      };
    }

    let currentRoles = clubMembers[clubMemberIndex].roles || [];

    // Deduct each role (remove ONE instance per role)
    for (const role of rolesToDeduct) {
      const roleIndex = currentRoles.indexOf(role);
      if (roleIndex > -1) {
        // Remove one instance of this role
        currentRoles = [
          ...currentRoles.slice(0, roleIndex),
          ...currentRoles.slice(roleIndex + 1),
        ];
        console.log(`  ✅ Removed '${role}' from roles array`);
      } else {
        console.warn(`  ⚠️ Role '${role}' not found in user's roles`);
      }
    }

    // Update member data
    clubMembers[clubMemberIndex].roles = currentRoles;
    clubMembers[clubMemberIndex].lastModifiedAt = new Date();

    // Check if roles array is now empty → mark inactive
    const isNowInactive = currentRoles.length === 0;

    if (isNowInactive) {
      clubMembers[clubMemberIndex].isActive = false;
      clubMembers[clubMemberIndex].inactiveSince = new Date();
      clubMembers[clubMemberIndex].scheduledForDeletion = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ); // 30 days
      console.log(
        `  ⚠️ Member ${userId} has no roles left - marked as inactive`,
      );
    }

    // Update club members document
    await clubMembersRef.update({
      members: clubMembers,
      version: FieldValue.increment(1),
      lastModified: FieldValue.serverTimestamp(),
    });

    console.log(
      `✅ Successfully deducted roles. Remaining: [${currentRoles.join(", ")}], Inactive: ${isNowInactive}`,
    );

    return {
      success: true,
      isNowInactive,
      remainingRoles: currentRoles,
    };
  } catch (error) {
    console.error(`❌ Error deducting roles from club member list:`, error);
    return {
      success: false,
      isNowInactive: false,
      remainingRoles: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
