import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createNotificationDirect } from "../notifications/createNotification";
import {
    CreateNotificationRequest,
    GroupInvitationRequest,
    InvitationResult,
} from "../types/interfaces";
import { config } from "../utils/config";
import {
    clubAdminInvitationTemplate,
    emailTransporter,
    groupInvitationWithActionsTemplate,
    guardianInvitationTemplate,
    guardianRoleInvitationTemplate,
} from "../utils/email";
import {
    validateArrayField,
    validateRequiredFields,
} from "../utils/validation";

export const sendGroupInvitation = onCall(
  {
    region: config.region,
  },
  async (request) => {
    try {
      const {
        emails,
        clubId,
        clubName,
        groupId,
        groupName,
        inviterName,
        inviterUid,
        invitationType,
        youthData,
        existingYouthData,
        guardianData,
        role, // New: role to assign (coach or member)
      }: GroupInvitationRequest = request.data;

      // Debug logging
      console.log("🔍 sendGroupInvitation received data:", {
        emails: emails?.length,
        clubId,
        clubName,
        groupId,
        groupName,
        inviterName,
        inviterUid: inviterUid || request.auth?.uid,
        invitationType: invitationType || "regular",
        hasYouthData: !!youthData,
        hasExistingYouthData: !!existingYouthData,
      });

      // Validate required fields - groupId/groupName optional for club_admin
      const isClubAdminInvitation = invitationType === "club_admin";

      if (isClubAdminInvitation) {
        validateRequiredFields(request.data, [
          "emails",
          "clubId",
          "clubName",
          "inviterName",
        ]);
      } else {
        validateRequiredFields(request.data, [
          "emails",
          "clubId",
          "clubName",
          "groupId",
          "groupName",
          "inviterName",
        ]);
      }
      validateArrayField(emails, "emails");

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const actualInviterUid = inviterUid || request.auth.uid;

      const db = admin.firestore();
      const results: InvitationResult[] = [];

      for (const email of emails) {
        try {
          const normalizedEmail = email.trim().toLowerCase();

          // STEP 1: Detect user type by querying users collection
          console.log(
            `🔍 Checking if user exists for email: ${normalizedEmail}`,
          );
          const usersQuery = await db
            .collection("users")
            .where("email", "==", normalizedEmail)
            .limit(1)
            .get();

          const userExists = !usersQuery.empty;
          const existingUserId = userExists ? usersQuery.docs[0].id : null;

          if (userExists) {
            console.log(`✅ Existing user found: ${existingUserId}`);
          } else {
            console.log(`📧 New user - will send email invitation`);
          }

          // STEP 1b: Supersede any existing pending invitations for same email + group + role
          // This prevents stale invitations from creating duplicate enrollments
          const effectiveRole = isClubAdminInvitation
            ? "club-admin"
            : role || "player";
          const effectiveGroupId = isClubAdminInvitation ? null : groupId;

          const existingPendingQuery = await db
            .collection("invitations")
            .where("email", "==", normalizedEmail)
            .where("groupId", "==", effectiveGroupId)
            .where("role", "==", effectiveRole)
            .where("status", "==", "pending")
            .get();

          if (!existingPendingQuery.empty) {
            const batch = db.batch();
            for (const doc of existingPendingQuery.docs) {
              batch.update(doc.ref, {
                status: "superseded",
                supersededAt: FieldValue.serverTimestamp(),
                supersededReason: "new_invitation_sent",
              });
            }
            await batch.commit();
            console.log(
              `♻️ Superseded ${existingPendingQuery.size} old pending invitation(s) for ${normalizedEmail}`,
            );
          }

          // STEP 2: Generate invitation token
          const invitationToken = db.collection("invitations").doc().id;

          // STEP 3: Create invitation document (source of truth for both user types)
          const isClubAdminInvite = invitationType === "club_admin";
          const invitationData: any = {
            email: normalizedEmail,
            clubId,
            clubName,
            groupId: isClubAdminInvite ? null : groupId,
            groupName: isClubAdminInvite ? null : groupName,
            inviterName,
            inviterUid: actualInviterUid,
            createdAt: FieldValue.serverTimestamp(),
            used: false,
            status: "pending",
            type: isClubAdminInvite
              ? "club_admin_invitation"
              : "group_invitation",
            workflowVersion: "3.0", // Updated to Version 3.0 (dual-storage architecture)
            respondedAt: null,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            isExistingUser: userExists,
            userId: existingUserId,

            // Role assignment
            role: isClubAdminInvite ? "club-admin" : role || "player", // Store role for later assignment

            // Youth-specific fields (optional)
            invitationType: invitationType || "regular",
            youthData: youthData || null,
            existingYouthData: existingYouthData || null,
            guardianData: guardianData || null,
          };

          await db
            .collection("invitations")
            .doc(invitationToken)
            .set(invitationData);
          console.log(`📝 Invitation document created: ${invitationToken}`);

          // STEP 4: Dual-write for existing users OR email for new users
          if (userExists && existingUserId) {
            // EXISTING USER PATH: Create notification (dual write)
            try {
              let notificationType: string;
              let notificationTitle: string;

              if (invitationType === "club_admin") {
                notificationType = "club_admin_invitation";
                notificationTitle = "Club Admin Invitation";
              } else if (
                invitationType === "youth_member" ||
                invitationType === "youth_member_existing" ||
                invitationType === "youth_existing_new_guardian"
              ) {
                notificationType = "youth_member_invitation";
                notificationTitle = "New Child Invitation";
              } else if (invitationType === "guardian") {
                notificationType = "group_invitation";
                notificationTitle = "Guardian Invitation";
              } else {
                notificationType = "group_invitation";
                notificationTitle = "Group Invitation";
              }

              // Create role-aware notification message
              let notificationMessage: string;
              if (invitationType === "club_admin") {
                notificationMessage = `${inviterName} invited you to become a Club Admin for ${clubName}`;
              } else if (invitationType === "youth_member") {
                notificationMessage = `Add ${youthData?.childName || "child"} to ${groupName}`;
              } else if (
                invitationType === "youth_member_existing" ||
                invitationType === "youth_existing_new_guardian"
              ) {
                notificationMessage = `Add ${existingYouthData?.youthName || "child"} to ${groupName}`;
              } else if (invitationType === "guardian") {
                notificationMessage = `${inviterName} invited you to become a guardian for ${guardianData?.youthName || "a youth player"} in ${clubName}`;
              } else {
                // Get user-friendly role label
                const roleLabel =
                  role === "coach"
                    ? "coach"
                    : role === "admin"
                      ? "admin"
                      : role === "player-underage"
                        ? "youth player"
                        : "player";
                notificationMessage = `${inviterName} invited you to join ${groupName} as ${roleLabel}`;
              }

              const notificationId = await createNotificationDirect(
                existingUserId,
                {
                  type: notificationType,
                  title: notificationTitle,
                  message: notificationMessage,
                  invitationToken,
                  sourceCollection: "invitations",
                  clubId,
                  clubName,
                  groupId:
                    invitationType === "club_admin" ? undefined : groupId,
                  groupName:
                    invitationType === "club_admin" ? undefined : groupName,
                  youthData:
                    invitationType === "youth_member" ? youthData : undefined,
                  priority: "normal",
                  metadata: {
                    action:
                      invitationType === "club_admin"
                        ? "club_admin"
                        : "new_member",
                    role:
                      invitationType === "club_admin"
                        ? "club-admin"
                        : role || "player",
                    ...((invitationType === "youth_member_existing" ||
                      invitationType === "youth_existing_new_guardian") &&
                      existingYouthData?.youthUid && {
                        existingYouthUid: existingYouthData.youthUid,
                      }),
                  },
                } as Omit<CreateNotificationRequest, "userId">,
              );

              console.log(
                `✅ Notification created for existing user: ${notificationId}`,
              );
              console.log(
                `📱 Dual-write complete - invitation: ${invitationToken}, notification: ${notificationId}`,
              );
            } catch (notificationError) {
              console.error(
                `⚠️ Failed to create notification for user ${existingUserId}:`,
                notificationError,
              );
              // Continue - invitation still exists even if notification fails
            }
          } else {
            // NEW USER PATH: Send email invitation
            try {
              const acceptLink = `${config.baseUrl}/invitation/accept?token=${invitationToken}`;
              const rejectLink = `${config.baseUrl}/invitation/reject?token=${invitationToken}`;

              let emailHtml: string;
              let emailSubject: string;

              // Choose email template based on invitation type
              if (invitationType === "club_admin") {
                // Club admin invitation - use club admin template
                emailHtml = clubAdminInvitationTemplate(
                  clubName,
                  inviterName,
                  acceptLink,
                  rejectLink,
                );
                emailSubject = `You're invited to become a Club Admin for ${clubName} on Clubnizer`;
                console.log(`📧 Sending club admin invitation email`);
              } else if (
                (invitationType === "youth_member" ||
                  invitationType === "youth_member_existing" ||
                  invitationType === "youth_existing_new_guardian") &&
                (youthData || existingYouthData)
              ) {
                // Youth member invitation - use guardian template
                const childName =
                  youthData?.childName ||
                  existingYouthData?.youthName ||
                  "your child";
                emailHtml = guardianInvitationTemplate(
                  childName,
                  groupName || "",
                  inviterName,
                  `${config.baseUrl}/signup?invite=${invitationToken}`,
                );
                emailSubject = `Your child ${childName} has been invited to ${groupName}`;
                console.log(
                  `📧 Sending guardian invitation email for ${childName}`,
                );
              } else if (invitationType === "guardian") {
                // Guardian role invitation - use dedicated guardian role template
                const youthName = guardianData?.youthName || "a youth player";
                emailHtml = guardianRoleInvitationTemplate(
                  youthName,
                  groupName || "",
                  clubName,
                  inviterName,
                  acceptLink,
                  rejectLink,
                );
                emailSubject = `You're invited to be a guardian for ${youthName} in ${groupName} at ${clubName} on Clubnizer`;
                console.log(
                  `📧 Sending guardian role invitation email for youth: ${youthName}`,
                );
              } else {
                // Regular invitation - use standard template
                emailHtml = groupInvitationWithActionsTemplate(
                  groupName || "",
                  clubName,
                  inviterName,
                  acceptLink,
                  rejectLink,
                );
                emailSubject = `Invitation to join ${groupName} on Clubnizer`;
                console.log(`📧 Sending regular invitation email`);
              }

              const mailOptions = {
                from: config.email.from,
                to: normalizedEmail,
                subject: emailSubject,
                html: emailHtml,
              };

              await emailTransporter.sendMail(mailOptions);
              console.log(`📧 Email invitation sent to: ${normalizedEmail}`);
            } catch (emailError) {
              console.error(
                `⚠️ Failed to send email to ${normalizedEmail}:`,
                emailError,
              );
              throw emailError; // Fail this invitation if email fails
            }
          }

          results.push({
            email: normalizedEmail,
            success: true,
            invitationToken,
            isExistingUser: userExists,
          });
        } catch (error) {
          console.error(`❌ Error processing invitation for ${email}:`, error);
          results.push({
            email: email.trim().toLowerCase(),
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return {
        success: true,
        results,
      };
    } catch (error) {
      console.error("Error in sendGroupInvitation:", error);
      throw new HttpsError("internal", "Failed to send invitations");
    }
  },
);
