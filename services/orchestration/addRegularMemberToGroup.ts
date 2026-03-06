// ===============================================================================
// FILE PURPOSE: Group Invitation Orchestration Service
// ===============================================================================
// This file is like a "smart invitation manager" for sports teams/groups
//
// 🎯 WHAT THIS FILE DOES:
// 1. Handles inviting people to join a sports group (like a soccer team)
// 2. Checks if invited people already have accounts in our app
// 3. Sends different types of invitations based on whether they have accounts
// 4. Manages what happens when people accept or reject invitations
// 5. Coordinates multiple backend functions to complete complex operations
//
// 🧠 WHY THIS EXISTS:
// - Inviting people to groups is complex and involves many steps
// - We need different flows for existing users vs new users
// - This file orchestrates (coordinates) all those steps
// - It follows a "three-layer architecture" pattern for clean code organization
// ===============================================================================

// 📦 IMPORTS: Bringing in tools we need from other files
// -------------------------------------------------------
// httpsCallable: A tool that lets us call backend functions from the frontend
import { httpsCallable } from "firebase/functions";
// functions: Our connection to the Firebase backend where our server functions live
import { functions } from "../core/firebase";

// ===============================================================================
// TYPESCRIPT INTERFACES: Data Structure Definitions
// ===============================================================================
// Think of interfaces like blueprints or forms - they define exactly what
// information we need and what type each piece should be

// 📝 WHAT WE NEED TO START INVITING PEOPLE
// ----------------------------------------
export interface GroupInvitationRequest {
  emails: string[]; // List of email addresses to invite (e.g., ["john@email.com", "mary@email.com"])
  clubId: string; // Unique ID of the sports club (e.g., "club_abc123")
  clubName: string; // Human-readable club name (e.g., "Manchester United FC")
  groupId?: string; // Unique ID of the specific team/group (optional for club_admin invitations)
  groupName?: string; // Human-readable group name (optional for club_admin invitations)
  inviterName: string; // Name of person sending invites (e.g., "Coach Smith")
  inviterUid: string; // Unique ID of person sending invites (e.g., "user_def456")
  invitationType?:
    | "youth_member"
    | "youth_member_existing"
    | "regular"
    | "club_admin"; // Type of invitation (optional, defaults to 'regular')
  role?: "player" | "player-underage" | "coach" | "admin" | "club-admin"; // Role to assign (optional, defaults to 'player')
  youthData?: {
    // Youth member specific data (optional, required for new youth invitations)
    childName: string; // Name of the child/youth member
    dateOfBirth: string; // Date of birth (ISO format)
    relationship: string; // Relationship to guardian (e.g., "Parent", "Guardian")
  };
  existingYouthData?: {
    // Existing youth member data (optional, required for existing youth invitations)
    youthUid: string; // UID of existing youth member
    youthName: string; // Name of existing youth member
  };
}

// 📊 WHAT WE GET BACK AFTER TRYING TO INVITE PEOPLE
// -------------------------------------------------
export interface GroupInvitationResult {
  success: boolean; // Did the overall invitation process work? (true/false)
  results?: {
    // Details for each email we tried to invite (optional)
    email: string; // The email address we processed
    success: boolean; // Did this specific invitation succeed?
    userExists: boolean; // Does this email belong to someone who already has an account?
    action: "in_app_notification" | "email_invitation" | "error"; // What type of invitation was sent?
    error?: string; // Error message if something went wrong (optional)
    invitationId?: string; // Unique ID of the invitation created (optional)
  }[];
  error?: string; // Overall error message if everything failed (optional)
}

// 💾 HOW WE STORE INVITATION INFORMATION IN THE DATABASE
// ------------------------------------------------------
export interface GroupInviteData {
  inviteId: string; // Unique identifier for this invitation
  clubId: string; // Which club the invitation is for
  clubName: string; // Club name for display purposes
  groupId: string; // Which specific group within the club
  groupName: string; // Group name for display purposes
  inviterName: string; // Who sent the invitation
  inviterUid: string; // Unique ID of the inviter
  invitedAt: Date; // When the invitation was created
  status: "pending" | "accepted" | "rejected"; // Current state of the invitation
  type: "group_invitation"; // What kind of invitation this is
}

// 📱 WHAT WE NEED WHEN SOMEONE RESPONDS TO AN INVITATION
// ------------------------------------------------------
export interface AcceptRejectInviteRequest {
  inviteId: string; // ID of the invitation being responded to
  action: "accept" | "reject"; // What the user chose to do
  clubId: string; // Which club (needed for processing)
  groupId: string; // Which group (needed for processing)
}

// 📤 WHAT WE GET BACK AFTER SOMEONE RESPONDS
// ------------------------------------------
export interface AcceptRejectResult {
  success: boolean; // Did the response get processed successfully?
  action: "accepted" | "rejected" | "error"; // What actually happened?
  message: string; // Human-readable message to show the user
  error?: string; // Error details if something went wrong (optional)
}

// ===============================================================================
// HELPER FUNCTION: Clean up notification after invitation response
// ===============================================================================
/**
 * 🧹 Helper to dismiss notification when user responds to invitation
 *
 * When a user accepts or rejects an invitation, we need to remove the corresponding
 * notification from their notification list so it doesn't keep appearing in the UI.
 *
 * This function:
 * 1. Queries the user's notifications subcollection for matching invitation
 * 2. If found, dismisses the notification (soft delete)
 * 3. Gracefully handles case where no notification exists (new users won't have one)
 */
