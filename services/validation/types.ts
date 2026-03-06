/**
 * MEMBER INVITATION VALIDATION SERVICE - TYPE DEFINITIONS
 * ======================================================
 *
 * TypeScript interfaces for the validation service that checks
 * whether members can be invited to groups before creating invitations.
 *
 * See ARCHITECTURE.md - "Member Invitation Validation Service" for details.
 */

export interface ValidationRequest {
  email: string; // Email to validate
  role:
    | "player"
    | "coach"
    | "admin"
    | "player-underage"
    | "club-admin"
    | "guardian";
  clubId: string; // Target club ID
  groupId?: string; // Target group ID (optional for club-admin)
  groupName?: string; // For display messages (optional for club-admin)
}

export interface ValidationResponse {
  success: boolean; // Service call succeeded
  userExists: boolean; // Email has Clubnizer account
  canInvite: boolean; // ✅ Clear yes/no answer

  // Adult roles (player, coach, admin)
  inGroup?: boolean; // User is in target group
  hasRequestedRole?: boolean; // User has THIS specific role
  currentRoles?: string[]; // Roles user has in group

  // Youth role (player-underage)
  guardianExists?: boolean; // Guardian email exists
  youthOptions?: YouthOption[]; // Available youth players

  // Display information
  statusMessage: string; // User-friendly message
  actionType: ActionType; // Categorizes the scenario
  error?: string; // Error message if validation fails
}

export type ActionType =
  | "new_user" // Email not in system
  | "existing_user_new_to_group" // User exists, not in group
  | "existing_user_add_role" // User in group, different role
  | "existing_user_has_role" // User already has requested role
  | "guardian_with_youth" // Guardian with youth players
  | "guardian_no_youth"; // Guardian without youth players

export interface YouthOption {
  youthUid: string;
  youthName: string;
  clubAccess: any[];
  isInTargetGroup: boolean; // TRUE = already in target group
  isInTargetClub: boolean; // TRUE = in club but different group
  selectable: boolean; // FALSE if already in target group
  statusMessage: string; // "Available" | "Already in [GroupName]"
  currentClubs: string[]; // For display
  currentGroups?: {
    // Groups youth is in
    groupId: string;
    groupName: string;
  }[];
}
