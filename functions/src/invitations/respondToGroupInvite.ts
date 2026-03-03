import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

export interface RespondToGroupInviteRequest {
  inviteId: string;
  action: "accept" | "reject";
  clubId: string;
  groupId: string;
}

export interface RespondToGroupInviteResponse {
  success: boolean;
  action: "accepted" | "rejected" | "error";
  message: string;
  error?: string;
}

export const respondToGroupInvite = onCall(
  {
    region: config.region,
  },
  async (request): Promise<RespondToGroupInviteResponse> => {
    try {
      const { inviteId, action, clubId, groupId }: RespondToGroupInviteRequest =
        request.data;

      // Validate required fields
      validateRequiredFields(request.data, [
        "inviteId",
        "action",
        "clubId",
        "groupId",
      ]);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      if (!["accept", "reject"].includes(action)) {
        throw new HttpsError(
          "invalid-argument",
          'Action must be either "accept" or "reject"',
        );
      }

      const userId = request.auth.uid;
      console.log(
        `User ${userId} responding to invitation ${inviteId} with action: ${action}`,
      );

      const db = admin.firestore();

      // Get user document
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User document not found");
      }

      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];

      // Find the club and invitation
      const clubIndex = clubAccess.findIndex(
        (club: any) => club.clubId === clubId,
      );
      if (clubIndex === -1) {
        throw new HttpsError("not-found", "Club not found in user access");
      }

      const groupInvites = clubAccess[clubIndex].groupInvites || [];
      const inviteIndex = groupInvites.findIndex(
        (invite: any) => invite.inviteId === inviteId,
      );
      if (inviteIndex === -1) {
        throw new HttpsError("not-found", "Invitation not found");
      }

      const invitation = groupInvites[inviteIndex];

      // Verify invitation is for the correct group and is still pending
      if (invitation.groupId !== groupId) {
        throw new HttpsError(
          "invalid-argument",
          "Invitation group ID mismatch",
        );
      }

      if (invitation.status !== "pending") {
        throw new HttpsError(
          "failed-precondition",
          "Invitation has already been responded to",
        );
      }

      if (action === "accept") {
        console.log(
          `✅ User accepted invitation to group ${invitation.groupName}`,
        );

        // Remove the invitation from groupInvites array
        clubAccess[clubIndex].groupInvites.splice(inviteIndex, 1);

        // If user doesn't have club access yet, add it
        if (!clubAccess[clubIndex].role) {
          clubAccess[clubIndex].role = "member";
          clubAccess[clubIndex].joinedAt = FieldValue.serverTimestamp();
        }

        // Add user to group access
        if (!clubAccess[clubIndex].groupAccess) {
          clubAccess[clubIndex].groupAccess = [];
        }

        // Check if user already has access to this group
        const existingGroupAccess = clubAccess[clubIndex].groupAccess.find(
          (group: any) => group.groupId === groupId,
        );

        if (!existingGroupAccess) {
          clubAccess[clubIndex].groupAccess.push({
            groupId: invitation.groupId,
            groupName: invitation.groupName,
            roles: ["player"], // Default role for invited members
            joinedAt: FieldValue.serverTimestamp(),
          });
        }

        // Update user document
        await userRef.update({
          clubAccess: clubAccess,
          lastModified: FieldValue.serverTimestamp(),
          version: FieldValue.increment(1),
        });

        // Add user to club and group using atomic functions with membership verification
        try {
          // STEP 1: Check if user is already a club member
          const clubMemberRef = admin
            .firestore()
            .collection("clubs")
            .doc(clubId)
            .collection("allMembers")
            .doc("members");

          const clubMembersDoc = await clubMemberRef.get();
          let isAlreadyClubMember = false;

          if (clubMembersDoc.exists) {
            const clubMembersData = clubMembersDoc.data();
            const members = clubMembersData?.members || [];
            isAlreadyClubMember = members.some(
              (member: any) => member.userId === userId,
            );
          }

          console.log(
            `🔍 User ${userId} club membership check: ${isAlreadyClubMember ? "Already member" : "Not a member"}`,
          );

          // STEP 2: Add to club membership if not already a member (using atomic function)
          if (!isAlreadyClubMember) {
            console.log(
              `📞 Calling addMemberToClub atomic function for user ${userId}`,
            );

            const clubMemberData = {
              userId: userId,
              name:
                userData?.displayName ||
                userData?.name ||
                userData?.email?.split("@")[0] ||
                "Unknown User",
              email: userData?.email || "",
              roles: ["player"],
              joinedAt: new Date(), // Use Date instead of serverTimestamp for consistency with orchestration service
              profilePictureUrl: userData?.photoURL || "",
              needsGuardian: false,
              guardiansContacts: [],
              addedBy: invitation.inviterUid,
            };

            // Call addMemberToClub atomic function (backend-to-backend)
            // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
            const addMemberToClubFunction =
              require("../members/addMemberToClub").addMemberToClub;
            const clubResult = await addMemberToClubFunction.run({
              auth: { uid: userId },
              data: {
                clubId: clubId,
                memberData: clubMemberData,
              },
            });

            if (!clubResult.success) {
              throw new Error(
                `Failed to add member to club: ${clubResult.error}`,
              );
            }
            console.log(
              "✅ User added to club membership successfully via atomic function",
            );

            // Update user profile with club info (using atomic function)
            console.log(
              `📞 Calling updateUserClubInfo atomic function for user ${userId}`,
            );
            const clubInfo = {
              clubId: clubId,
              clubName: invitation.clubName || "Unknown Club",
              role: "player",
              joinedAt: new Date(),
              lastModifiedAt: new Date(),
            };

            // Call updateUserClubInfo atomic function (backend-to-backend)
            // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
            const updateUserClubInfoFunction =
              require("../members/updateUserClubInfo").updateUserClubInfo;
            const userClubResult = await updateUserClubInfoFunction.run({
              auth: { uid: userId },
              data: {
                uid: userId,
                clubInfo: clubInfo,
                role: "player",
              },
            });

            if (!userClubResult.success) {
              throw new Error(
                `Failed to update user club info: ${userClubResult.error}`,
              );
            }
            console.log(
              "✅ User club info updated successfully via atomic function",
            );
          } else {
            console.log(
              "ℹ️ User already a club member, skipping club addition and profile update",
            );
          }

          // STEP 3: Check if user is already a group member
          const groupMemberRef = admin
            .firestore()
            .collection("clubs")
            .doc(clubId)
            .collection("groups")
            .doc(groupId)
            .collection("allMembers")
            .doc("members");

          const groupMembersDoc = await groupMemberRef.get();
          let isAlreadyGroupMember = false;

          if (groupMembersDoc.exists) {
            const groupMembersData = groupMembersDoc.data();
            const members = groupMembersData?.members || [];
            isAlreadyGroupMember = members.some(
              (member: any) => member.userId === userId,
            );
          }

          console.log(
            `🔍 User ${userId} group membership check: ${isAlreadyGroupMember ? "Already member" : "Not a member"}`,
          );

          // STEP 4: Add to group membership if not already a member (using atomic function)
          if (!isAlreadyGroupMember) {
            console.log(
              `📞 Calling addMemberToGroup atomic function for user ${userId}`,
            );

            const groupMemberData = {
              userId: userId,
              name:
                userData?.displayName ||
                userData?.name ||
                userData?.email?.split("@")[0] ||
                "Unknown User",
              email: userData?.email || "",
              roles: ["player"],
              joinedAt: new Date(), // Use Date instead of serverTimestamp for consistency
              profilePictureUrl: userData?.photoURL || "",
              needsGuardian: false,
              guardiansContacts: [],
              addedBy: invitation.inviterUid,
            };

            // Call addMemberToGroup atomic function (backend-to-backend)
            // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
            const addMemberToGroupFunction =
              require("../members/addMemberToGroup").addMemberToGroup;
            const groupResult = await addMemberToGroupFunction.run({
              auth: { uid: userId },
              data: {
                clubId: clubId,
                groupId: groupId,
                memberData: groupMemberData,
              },
            });

            if (!groupResult.success) {
              throw new Error(
                `Failed to add member to group: ${groupResult.error}`,
              );
            }
            console.log(
              "✅ User added to group membership successfully via atomic function",
            );

            // Update user profile with group info (using atomic function)
            console.log(
              `📞 Calling updateUserGroupInfo atomic function for user ${userId}`,
            );
            const groupInfo = {
              groupId: groupId,
              groupName: invitation.groupName,
              joinedAt: new Date(),
              lastModifiedAt: new Date(),
            };

            // Call updateUserGroupInfo atomic function (backend-to-backend)
            // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
            const updateUserGroupInfoFunction =
              require("../members/updateUserGroupInfo").updateUserGroupInfo;
            const userGroupResult = await updateUserGroupInfoFunction.run({
              auth: { uid: userId },
              data: {
                uid: userId,
                clubId: clubId,
                groupInfo: groupInfo,
                roles: ["player"],
                operation: "add",
              },
            });

            if (!userGroupResult.success) {
              throw new Error(
                `Failed to update user group info: ${userGroupResult.error}`,
              );
            }
            console.log(
              "✅ User group info updated successfully via atomic function",
            );
          } else {
            console.log(
              "ℹ️ User already a group member, skipping group addition and profile update",
            );
          }
        } catch (membershipError) {
          console.error(
            "❌ Error adding user to club/group via atomic functions:",
            membershipError,
          );
          throw new HttpsError(
            "internal",
            "Failed to add user to club/group membership",
          );
        }

        return {
          success: true,
          action: "accepted",
          message: `Successfully joined ${invitation.groupName}`,
        };
      } else {
        // action === 'reject'
        console.log(
          `❌ User rejected invitation to group ${invitation.groupName}`,
        );

        // Simply remove the invitation from groupInvites array
        clubAccess[clubIndex].groupInvites.splice(inviteIndex, 1);

        // If this was the only invitation and user has no other access to the club, remove club entry
        if (
          clubAccess[clubIndex].groupInvites.length === 0 &&
          (!clubAccess[clubIndex].groupAccess ||
            clubAccess[clubIndex].groupAccess.length === 0) &&
          !clubAccess[clubIndex].role
        ) {
          clubAccess.splice(clubIndex, 1);
        }

        // Update user document
        await userRef.update({
          clubAccess: clubAccess,
          lastModified: FieldValue.serverTimestamp(),
          version: FieldValue.increment(1),
        });

        return {
          success: true,
          action: "rejected",
          message: `Declined invitation to ${invitation.groupName}`,
        };
      }
    } catch (error) {
      console.error("Error in respondToGroupInvite:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to respond to group invitation");
    }
  },
);