async function cleanupInvitationNotification(
  userId: string,
  invitationToken: string,
): Promise<void> {
  try {
    console.log(
      `🧹 Cleaning up notification for invitation ${invitationToken}...`,
    );

    // Import Firestore tools
    const { getFirestore, collection, query, where, getDocs, deleteDoc } =
      await import("firebase/firestore");
    const db = getFirestore();

    // Query for notification matching this invitation token (any status)
    const notificationsRef = collection(db, "users", userId, "notifications");
    const q = query(
      notificationsRef,
      where("invitationToken", "==", invitationToken),
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      // Found matching notification — delete it entirely (user already acted on it)
      for (const notificationDoc of snapshot.docs) {
        await deleteDoc(notificationDoc.ref);
        console.log(
          `✅ Notification ${notificationDoc.id} deleted successfully`,
        );
      }
    } else {
      // No notification found - this is expected for new users who received email invitations
      console.log("ℹ️ No notification found (expected for new users)");
    }
  } catch (error: any) {
    // Log error but don't throw - notification cleanup shouldn't block invitation processing
    console.warn("⚠️ Failed to cleanup notification:", error.message);
  }
}

// ===============================================================================
// MAIN SERVICE OBJECT: The Invitation Management Toolbox
// ===============================================================================
// This is like a toolbox containing different tools (functions) for managing invitations
// Each tool has a specific job in the invitation process

/**
 * 🧰 MAIN INVITATION TOOLBOX: Orchestrating service for group invitation workflow
 *
 * 🎼 What "Orchestrating" Means:
 * - Like a conductor directing a symphony orchestra
 * - This doesn't do all the work itself, but coordinates when other functions should run
 * - It makes sure everything happens in the right order
 * - It handles complex workflows by breaking them into smaller steps
 *
 * This implements the new requirements-compliant invitation system
 */
