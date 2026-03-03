import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { AddMemberToGroupRequest, FunctionResponse } from "../types/interfaces";
import { config } from "../utils/config";
import { checkClubMemberLimit, getClubSubscriptionTier } from "../utils/limits";
import { validateRequiredFields } from "../utils/validation";

export const addMemberToGroup = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const { clubId, groupId, memberData }: AddMemberToGroupRequest =
        request.data;

      // Validate required fields
      validateRequiredFields(request.data, ["clubId", "groupId", "memberData"]);

      // DEBUG: Log memberData to see what we're receiving
      console.log(
        "🔍 DEBUG addMemberToGroup - memberData received:",
        JSON.stringify({
          needsGuardian: memberData.needsGuardian,
          needsGuardianType: typeof memberData.needsGuardian,
          hasEmail: "email" in memberData,
          emailValue: memberData.email,
          memberDataKeys: Object.keys(memberData),
        }),
      );

      // For youth members, email is optional; for regular members, email is required
      // Check if needsGuardian is explicitly true (not just truthy)
      const requiredMemberFields =
        memberData.needsGuardian === true
          ? ["userId", "roles", "name"] // Youth members don't need email
          : ["userId", "roles", "name", "email"]; // Regular members need email

      console.log(
        "🔍 DEBUG addMemberToGroup - requiredMemberFields:",
        requiredMemberFields,
      );

      validateRequiredFields(memberData, requiredMemberFields);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const callingUserId = request.auth.uid;

      // Validate permissions: Check if calling user has appropriate role
      // Permission rules:
      // - club-admin: Can add any member type (player, youth, coach, admin)
      // - admin (in group): Can add players and youth players only
      // - coach: Cannot add members
      const callingUserDoc = await admin
        .firestore()
        .collection("users")
        .doc(callingUserId)
        .get();

      if (!callingUserDoc.exists) {
        throw new HttpsError("not-found", "Calling user profile not found");
      }

      const callingUserData = callingUserDoc.data();
      const clubAccess = callingUserData?.clubAccess || [];
      const userClubAccess = clubAccess.find((c: any) => c.clubId === clubId);

      if (!userClubAccess) {
        throw new HttpsError(
          "permission-denied",
          "You do not have access to this club",
        );
      }

      // Check if user is club-admin OR has admin role in this specific group
      const isClubAdmin = userClubAccess.role === "club-admin";
      const groupAccess = userClubAccess.groupAccess || [];
      const userGroupAccess = groupAccess.find(
        (g: any) => g.groupId === groupId,
      );
      const isGroupAdmin =
        userGroupAccess && userGroupAccess.roles.includes("admin");

      // Determine what roles are being added
      const rolesBeingAdded = memberData.roles || [];
      const isAddingStaffRole = rolesBeingAdded.some((role: string) =>
        ["admin", "coach"].includes(role),
      );

      // Permission check based on what's being added
      if (isAddingStaffRole) {
        // Adding coach or admin - requires club-admin OR valid pending invitation
        if (!isClubAdmin) {
          // Check if there's a valid pending invitation for this user to join as coach/admin
          // This handles the invitation acceptance flow where the invitee is not a club-admin
          const targetUserId = memberData.userId;

          // Get target user's email to also check by email
          const targetUserDoc = await admin
            .firestore()
            .collection("users")
            .doc(targetUserId)
            .get();

          const targetUserEmail = targetUserDoc.exists
            ? targetUserDoc.data()?.email?.toLowerCase()
            : null;

          // Query invitations by userId OR email
          let hasValidInvitation = false;

          // Check by userId
          const invitationByUserIdQuery = await admin
            .firestore()
            .collection("invitations")
            .where("userId", "==", targetUserId)
            .where("groupId", "==", groupId)
            .where("status", "==", "pending")
            .limit(1)
            .get();

          if (!invitationByUserIdQuery.empty) {
            const inviteData = invitationByUserIdQuery.docs[0].data();
            // Verify the role matches what's being added
            const inviteRole = inviteData.role;
            if (
              rolesBeingAdded.includes(inviteRole) ||
              (inviteRole === "coach" && rolesBeingAdded.includes("coach")) ||
              (inviteRole === "admin" && rolesBeingAdded.includes("admin"))
            ) {
              hasValidInvitation = true;
              console.log(
                `✅ Valid pending invitation found by userId for role: ${inviteRole}`,
              );
            }
          }

          // If not found by userId, check by email
          if (!hasValidInvitation && targetUserEmail) {
            const invitationByEmailQuery = await admin
              .firestore()
              .collection("invitations")
              .where("email", "==", targetUserEmail)
              .where("groupId", "==", groupId)
              .where("status", "==", "pending")
              .limit(1)
              .get();

            if (!invitationByEmailQuery.empty) {
              const inviteData = invitationByEmailQuery.docs[0].data();
              const inviteRole = inviteData.role;
              if (
                rolesBeingAdded.includes(inviteRole) ||
                (inviteRole === "coach" && rolesBeingAdded.includes("coach")) ||
                (inviteRole === "admin" && rolesBeingAdded.includes("admin"))
              ) {
                hasValidInvitation = true;
                console.log(
                  `✅ Valid pending invitation found by email for role: ${inviteRole}`,
                );
              }
            }
          }

          if (!hasValidInvitation) {
            throw new HttpsError(
              "permission-denied",
              "Only club administrators can add coaches and admins to groups.",
            );
          }
        }
      } else {
        // Adding player or player-underage - requires club-admin, group admin, or valid invitation
        if (!isClubAdmin && !isGroupAdmin) {
          // Check if there's a valid pending/accepted invitation for this user
          // This handles the invitation acceptance flow where the invitee adds themselves
          const targetUserId = memberData.userId;

          const targetUserDoc = await admin
            .firestore()
            .collection("users")
            .doc(targetUserId)
            .get();

          const targetUserEmail = targetUserDoc.exists
            ? targetUserDoc.data()?.email?.toLowerCase()
            : null;

          let hasValidInvitation = false;

          // Check by userId (pending or accepted_pending_signup)
          const invitationByUserIdQuery = await admin
            .firestore()
            .collection("invitations")
            .where("userId", "==", targetUserId)
            .where("groupId", "==", groupId)
            .where("status", "in", ["pending", "accepted_pending_signup"])
            .limit(1)
            .get();

          if (!invitationByUserIdQuery.empty) {
            hasValidInvitation = true;
            console.log(`✅ Valid invitation found by userId for player role`);
          }

          // If not found by userId, check by email
          if (!hasValidInvitation && targetUserEmail) {
            const invitationByEmailQuery = await admin
              .firestore()
              .collection("invitations")
              .where("email", "==", targetUserEmail)
              .where("groupId", "==", groupId)
              .where("status", "in", ["pending", "accepted_pending_signup"])
              .limit(1)
              .get();

            if (!invitationByEmailQuery.empty) {
              hasValidInvitation = true;
              console.log(`✅ Valid invitation found by email for player role`);
            }
          }

          if (!hasValidInvitation) {
            throw new HttpsError(
              "permission-denied",
              "Insufficient permissions. Only club administrators and group admins can add members to groups.",
            );
          }
        }
      }

      console.log(
        `Permission validated for user ${callingUserId} (${isClubAdmin ? "club-admin" : isGroupAdmin ? "group admin" : "invitation-based"})`,
      );
      console.log(
        `Adding member ${memberData.userId} to group ${groupId} in club ${clubId}`,
      );

      // Get club document to check subscription limits
      const clubRef = admin.firestore().collection("clubs").doc(clubId);
      const clubDoc = await clubRef.get();

      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      const clubData = clubDoc.data() || null;
      const currentTotalMembers = clubData?.totalCounts || 0;
      const subscriptionTier = getClubSubscriptionTier(clubData);

      // Check if club can add more members based on subscription tier
      const clubLimitCheck = checkClubMemberLimit(
        currentTotalMembers,
        subscriptionTier,
      );
      if (!clubLimitCheck.allowed) {
        console.log(
          `❌ Club ${clubId} has reached member limit: ${currentTotalMembers}/${clubLimitCheck.maxLimit} (tier: ${subscriptionTier})`,
        );
        throw new HttpsError("resource-exhausted", clubLimitCheck.message);
      }

      // Verify group exists
      const groupRef = admin
        .firestore()
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId);

      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) {
        throw new HttpsError("not-found", "Group not found");
      }

      // Get current group allMembers document
      const groupMemberRef = admin
        .firestore()
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId)
        .collection("allMembers")
        .doc("members");

      const groupMembersDoc = await groupMemberRef.get();
      if (!groupMembersDoc.exists) {
        throw new HttpsError("not-found", "Group members document not found");
      }

      const groupMembersData = groupMembersDoc.data();
      const currentMembers = groupMembersData?.members || [];

      // Note: Member limits are now enforced at the CLUB level (checked above)
      // Group-level maxMembers is no longer used

      // 🆕 REACTIVATION LOGIC: Check if user already exists (including inactive members)
      const existingMember = currentMembers.find(
        (m: any) => m.userId === memberData.userId,
      );

      if (existingMember) {
        // Check if member is inactive
        if (existingMember.isActive === false) {
          const now = new Date();
          const scheduledDeletion = existingMember.scheduledForDeletion
            ? existingMember.scheduledForDeletion.toDate
              ? existingMember.scheduledForDeletion.toDate()
              : new Date(existingMember.scheduledForDeletion)
            : null;

          // Check if within grace period (30 days)
          if (scheduledDeletion && now < scheduledDeletion) {
            console.log(
              `♻️ Reactivating member ${memberData.userId} - within grace period`,
            );

            // Note: Club-level member limit already checked above

            // Reactivate the member by merging new roles with existing data
            const memberIndex = currentMembers.findIndex(
              (m: any) => m.userId === memberData.userId,
            );
            if (memberIndex >= 0) {
              // Merge roles (avoid duplicates)
              const existingRoles = existingMember.roles || [];
              const newRoles = memberData.roles || [];
              const mergedRoles = [...new Set([...existingRoles, ...newRoles])];

              currentMembers[memberIndex] = {
                ...existingMember,
                ...memberData,
                roles: mergedRoles,
                isActive: true,
                inactiveSince: null,
                scheduledForDeletion: null,
                reactivatedAt: now,
                reactivationCount: (existingMember.reactivationCount || 0) + 1,
                lastModifiedAt: now,
              };

              await groupMemberRef.update({
                members: currentMembers,
                lastUpdated: FieldValue.serverTimestamp(),
                memberCount: FieldValue.increment(1),
                version: FieldValue.increment(1),
                lastModified: FieldValue.serverTimestamp(),
              });

              console.log(
                `✅ Member reactivated with roles: [${mergedRoles.join(", ")}]`,
              );
            }
          } else {
            // Grace period expired - treat as new member (overwrite inactive entry)
            console.log(
              `⚠️ Member ${memberData.userId} grace period expired - treating as new member`,
            );

            // Note: Club-level member limit already checked above

            const memberIndex = currentMembers.findIndex(
              (m: any) => m.userId === memberData.userId,
            );
            if (memberIndex >= 0) {
              currentMembers[memberIndex] = {
                ...memberData,
                isActive: true,
                inactiveSince: null,
                scheduledForDeletion: null,
                reactivatedAt: now,
                reactivationCount: (existingMember.reactivationCount || 0) + 1,
                lastModifiedAt: now,
              };

              await groupMemberRef.update({
                members: currentMembers,
                lastUpdated: FieldValue.serverTimestamp(),
                memberCount: FieldValue.increment(1),
                version: FieldValue.increment(1),
                lastModified: FieldValue.serverTimestamp(),
              });
            }
          }
        } else {
          // Member is already active
          return {
            success: false,
            error: "User is already a member of this group",
          };
        }
      } else {
        // New member - add to group
        // Note: Club-level member limit already checked above

        // Add to group
        await groupMemberRef.update({
          members: FieldValue.arrayUnion({
            ...memberData,
            isActive: true,
            lastModifiedAt: new Date(),
          }),
          lastUpdated: FieldValue.serverTimestamp(),
          memberCount: FieldValue.increment(1),
          version: FieldValue.increment(1),
          lastModified: FieldValue.serverTimestamp(),
        });
      }

      // Update group member count
      await groupRef.update({
        membersCount: FieldValue.increment(1),
        version: FieldValue.increment(1), // Increment version
        lastModified: FieldValue.serverTimestamp(),
      });

      console.log(
        `Successfully added member ${memberData.userId} to group ${groupId}`,
      );

      return {
        success: true,
        message: `Member added to group successfully`,
      };
    } catch (error) {
      console.error("Error in addMemberToGroup:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to add member to group");
    }
  },
);
