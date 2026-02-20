/**
 * MEMBER INVITATION VALIDATION SERVICE
 * ===================================
 *
 * PURPOSE:
 * Centralized service that validates whether a member can be invited to a group.
 * Provides real-time validation with immediate feedback during form entry.
 *
 * USAGE:
 * Called onBlur from email input fields in:
 * - add-child-member.tsx (youth players)
 * - add-coach.tsx (coaches)
 * - add-regular-member.tsx (players)
 * - add-admin.tsx (admins)
 *
 * FEATURES:
 * - Checks user existence via getUserByEmail
 * - Validates group membership
 * - Supports role accumulation (allows different roles)
 * - Special handling for youth players (shows selectable/non-selectable)
 * - Returns user-friendly status messages
 *
 * See ARCHITECTURE.md - "Member Invitation Validation Service" for full details.
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import type {
    ValidationRequest,
    ValidationResponse,
    YouthOption,
} from "./types";

/**
 * Main validation function
 * Validates if a member can be invited to a group
 */
export const validateMemberForInvitation = async (
  request: ValidationRequest,
): Promise<ValidationResponse> => {
  try {
    const { email, role, clubId, groupId, groupName } = request;

    console.log("🔍 Validating member for invitation:", {
      email,
      role,
      groupId,
    });

    // Call getUserByEmail to fetch user profile
    const functions = getFunctions(undefined, "europe-north1");
    const getUserByEmail = httpsCallable(functions, "getUserByEmail");
    const result = await getUserByEmail({ email });
    const response = result.data as any;

    console.log("📥 getUserByEmail response:", {
      success: response.success,
      userExists: response.userExists,
    });

    // User doesn't exist - can invite
    if (!response.success || !response.userExists || !response.userProfile) {
      return {
        success: true,
        userExists: false,
        canInvite: true,
        statusMessage: "New user - will receive email invitation",
        actionType: "new_user",
      };
    }

    // User exists - validate based on role
    if (role === "player-underage") {
      return await validateYouthInvitation(
        response.userProfile,
        clubId,
        groupId!,
        groupName!,
      );
    } else if (role === "club-admin") {
      return await validateClubAdminInvitation(response.userProfile, clubId);
    } else {
      return await validateAdultInvitation(
        response.userProfile,
        role,
        clubId,
        groupId!,
        groupName!,
      );
    }
  } catch (error: any) {
    console.error("❌ Validation error:", error);
    return {
      success: false,
      userExists: false,
      canInvite: false,
      statusMessage: "Error validating user",
      actionType: "new_user",
      error: error.message,
    };
  }
};

/**
 * Validates club admin invitations
 * Checks if user already has club-admin role at the club level
 */
async function validateClubAdminInvitation(
  userProfile: any,
  clubId: string,
): Promise<ValidationResponse> {
  console.log("🛡️ Validating club admin invitation");

  // Check if user is in the target club
  const clubAccess = userProfile.clubAccess?.find(
    (c: any) => c.clubId === clubId,
  );

  if (!clubAccess) {
    // User not in club at all - can invite as club admin
    console.log("✅ User not in club - can invite as club admin");
    return {
      success: true,
      userExists: true,
      canInvite: true,
      inGroup: false,
      statusMessage: "Existing user - will receive in-app notification",
      actionType: "existing_user_new_to_group",
    };
  }

  // Check if user already has club-admin role
  if (clubAccess.role === "club-admin") {
    console.log("❌ User is already a club admin - cannot invite");
    return {
      success: true,
      userExists: true,
      canInvite: false,
      inGroup: true,
      hasRequestedRole: true,
      currentRoles: ["club-admin"],
      statusMessage: "This user is already a club administrator",
      actionType: "existing_user_has_role",
    };
  }

  // User in club with different role - can be promoted to club admin
  console.log("✅ User in club but not admin - can invite as club admin");
  return {
    success: true,
    userExists: true,
    canInvite: true,
    inGroup: true,
    hasRequestedRole: false,
    currentRoles: [clubAccess.role || "member"],
    statusMessage: `User is in the club. They will be promoted to club administrator.`,
    actionType: "existing_user_add_role",
  };
}

/**
 * Validates adult role invitations (player, coach, admin)
 * Checks if user is in group and what roles they currently have
 */