export const addRegularMemberToGroupService = {
  /**
   * 🎯 TOOL #1: Main Invitation Workflow Orchestrator
   *
   * 📋 WHAT THIS FUNCTION DOES:
   * 1. Takes a list of email addresses that should be invited to a group
   * 2. For each email, checks if that person already has an account in our app
   * 3. If they have an account: sends them a notification inside the app
   * 4. If they don't have an account: sends them an email invitation to sign up
   * 5. Keeps track of what happened with each email address
   * 6. Returns a summary report of all results
   *
   * 🧠 WHY IT'S CALLED "ORCHESTRATOR":
   * - It coordinates multiple complex steps
   * - Like a project manager organizing different team members
   * - It doesn't do the actual work, but tells other functions when to run
   *
   * 📥 WHAT IT NEEDS (Parameters):
   * - request: Object containing emails to invite + club/group information
   *
   * 📤 WHAT IT RETURNS:
   * - A detailed report showing what happened with each email
   */
  async inviteUsersToGroup(
    request: GroupInvitationRequest,
  ): Promise<GroupInvitationResult> {
    try {
      // 📝 STEP 1: Log what we're starting (helps with debugging)
      // console.log is like leaving breadcrumbs for developers to follow
      console.log("🚀 Starting group invitation workflow:", {
        emails: request.emails, // Show which emails we're processing
        clubId: request.clubId, // Show which club
        groupId: request.groupId, // Show which group
      });

      // 📝 STEP 2: Create an empty list to store results for each email
      // We'll add one result object for each email we try to invite
      const results: GroupInvitationResult["results"] = [];

      // 📝 STEP 3: Process each email address one by one
      // "for...of" loop goes through each email in the array, one at a time
      for (const email of request.emails) {
        try {
          // 👤 Log which email we're currently working on
          console.log(`👤 Processing invitation for: ${email}`);

          // 🔍 STEP 3A: Check if this email belongs to an existing user
          // We ask the backend: "Do you have a user with this email?"
          const getUserByEmailFn = httpsCallable(functions, "getUserByEmail");
          const userResult = await getUserByEmailFn({
            email: email.trim().toLowerCase(),
          });

          // Extract the data from the backend response and tell TypeScript what it looks like
          const userResponse = userResult.data as {
            success: boolean; // Did the lookup succeed?
            userExists: boolean; // Was a user found with this email?
            userId?: string; // If found, what's their unique ID? (optional)
            error?: string; // If something went wrong, what was the error? (optional)
          };

          // 🚨 STEP 3B: Handle the case where the lookup itself failed
          if (!userResponse.success) {
            console.error(
              `❌ Error checking user existence for ${email}:`,
              userResponse.error,
            );
            // Add this email to our results list with error status
            results.push({
              email,
              success: false,
              userExists: false,
              action: "error",
              error: userResponse.error || "Failed to check user existence",
            });
            continue; // Skip to the next email (don't process this one further)
          }

          // 🎯 STEP 3C: Call unified sendGroupInvitation function
          // The backend function handles both existing and non-existing users based on the flag
          console.log(
            `📞 Calling sendGroupInvitation for ${email} (existing user: ${userResponse.userExists})`,
          );

          const sendInvitationFn = httpsCallable(
            functions,
            "sendGroupInvitation",
          );
          const invitationResult = await sendInvitationFn({
            emails: [email],
            clubId: request.clubId,
            clubName: request.clubName,
            groupId: request.groupId,
            groupName: request.groupName,
            inviterName: request.inviterName,
            inviterUid: request.inviterUid,
            isExistingUser: userResponse.userExists,
            userId: userResponse.userId,
            invitationType: request.invitationType || "regular",
            youthData: request.youthData,
            existingYouthData: request.existingYouthData, // Pass existing youth data
            role: request.role || "player", // ✨ NEW: Pass role to invitation
          });

          // Extract the response and process results
          const invitationResponse = invitationResult.data as {
            success: boolean;
            results?: {
              email: string;
              success: boolean;
              invitationToken?: string;
              error?: string;
            }[];
            error?: string;
          };

          if (
            invitationResponse.success &&
            invitationResponse.results &&
            invitationResponse.results.length > 0
          ) {
            const result = invitationResponse.results[0];
            results.push({
              email,
              success: result.success,
              userExists: userResponse.userExists,
              action: result.success
                ? userResponse.userExists
                  ? "in_app_notification"
                  : "email_invitation"
                : "error",
              error: result.error,
              invitationId: result.invitationToken,
            });
          } else {
            results.push({
              email,
              success: false,
              userExists: userResponse.userExists,
              action: "error",
              error: invitationResponse.error || "Failed to send invitation",
            });
          }
        } catch (error: any) {
          // 🚨 If anything goes wrong while processing this specific email
          console.error(`❌ Error processing invitation for ${email}:`, error);
          results.push({
            email,
            success: false,
            userExists: false,
            action: "error",
            error: error.message || "Unknown error",
          });
        }
      }

      // 📊 STEP 4: Calculate summary statistics
      // Count how many invitations were successful out of the total
      const successCount = results?.filter((r) => r.success).length || 0;
      console.log(
        `📊 Invitation workflow completed: ${successCount}/${request.emails.length} successful`,
      );

      // 📤 STEP 5: Return the final result summary
      return {
        success: successCount > 0, // Consider it successful if at least one invitation worked
        results, // Include detailed results for each email
      };
    } catch (error: any) {
      // 🚨 If the entire process fails catastrophically
      console.error("❌ Error in group invitation workflow:", error);
      return {
        success: false,
        error: error.message || "Failed to process group invitations",
      };
    }
  },

  /**
   * 🎯 TOOL #2: Process invitation after user response (UNIFIED FOR BOTH USER TYPES!)
   *
   * 📋 WHAT THIS FUNCTION DOES:
   * - This is the UNIFIED function that handles invitation responses from BOTH user types:
   *   1. New users who signed up using an invitation link (email invitations)
   *   2. Existing users who accepted in-app invitation notifications
   * - It intelligently handles membership checks based on invitation status
   * - It calls the same atomic functions for both scenarios with proper deduplication
   *
   * 🎪 THE UNIFIED WORKFLOW:
   * 1. New users: Email invitation → signup with token → THIS FUNCTION (status: 'accepted_pending_signup')
   * 2. Existing users: In-app notification → accept → THIS FUNCTION (status: 'pending')
   * 3. Both get the same atomic function calls with smart membership checking
   * 4. Both end up as members with consistent data structure
   *
   * 🔧 CONDITIONAL LOGIC FOR MEMBERSHIP CHECKS:
   * - New users ('accepted_pending_signup'): Skip membership checks (they're brand new)
   * - Existing users ('pending'): Check existing memberships before adding
   *
   * 🔧 WHAT ATOMIC FUNCTIONS DOES IT CALL:
   * - updateInvitation (claim): Atomically claims the invitation via Cloud Function (prevents double-processing)
   * - addMemberToClub: Adds user to the club's member list (with deduplication for existing users)
   * - addMemberToGroup: Adds user to the specific group's member list (with deduplication for existing users)
   * - updateUserClubInfo: Updates user's profile to show they're in this club (with deduplication for existing users)
   * - updateUserGroupInfo: Updates user's profile to show they're in this group (with deduplication for existing users)
   * - updateInvitation (delete): Deletes the invitation document so it can't be used again
   *
   * 📥 WHAT IT NEEDS (Parameters):
   * - invitationToken: The invitation ID (works for both email tokens and in-app invitation IDs)
   * - userId: The user ID (for new users: their newly created ID, for existing users: their existing ID)
   * - guardianInfo: Optional guardian information for youth member invitations (avoids permission issues)
   *
   * 📤 WHAT IT RETURNS:
   * - Success/failure status and a welcome message
   */
  async processInvitationAfterUserResponse(
    invitationToken: string,
    userId: string,
    action: "accept" | "reject" = "accept",
    guardianInfo?: {
      guardianUid: string;
      guardianEmail: string;
      guardianName: string;
      relationship: string;
    },
    youthData?: {
      childName: string;
      dateOfBirth: string;
      relationship: string;
    },
  ): Promise<AcceptRejectResult> {
    try {
      // 📝 Log what we're starting to process
      console.log(`🎯 Processing invitation after user response:`, {
        invitationToken,
        userId,
        action,
      });

      // 💾 STEP 1: CLAIM invitation atomically via Cloud Function
      // This prevents double-processing: two concurrent calls cannot both claim it
      // Uses updateInvitation CF with "claim" action (Admin SDK, bypasses security rules)
      console.log(
        "📝 Claiming invitation via updateInvitation Cloud Function...",
      );

      let invitationData: any;
      try {
        const updateInvitationFn = httpsCallable(functions, "updateInvitation");
        const claimResult = await updateInvitationFn({
          invitationToken: invitationToken,
          userId: userId,
          action: "claim",
        });

        const claimResponse = claimResult.data as {
          success: boolean;
          invitationData?: any;
          error?: string;
          errorCode?: string;
        };

        if (!claimResponse.success) {
          const errorCode = claimResponse.errorCode || "";

          if (errorCode === "INVITATION_NOT_FOUND") {
            return {
              success: false,
              action: "error",
              message: "Invalid or expired invitation",
              error: "Invitation not found",
            };
          }
          if (errorCode === "INVITATION_ALREADY_PROCESSING") {
            return {
              success: false,
              action: "error",
              message: "This invitation is already being processed",
              error:
                "Invitation is currently being processed by another request",
            };
          }
          if (errorCode.startsWith("INVALID_STATUS:")) {
            const status = errorCode.split(":")[1];
            console.log(
              `❌ Invitation status is ${status}, expected 'accepted_pending_signup' or 'pending'`,
            );
            return {
              success: false,
              action: "error",
              message: "Invitation is not in the correct state for processing",
              error: `Expected status 'accepted_pending_signup' or 'pending', got '${status}'`,
            };
          }
          if (errorCode === "CALLER_MISMATCH") {
            return {
              success: false,
              action: "error",
              message: "This invitation was not sent to your account",
              error: "Caller does not match the invitation recipient",
            };
          }

          // Generic error
          return {
            success: false,
            action: "error",
            message: "Failed to retrieve invitation data",
            error: claimResponse.error || "Unknown error",
          };
        }

        invitationData = claimResponse.invitationData;

        console.log(
          `📋 Claimed invitation for group: ${invitationData.groupName} (Status: ${invitationData.status}, User Type: ${invitationData.status === "accepted_pending_signup" ? "New" : "Existing"})`,
        );
      } catch (claimError: any) {
        console.error("❌ Error claiming invitation:", claimError);
        return {
          success: false,
          action: "error",
          message: "Failed to retrieve invitation data",
          error: claimError.message,
        };
      }

      // � STEP 2: Handle rejection case (simple path)
      if (action === "reject") {
        console.log(
          `❌ User rejected invitation to group ${invitationData.groupName}`,
        );

        try {
          // Mark invitation as rejected using Cloud Function
          console.log("📞 Calling updateInvitation to reject...");
          const updateInvitationFn = httpsCallable(
            functions,
            "updateInvitation",
          );
          await updateInvitationFn({
            invitationToken: invitationToken,
            userId: userId,
            action: "reject",
          });

          // 🧹 Clean up the notification (for existing users who had in-app notification)
          await cleanupInvitationNotification(userId, invitationToken);

          return {
            success: true,
            action: "rejected",
            message: `You declined the invitation to join ${invitationData.groupName}`,
          };
        } catch (rejectError: any) {
          console.error("❌ Error processing rejection:", rejectError);
          return {
            success: false,
            action: "error",
            message: "Failed to process invitation rejection",
            error: rejectError.message,
          };
        }
      }

      // 📋 STEP 2.5: For new youth invitations, create the youth document NOW
      // (after the invitation has been claimed, so no duplicate youth docs on retry)
      let createdYouthUid: string | undefined;
      if (
        invitationData.invitationType === "youth_member" &&
        invitationData.youthData &&
        guardianInfo &&
        youthData
      ) {
        console.log(
          "👶 Creating youth member document (post-claim, safe from duplicates)...",
        );

        const createYouthFn = httpsCallable(
          functions,
          "createYouthMemberDocument",
        );
        const youthResult = await createYouthFn({
          guardianUid: guardianInfo.guardianUid,
          guardianEmail: guardianInfo.guardianEmail,
          guardianName: guardianInfo.guardianName,
          childName: youthData.childName,
          dateOfBirth: youthData.dateOfBirth,
          relationship: youthData.relationship,
        });

        const youthResponse = youthResult.data as any;
        if (!youthResponse.success) {
          throw new Error(
            youthResponse.error || "Failed to create youth member",
          );
        }

        createdYouthUid = youthResponse.youthUid;
        // Override userId to use the youth's UID for downstream operations
        userId = createdYouthUid!;
        console.log("✅ Youth member document created:", createdYouthUid);
      }

      // 📋 STEP 3: Prepare member data for the atomic functions (acceptance flow)
      // This creates a standard "member" object that all functions expect

      // Get and validate role from invitation document
      const role = invitationData.role;
      if (!role) {
        throw new Error("Role is missing in invitation document");
      }

      console.log(`📋 Role from invitation: ${role}`);

      // Check invitation type
      const invitationType = invitationData.invitationType || "regular";
      const isExistingYouthFlow = invitationType === "youth_member_existing";

      // Check if this is a youth role (requires youth-specific handling)
      const isYouthRole = role === "player-underage";
      const hasYouthData = !!invitationData.youthData;
      const hasExistingYouthData = !!invitationData.existingYouthData;
      const needsYouthFlow =
        isYouthRole && (hasYouthData || hasExistingYouthData);

      if (isYouthRole && !hasYouthData && !hasExistingYouthData) {
        throw new Error(
          "Youth role (player-underage) requires youthData or existingYouthData in invitation document",
        );
      }

      // For existing youth, use the youth UID from existingYouthData
      const youthUserId =
        isExistingYouthFlow && hasExistingYouthData
          ? invitationData.existingYouthData.youthUid
          : userId;

      // For youth invitations, use the passed guardianInfo to build guardiansContacts
      let guardiansContacts: any[] = [];
      if (needsYouthFlow && guardianInfo) {
        console.log("👨‍👧 Using provided guardian info for youth member");
        guardiansContacts = [
          {
            guardianUid: guardianInfo.guardianUid,
            guardianName: guardianInfo.guardianName,
            guardianEmail: guardianInfo.guardianEmail,
            relationship: guardianInfo.relationship,
          },
        ];
      } else if (needsYouthFlow) {
        console.warn(
          "⚠️ Youth role but no guardian info provided - guardiansContacts will be empty",
        );
      }

      // 👤 STEP 3.5: Fetch user's actual display name from Firestore
      let displayName = "Unknown User";
      if (!isYouthRole) {
        try {
          const { getFirestore, doc, getDoc } =
            await import("firebase/firestore");
          const db = getFirestore();
          const userDocRef = doc(db, "users", userId);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            displayName =
              userData.displayName ||
              userData.email?.split("@")[0] ||
              "Unknown User";
            console.log(`✅ Fetched display name: ${displayName}`);
          } else {
            // Fallback to email prefix if user document doesn't exist yet
            displayName = invitationData.email?.split("@")[0] || "Unknown User";
            console.warn(
              `⚠️ User document not found, using email prefix: ${displayName}`,
            );
          }
        } catch (error: any) {
          console.warn(
            `⚠️ Error fetching display name, using email prefix:`,
            error.message,
          );
          displayName = invitationData.email?.split("@")[0] || "Unknown User";
        }
      }

      const memberData = {
        userId: youthUserId, // Use youthUserId (could be existing youth or new userId)
        // For youth roles, use child's name from youthData or existingYouthData; otherwise use actual display name from user profile
        name: isYouthRole
          ? hasYouthData
            ? invitationData.youthData.childName
            : invitationData.existingYouthData.youthName
          : displayName,
        // For youth roles, youth members don't have email; omit the field
        ...(isYouthRole ? {} : { email: invitationData.email }),
        roles: [role], // ✅ Use role from invitation document
        joinedAt: new Date(), // When they joined (right now)
        photoURL: isYouthRole
          ? "https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fchild_profile_icon.png?alt=media"
          : "https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media", // Default profile icons
        addedBy: invitationData.inviterUid, // Who invited them
        needsGuardian: isYouthRole, // Youth members need a guardian
        guardiansContacts: guardiansContacts, // Guardian contacts from youth's guardians array
      };

      console.log(
        "🔍 DEBUG memberData:",
        JSON.stringify(
          {
            role,
            isYouthRole,
            isExistingYouthFlow,
            needsYouthFlow,
            youthUserId,
            hasEmail: "email" in memberData,
            needsGuardian: memberData.needsGuardian,
            memberData,
          },
          null,
          2,
        ),
      );

      // 📋 Prepare club information object
      const clubInfo = {
        clubId: invitationData.clubId,
        clubName: invitationData.clubName,
        role: "player",
        joinedAt: new Date(),
        lastModifiedAt: new Date(),
      };

      // 📋 Prepare group information object
      const groupInfo = {
        groupId: invitationData.groupId,
        groupName: invitationData.groupName,
        joinedAt: new Date(),
        lastModifiedAt: new Date(),
      };

      // 🎯 STEP 4: CONDITIONAL LOGIC - Handle membership based on user type and invitation type
      const isNewUser = invitationData.status === "accepted_pending_signup";
      const isClubAdminInvitation = invitationType === "club_admin";

      if (isClubAdminInvitation) {
        // 🔐 CLUB ADMIN PATH: Only add to club (no group operations)
        console.log("🔐 Processing CLUB ADMIN invitation - club-level only");

        await this.executeAtomicOperations({
          invitationData,
          memberData,
          clubInfo,
          userId,
          invitationToken,
          checkMembership: !isNewUser,
          includeGroupOps: false,
        });
      } else if (isExistingYouthFlow) {
        // 🔄 EXISTING YOUTH PATH: Youth already exists, check if in club
        console.log(
          "🔄 Processing for EXISTING YOUTH - checking club membership",
        );

        await this.executeAtomicOperations({
          invitationData,
          memberData,
          clubInfo,
          groupInfo,
          userId: youthUserId,
          invitationToken,
          checkMembership: true,
          includeGroupOps: true,
          guardianUserId: userId,
        });
      } else if (isNewUser) {
        // 🆕 NEW USER PATH: Skip membership checks (they're brand new)
        console.log("🆕 Processing for NEW USER - skipping membership checks");

        await this.executeAtomicOperations({
          invitationData,
          memberData,
          clubInfo,
          groupInfo,
          userId,
          invitationToken,
          checkMembership: false,
          includeGroupOps: true,
        });
      } else {
        // 👤 EXISTING USER PATH: Check memberships before adding
        console.log(
          "👤 Processing for EXISTING USER - checking existing memberships",
        );

        await this.executeAtomicOperations({
          invitationData,
          memberData,
          clubInfo,
          groupInfo,
          userId,
          invitationToken,
          checkMembership: true,
          includeGroupOps: true,
        });
      }

      // 🎉 SUCCESS: All processing completed
      console.log(
        `✅ Successfully orchestrated all atomic functions for user ${userId}`,
      );

      // Return appropriate message based on invitation type
      const welcomeMessage = isClubAdminInvitation
        ? `Welcome! You are now a Club Admin for ${invitationData.clubName}.`
        : `Welcome to ${invitationData.groupName}! You have been successfully added to the group.`;

      return {
        success: true,
        action: "accepted",
        message: welcomeMessage,
      };
    } catch (error: any) {
      // 🚨 If anything goes wrong during this complex process
      console.error(
        "❌ Error processing invitation after user response:",
        error,
      );
      return {
        success: false,
        action: "error",
        message: "Failed to process invitation after user response",
        error: error.message || "Unknown error",
      };
    }
  },

  /**
   * 🔧 UNIFIED METHOD: Execute all atomic operations for invitation acceptance
   * Consolidates the logic from the former callAtomicFunctionsDirectly,
   * callAtomicFunctionsWithMembershipChecks, callAtomicFunctionsForExistingYouth,
   * and callAtomicFunctionsForClubAdmin into a single configurable method.
   *
   * @param config.invitationData - The invitation document data
   * @param config.memberData - The member data to add (userId, name, roles, etc.)
   * @param config.clubInfo - Club info object for user profile updates
   * @param config.groupInfo - Group info object (omit for club-admin invitations)
   * @param config.userId - The user being added (youth UID for youth flows)
   * @param config.invitationToken - The invitation document ID
   * @param config.checkMembership - Whether to check existing memberships first
   * @param config.includeGroupOps - Whether to include group-level operations
   * @param config.guardianUserId - Guardian UID for notification cleanup (youth flows)
   */
  async executeAtomicOperations(config: {
    invitationData: any;
    memberData: any;
    clubInfo: any;
    groupInfo?: any;
    userId: string;
    invitationToken: string;
    checkMembership: boolean;
    includeGroupOps: boolean;
    guardianUserId?: string;
  }) {
    const {
      invitationData,
      memberData,
      clubInfo,
      groupInfo,
      userId,
      invitationToken,
      checkMembership,
      includeGroupOps,
      guardianUserId,
    } = config;

    const role = invitationData.role || "player";
    const isYouthRole = role === "player-underage";
    const hasGuardians =
      memberData.guardiansContacts && memberData.guardiansContacts.length > 0;
    const isClubAdminFlow = role === "club-admin" || !includeGroupOps;

    // For club-admin flow, override memberData with club-admin specific data
    const effectiveMemberData = isClubAdminFlow
      ? {
          userId: userId,
          name: memberData.name,
          email: invitationData.email,
          roles: ["club-admin"],
          joinedAt: new Date(),
          photoURL:
            "https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media",
          addedBy: invitationData.inviterUid,
          needsGuardian: false,
          guardiansContacts: [],
        }
      : memberData;

    // For club-admin flow, override clubInfo with club-admin role
    const effectiveClubInfo = isClubAdminFlow
      ? {
          clubId: invitationData.clubId,
          clubName: invitationData.clubName,
          role: "club-admin",
          joinedAt: new Date(),
          lastModifiedAt: new Date(),
        }
      : clubInfo;

    // ─────────────────────────────────────────────────────────
    // STEP 1: Check existing memberships (if required)
    // ─────────────────────────────────────────────────────────
    let isClubMember = false;
    let isGroupMember = false;
    let currentRoles: string[] = [];

    if (checkMembership) {
      console.log("🔍 Checking existing memberships via backend...");

      const checkMembershipFn = httpsCallable(functions, "checkMembership");
      const membershipResult = await checkMembershipFn({
        userId: userId,
        clubId: invitationData.clubId,
        ...(includeGroupOps ? { groupId: invitationData.groupId } : {}),
        // For youth invitations, also check guardian's club membership
        ...(isYouthRole && hasGuardians
          ? { guardianUid: memberData.guardiansContacts[0].guardianUid }
          : {}),
      });

      const membershipData = membershipResult.data as {
        success: boolean;
        isClubMember: boolean;
        isGroupMember: boolean;
        currentRoles?: string[];
        error?: string;
      };

      if (!membershipData.success) {
        throw new Error(`Failed to check membership: ${membershipData.error}`);
      }

      isClubMember = membershipData.isClubMember;
      isGroupMember = membershipData.isGroupMember;
      currentRoles = membershipData.currentRoles || [];

      console.log(
        `🔍 Membership status: Club=${isClubMember}, Group=${isGroupMember}, CurrentRoles=[${currentRoles.join(", ")}]`,
      );

      // Early exit: already in this group with same role — nothing to do
      if (isGroupMember && currentRoles.includes(role)) {
        console.log("⚠️ User already in group with this role — skipping");
        const notifUserId = guardianUserId || userId;
        await cleanupInvitationNotification(notifUserId, invitationToken);
        return;
      }
    }

    // ─────────────────────────────────────────────────────────
    // STEP 2: Role update for existing group members
    // ─────────────────────────────────────────────────────────
    if (includeGroupOps && isGroupMember && !currentRoles.includes(role)) {
      console.log(
        `🔄 User already a group member — updating role to add '${role}'`,
      );

      const updateMemberRoleFn = httpsCallable(functions, "updateMemberRole");
      const roleUpdateResult = await updateMemberRoleFn({
        clubId: invitationData.clubId,
        groupId: invitationData.groupId,
        userId: userId,
        operation: "add",
        roleToAdd: role,
      });

      const roleUpdateResponse = roleUpdateResult.data as {
        success: boolean;
        message?: string;
        error?: string;
        alreadyHasRole?: boolean;
      };

      if (roleUpdateResponse.success) {
        console.log(`✅ Role update successful: ${roleUpdateResponse.message}`);

        // Finalize: mark used + cleanup
        await this.finalizeInvitation(
          invitationToken,
          guardianUserId || userId,
          guardianUserId || userId,
        );
        return;
      } else if (!roleUpdateResponse.alreadyHasRole) {
        throw new Error(
          `Failed to update member role: ${roleUpdateResponse.error}`,
        );
      }
    }

    // Club-admin role update for existing club members
    if (isClubAdminFlow && isClubMember) {
      console.log("✅ User already in club — adding club-admin role");

      const updateClubMemberRoleFn = httpsCallable(
        functions,
        "updateClubMemberRole",
      );
      const roleResult = await updateClubMemberRoleFn({
        clubId: invitationData.clubId,
        userId: userId,
        operation: "add",
        roleToAdd: "club-admin",
      });

      const roleResponse = roleResult.data as {
        success: boolean;
        error?: string;
      };
      if (!roleResponse.success) {
        throw new Error(`Failed to add club-admin role: ${roleResponse.error}`);
      }
      console.log("✅ Club-admin role added to existing member");

      // Update user's clubAccess role
      console.log("📞 Updating user's club access role...");
      const updateUserClubInfoFn = httpsCallable(
        functions,
        "updateUserClubInfo",
      );
      await updateUserClubInfoFn({
        uid: userId,
        clubInfo: effectiveClubInfo,
        role: "club-admin",
      });
      console.log("✅ User club access updated to club-admin");

      // Finalize
      await this.finalizeInvitation(invitationToken, userId, userId);
      return;
    }

    // Youth already in club — use role accumulation instead of addMemberToClub
    if (isYouthRole && isClubMember) {
      console.log("✅ Youth already in club — using role accumulation");

      const updateClubMemberRoleFn = httpsCallable(
        functions,
        "updateClubMemberRole",
      );
      const roleResult = await updateClubMemberRoleFn({
        clubId: invitationData.clubId,
        userId: userId,
        operation: "add",
        roleToAdd: "player-underage",
      });

      const roleResponse = roleResult.data as {
        success: boolean;
        error?: string;
      };
      if (!roleResponse.success) {
        throw new Error(
          `Failed to add player-underage role: ${roleResponse.error}`,
        );
      }
      console.log("✅ Player-underage role accumulated in club");
    }

    // ─────────────────────────────────────────────────────────
    // STEP 3: Add user to club (if not already a member)
    // ─────────────────────────────────────────────────────────
    if (!isClubMember) {
      console.log("📞 Calling addMemberToClub atomic function...");
      const addMemberToClubFn = httpsCallable(functions, "addMemberToClub");
      const clubResult = await addMemberToClubFn({
        clubId: invitationData.clubId,
        memberData: effectiveMemberData,
      });

      const clubResponse = clubResult.data as {
        success: boolean;
        error?: string;
      };
      if (!clubResponse.success) {
        throw new Error(`Failed to add member to club: ${clubResponse.error}`);
      }
      console.log("✅ Member added to club successfully");

      // Update user's club info in their profile
      // ⚠️ IMPORTANT: This MUST run before addMemberToGroup, because
      // addMemberToGroup checks the calling user's clubAccess array
      // for permission. Without clubAccess set, it fails with 403.
      console.log("📞 Calling updateUserClubInfo atomic function...");
      const updateUserClubInfoFn = httpsCallable(
        functions,
        "updateUserClubInfo",
      );
      const userClubResult = await updateUserClubInfoFn({
        uid: userId,
        clubInfo: effectiveClubInfo,
        role: role,
      });

      const userClubResponse = userClubResult.data as {
        success: boolean;
        error?: string;
      };
      if (!userClubResponse.success) {
        throw new Error(
          `Failed to update user club info: ${userClubResponse.error}`,
        );
      }
      console.log("✅ User club info updated successfully");
    } else {
      console.log("ℹ️ User already a club member, skipping club addition");
    }

    // ─────────────────────────────────────────────────────────
    // STEP 4: Process guardians for youth roles
    // ─────────────────────────────────────────────────────────
    if (isYouthRole && hasGuardians) {
      await this.processGuardiansForClub(
        invitationData,
        memberData.guardiansContacts,
        clubInfo,
        checkMembership,
      );
    }

    // ─────────────────────────────────────────────────────────
    // STEP 5: Add user to group (if includeGroupOps and not already a member)
    // ─────────────────────────────────────────────────────────
    if (includeGroupOps && groupInfo) {
      if (!isGroupMember) {
        console.log("📞 Calling addMemberToGroup atomic function...");
        const addMemberToGroupFn = httpsCallable(functions, "addMemberToGroup");
        const groupResult = await addMemberToGroupFn({
          clubId: invitationData.clubId,
          groupId: invitationData.groupId,
          memberData,
        });

        const groupResponse = groupResult.data as {
          success: boolean;
          error?: string;
        };
        if (!groupResponse.success) {
          throw new Error(
            `Failed to add member to group: ${groupResponse.error}`,
          );
        }
        console.log("✅ Member added to group successfully");

        // Update user's group info
        console.log("📞 Calling updateUserGroupInfo atomic function...");
        const updateUserGroupInfoFn = httpsCallable(
          functions,
          "updateUserGroupInfo",
        );
        const userGroupResult = await updateUserGroupInfoFn({
          uid: userId,
          clubId: invitationData.clubId,
          groupInfo,
          roles: [role],
          operation: "add",
          updateClubMemberListRoles: isClubMember, // Update club member list if user was already in club
        });

        const userGroupResponse = userGroupResult.data as {
          success: boolean;
          error?: string;
        };
        if (!userGroupResponse.success) {
          throw new Error(
            `Failed to update user group info: ${userGroupResponse.error}`,
          );
        }
        console.log("✅ User group info updated successfully");
      } else {
        console.log("ℹ️ User already a group member, skipping group addition");
      }

      // ─────────────────────────────────────────────────────────
      // STEP 6: Update guardian dependent access (youth flows)
      // ─────────────────────────────────────────────────────────
      if (isYouthRole && hasGuardians) {
        console.log("📞 Updating guardian dependent access...");
        const updateGuardianDependentAccessFn = httpsCallable(
          functions,
          "updateGuardianDependentAccess",
        );

        for (const guardian of memberData.guardiansContacts) {
          try {
            const guardianAccessResult = await updateGuardianDependentAccessFn({
              youthUid: userId,
              guardianUid: guardian.guardianUid,
            });

            const guardianAccessResponse = guardianAccessResult.data as {
              success: boolean;
              error?: string;
            };
            if (guardianAccessResponse.success) {
              console.log(
                `✅ Updated dependent access in guardian ${guardian.guardianUid}'s profile`,
              );
            } else {
              console.warn(
                `⚠️ Failed to update dependent access for guardian ${guardian.guardianUid}:`,
                guardianAccessResponse.error,
              );
            }
          } catch (guardianError) {
            console.error(
              `⚠️ Error updating guardian ${guardian.guardianUid}'s dependent access:`,
              guardianError,
            );
            // Don't throw - continue with invitation processing
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // STEP 7: Finalize — mark invitation used + delete notification
    // ─────────────────────────────────────────────────────────
    const acceptingUserId = guardianUserId || userId;
    await this.finalizeInvitation(
      invitationToken,
      acceptingUserId,
      acceptingUserId,
    );
  },

  /**
   * 🔧 HELPER: Process guardian club memberships for youth invitations
   * Checks each guardian's membership and either adds them or accumulates the guardian role.
   */
  async processGuardiansForClub(
    invitationData: any,
    guardiansContacts: any[],
    clubInfo: any,
    shouldCheckMembership: boolean,
  ) {
    console.log(
      `📞 Processing ${guardiansContacts.length} guardian(s) for club membership...`,
    );

    const checkMembershipFn = httpsCallable(functions, "checkMembership");

    for (const guardian of guardiansContacts) {
      console.log(`  → Processing guardian: ${guardian.guardianName}`);

      let guardianInClub = false;

      if (shouldCheckMembership) {
        // Check if guardian is already in the club
        const guardianMembershipResult = await checkMembershipFn({
          userId: guardian.guardianUid,
          clubId: invitationData.clubId,
        });

        const guardianMembershipData = guardianMembershipResult.data as {
          success: boolean;
          isClubMember: boolean;
          error?: string;
        };

        guardianInClub = guardianMembershipData.isClubMember;
      }

      if (guardianInClub) {
        // Guardian already in club — add 'guardian' role
        console.log(
          `ℹ️ Guardian ${guardian.guardianName} already in club, adding guardian role...`,
        );

        try {
          const updateClubMemberRoleFn = httpsCallable(
            functions,
            "updateClubMemberRole",
          );
          const roleResult = await updateClubMemberRoleFn({
            clubId: invitationData.clubId,
            userId: guardian.guardianUid,
            operation: "add",
            roleToAdd: "guardian",
          });

          const roleResponse = roleResult.data as {
            success: boolean;
            error?: string;
          };
          if (roleResponse.success) {
            console.log("✅ Guardian role added successfully");
          } else {
            console.log("⚠️ Failed to add guardian role:", roleResponse.error);
          }
        } catch (roleError) {
          console.error("⚠️ Error adding guardian role:", roleError);
          // Don't throw - guardian role addition is supplementary
        }
      } else {
        // Guardian not in club — add them as new member
        console.log("📞 Adding guardian to club...");

        const guardianMemberData = {
          userId: guardian.guardianUid,
          name: guardian.guardianName,
          email: guardian.guardianEmail,
          roles: ["guardian"],
          joinedAt: new Date(),
          photoURL:
            "https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media",
          addedBy: invitationData.inviterUid,
          needsGuardian: false,
          guardiansContacts: [],
        };

        try {
          const addMemberToClubFn = httpsCallable(functions, "addMemberToClub");
          const guardianClubResult = await addMemberToClubFn({
            clubId: invitationData.clubId,
            memberData: guardianMemberData,
          });

          const guardianClubResponse = guardianClubResult.data as {
            success: boolean;
            error?: string;
          };
          if (guardianClubResponse.success) {
            console.log("✅ Guardian added to club successfully");

            // Update guardian's user profile club info
            console.log("📞 Calling updateUserClubInfo for guardian...");
            const updateUserClubInfoFn = httpsCallable(
              functions,
              "updateUserClubInfo",
            );
            const guardianClubInfoResult = await updateUserClubInfoFn({
              uid: guardian.guardianUid,
              clubInfo,
              role: "guardian",
            });

            const guardianClubInfoResponse = guardianClubInfoResult.data as {
              success: boolean;
              error?: string;
            };
            if (guardianClubInfoResponse.success) {
              console.log("✅ Guardian club info updated successfully");
            } else {
              console.log(
                "⚠️ Failed to update guardian club info:",
                guardianClubInfoResponse.error,
              );
            }
          } else {
            console.log(
              "⚠️ Guardian may already be in club:",
              guardianClubResponse.error,
            );
          }
        } catch (guardianError) {
          console.error("⚠️ Error adding guardian to club:", guardianError);
          // Don't throw - guardian addition is supplementary
        }
      }
    }
  },

  /**
   * 🔧 HELPER: Finalize invitation — mark as used and delete notification
   */
  async finalizeInvitation(
    invitationToken: string,
    acceptingUserId: string,
    notificationUserId: string,
  ) {
    console.log("📞 Calling updateInvitation to delete...");
    const updateInvitationFn = httpsCallable(functions, "updateInvitation");
    await updateInvitationFn({
      invitationToken: invitationToken,
      userId: acceptingUserId,
      action: "delete",
    });

    // Delete the notification document
    await cleanupInvitationNotification(notificationUserId, invitationToken);
  },
}; // 🔚 END OF SERVICE OBJECT

// ===============================================================================
// 📚 FILE SUMMARY: What You Just Learned!
// ===============================================================================
//
// 🎯 THIS FILE IS THE "INVITATION MANAGER" FOR SPORTS GROUPS
//
// 📋 IT NOW HAS 2 MAIN TOOLS (SIMPLIFIED UNIFIED ARCHITECTURE):
// 1. 🎼 inviteUsersToGroup: The main coordinator that handles all email invitations
//    - Checks if user exists using getUserByEmail
//    - Calls sendGroupInvitation with appropriate flags for both user types
//    - No unnecessary branching - the backend handles notification vs email logic
// 2. 🎯 processInvitationAfterUserResponse: UNIFIED function handling BOTH user types
//    - Handles acceptance/rejection for both new and existing users
//    - Uses conditional membership checking based on invitation status
//
// 🔑 KEY ARCHITECTURAL IMPROVEMENTS:
// - **Simplified Service Layer**: Removed createInAppGroupInvitation and sendEmailGroupInvitation helpers
// - **Single Backend Call**: Direct call to sendGroupInvitation for all invitation types
// - **Backend-Driven Logic**: The Firebase Function handles branching based on isExistingUser flag
// - **Unified Invitation Storage**: Both existing and new users use the 'invitations' collection
// - **Conditional Membership Checking**: Smart logic based on invitation status
// - **Consistent Three-Layer Architecture**: UI → Orchestration Service → Firebase Functions
// - **Same Atomic Functions**: Both flows call identical atomic functions with proper deduplication
// - **Preserved Working Logic**: New users keep the original working flow (no membership checks)
//
// 🎪 THE SIMPLIFIED INVITATION WORKFLOW:
// 1. Coach wants to invite players → calls inviteUsersToGroup()
// 2. System checks each email → existing user or new user? (getUserByEmail)
// 3. Single call to sendGroupInvitation with isExistingUser flag:
//    - Existing users: isExistingUser=true, userId provided → creates invitation record only
//    - New users: isExistingUser=false → creates invitation record + sends email
// 4. Backend stores invitation in 'invitations' collection with status='pending'
// 5. User responds:
//    - Existing users: Accept in-app → processInvitationAfterUserResponse()
//    - New users: Click email link → signup → processInvitationAfterUserResponse()
// 6. Both paths use same atomic functions with smart membership deduplication:
//    - addMemberToClub (with membership checking for existing users)
//    - addMemberToGroup (with membership checking for existing users)
//    - updateUserClubInfo (with membership checking for existing users)
//    - updateUserGroupInfo (with membership checking for existing users)
// 7. Result: Everyone who accepts is now a member with consistent architecture! 🎉
//
// 💡 WHY THIS SIMPLIFIED APPROACH IS BETTER:
// - Less code to maintain (removed 2 unnecessary helper functions)
// - Clearer separation of concerns (service layer doesn't duplicate backend logic)
// - Single source of truth for invitation logic (backend function)
// - Easier to test and debug (fewer code paths)
// - Better performance (one less function call layer)
// - Consistent architecture pattern (same as other services)
// - Preserved working functionality (all existing behavior intact)
// - Smart membership deduplication (prevents invitation modal loops for existing users)
// ===============================================================================
