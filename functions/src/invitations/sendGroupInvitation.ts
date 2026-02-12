import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createNotificationDirect } from "../notifications/createNotification";
import {
  CreateNotificationRequest,
  GroupInvitationRequest,
  InvitationResult,
} from "../types/interfaces";
import { config } from "../utils/config";
import {
  emailTransporter,
  groupInvitationWithActionsTemplate,
  guardianInvitationTemplate,
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

      // Validate required fields
      validateRequiredFields(request.data, [
        "emails",
        "clubId",
        "clubName",
        "groupId",
        "groupName",
        "inviterName",
      ]);
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

          // STEP 2: Generate invitation token
          const invitationToken = db.collection("invitations").doc().id;

          // STEP 3: Create invitation document (source of truth for both user types)
          const invitationData: any = {
            email: normalizedEmail,
            clubId,
            clubName,
            groupId,
            groupName,
            inviterName,
            inviterUid: actualInviterUid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            used: false,
            status: "pending",
            type: "group_invitation",
            workflowVersion: "3.0", // Updated to Version 3.0 (dual-storage architecture)
            respondedAt: null,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            isExistingUser: userExists,
            userId: existingUserId,

            // Role assignment
            role: role || "player", // Store role for later assignment (default to 'player')

            // Youth-specific fields (optional)
            invitationType: invitationType || "regular",
            youthData: youthData || null,
            existingYouthData: existingYouthData || null,
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
              const notificationType =
                invitationType === "youth_member" ||
                invitationType === "youth_member_existing"
                  ? "youth_member_invitation"
                  : "group_invitation";
              const notificationTitle =
                invitationType === "youth_member" ||
                invitationType === "youth_member_existing"
                  ? "New Child Invitation"
                  : "Group Invitation";

              // Create role-aware notification message
              let notificationMessage: string;
              if (invitationType === "youth_member") {
                notificationMessage = `Add ${youthData?.childName || "child"} to ${groupName}`;
              } else if (invitationType === "youth_member_existing") {
                notificationMessage = `Add ${existingYouthData?.youthName || "child"} to ${groupName}`;
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
                  groupId,
                  groupName,
                  youthData:
                    invitationType === "youth_member" ? youthData : undefined,
                  priority: "normal",
                  metadata: {
                    action: "new_member",
                    role: role || "player",
                    ...(invitationType === "youth_member_existing" &&
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
              if (
                (invitationType === "youth_member" ||
                  invitationType === "youth_member_existing") &&
                (youthData || existingYouthData)
              ) {
                // Youth member invitation - use guardian template
                const childName =
                  youthData?.childName ||
                  existingYouthData?.youthName ||
                  "your child";
                emailHtml = guardianInvitationTemplate(
                  childName,
                  groupName,
                  inviterName,
                  `${config.baseUrl}/signup?invite=${invitationToken}`,
                );
                emailSubject = `Your child ${childName} has been invited to ${groupName}`;
                console.log(
                  `📧 Sending guardian invitation email for ${childName}`,
                );
              } else {
                // Regular invitation - use standard template
                emailHtml = groupInvitationWithActionsTemplate(
                  groupName,
                  clubName,
                  inviterName,
                  acceptLink,
                  rejectLink,
                );
                emailSubject = `Invitation to join ${groupName} on Sportnizer`;
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