async function validateAdultInvitation(
  userProfile: any,
  role: string,
  clubId: string,
  groupId: string,
  groupName: string,
): Promise<ValidationResponse> {
  console.log("👤 Validating adult invitation for role:", role);

  // Check if user is in the target club
  const clubAccess = userProfile.clubAccess?.find(
    (c: any) => c.clubId === clubId,
  );

  if (!clubAccess) {
    // User not in club at all
    console.log("✅ User not in club - can invite");
    return {
      success: true,
      userExists: true,
      canInvite: true,
      inGroup: false,
      statusMessage: "Existing user - will receive in-app notification",
      actionType: "existing_user_new_to_group",
    };
  }

  // Check if user is in the target group
  const groupMembership = clubAccess.groups?.find(
    (g: any) => g.groupId === groupId,
  );

  if (!groupMembership) {
    // User in club but not in this group
    console.log("✅ User in club but not in group - can invite");
    return {
      success: true,
      userExists: true,
      canInvite: true,
      inGroup: false,
      statusMessage: "Existing user - will receive in-app notification",
      actionType: "existing_user_new_to_group",
    };
  }

  // User is in the group - check roles
  const currentRoles = groupMembership.roles || [];
  const hasRequestedRole = currentRoles.includes(role);

  console.log(
    "📋 User in group. Current roles:",
    currentRoles,
    "Requested:",
    role,
  );

  if (hasRequestedRole) {
    // Already has this specific role - BLOCK
    const roleLabel =
      role === "coach" ? "coach" : role === "admin" ? "admin" : "player";
    console.log("❌ User already has requested role - cannot invite");
    return {
      success: true,
      userExists: true,
      canInvite: false,
      inGroup: true,
      hasRequestedRole: true,
      currentRoles,
      statusMessage: `This user is already a ${roleLabel} in ${groupName}`,
      actionType: "existing_user_has_role",
    };
  }

  // User in group with different role - role accumulation allowed
  const currentRoleLabels = currentRoles.join(", ");
  console.log("✅ User has different role - can add new role (accumulation)");
  return {
    success: true,
    userExists: true,
    canInvite: true,
    inGroup: true,
    hasRequestedRole: false,
    currentRoles,
    statusMessage: `User is already a ${currentRoleLabels} in ${groupName}. Adding ${role} role will give them both roles.`,
    actionType: "existing_user_add_role",
  };
}

/**
 * Validates youth (player-underage) invitations
 * Checks guardian's existing youth players and their group memberships
 */
async function validateYouthInvitation(
  guardianProfile: any,
  clubId: string,
  groupId: string,
  groupName: string,
): Promise<ValidationResponse> {
  console.log("👶 Validating youth invitation");

  const dependents = guardianProfile.dependents || [];
  console.log("📋 Guardian has", dependents.length, "youth players");

  if (dependents.length === 0) {
    return {
      success: true,
      guardianExists: true,
      canInvite: true,
      youthOptions: [],
      statusMessage:
        "Guardian has no youth players yet. You can add a new one.",
      actionType: "guardian_no_youth",
    };
  }

  // Process each youth player
  const youthOptions: YouthOption[] = dependents.map((youth: any) => {
    // Check if youth is already in target group
    const isInTargetGroup =
      youth.clubAccess?.some((access: any) => {
        const matchesClub = access.clubId === clubId;
        const matchesGroup = access.groups?.some(
          (g: any) => g.groupId === groupId,
        );
        return matchesClub && matchesGroup;
      }) || false;

    // Get all clubs this youth is in
    const currentClubs = youth.clubAccess?.map((c: any) => c.clubName) || [];

    // Get all groups in target club
    const targetClubAccess = youth.clubAccess?.find(
      (c: any) => c.clubId === clubId,
    );
    const currentGroups =
      targetClubAccess?.groups?.map((g: any) => ({
        groupId: g.groupId,
        groupName: g.groupName,
      })) || [];

    console.log(
      `  → Youth ${youth.childName}: inTargetGroup=${isInTargetGroup}`,
    );

    return {
      youthUid: youth.uid,
      youthName: youth.childName,
      clubAccess: youth.clubAccess || [],
      isInTargetGroup,
      isInTargetClub:
        youth.clubAccess?.some((c: any) => c.clubId === clubId) || false,
      selectable: !isInTargetGroup,
      statusMessage: isInTargetGroup ? `Already in ${groupName}` : "Available",
      currentClubs,
      currentGroups,
    };
  });

  const selectableCount = youthOptions.filter((y) => y.selectable).length;
  console.log(
    `✅ ${selectableCount} selectable, ${youthOptions.length - selectableCount} non-selectable`,
  );

  return {
    success: true,
    guardianExists: true,
    canInvite: true,
    youthOptions,
    statusMessage: `Guardian has ${dependents.length} youth player${dependents.length > 1 ? "s" : ""}`,
    actionType: "guardian_with_youth",
  };
}

// Export types for convenience
export type { ValidationRequest, ValidationResponse, YouthOption };
