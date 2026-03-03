import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createNotificationDirect } from "../notifications/createNotification";
import {
    CreateNewsRequest,
    CreateNewsResponse,
    NewsDocument,
} from "../types/interfaces";
import { config } from "../utils/config";
import { emailTransporter, newsEmailTemplate } from "../utils/email";
import { validateRequiredFields } from "../utils/validation";

/**
 * Creates a new news item with intelligent recipient targeting and notifications
 *
 * Features:
 * - Target levels: club/group/subgroup
 * - Optional role filtering
 * - Automatic notification sending to all recipients
 * - Optional email delivery
 * - Permission validation (club-admin or group admin/coach)
 *
 * @param request - News creation data
 * @returns Promise with news ID on success
 *
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('permission-denied') - User lacks permission to create news
 * @throws HttpsError('invalid-argument') - Missing required fields
 * @throws HttpsError('not-found') - Club or group doesn't exist
 */
export const createNews = onCall(
  { region: config.region },
  async (request): Promise<CreateNewsResponse> => {
    try {
      // ============================================================================
      // STEP 1: Authentication & Validation
      // ============================================================================
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;
      const data: CreateNewsRequest = request.data;

      // Validate required fields
      validateRequiredFields(data, [
        "clubId",
        "clubName",
        "title",
        "description",
        "targetScope",
        "createdBy",
        "createdByName",
      ]);

      validateRequiredFields(data.targetScope, ["level"]);

      // Validate character limits
      if (data.title.length > 100) {
        throw new HttpsError(
          "invalid-argument",
          "Title must be 100 characters or less",
        );
      }

      if (data.description.length > 4200) {
        throw new HttpsError(
          "invalid-argument",
          "Description must be 4200 characters or less",
        );
      }

      const db = admin.firestore();

      console.log(
        `📰 Creating news "${data.title}" for ${data.targetScope.level} level`,
      );

      // ============================================================================
      // STEP 2: Permission Validation
      // ============================================================================
      const clubId = data.clubId;
      const targetScope = data.targetScope;

      // Verify club exists
      const clubDoc = await db.collection("clubs").doc(clubId).get();
      if (!clubDoc.exists) {
        throw new HttpsError("not-found", `Club ${clubId} not found`);
      }

      // Permission check based on target scope
      if (targetScope.level === "club") {
        // For club-level news, user must be club-admin
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();

        const clubAccess = userData?.clubAccess?.find(
          (ca: any) => ca.clubId === clubId,
        );
        if (!clubAccess || clubAccess.role !== "club-admin") {
          throw new HttpsError(
            "permission-denied",
            "Only club administrators can create club-wide news",
          );
        }
      } else if (
        targetScope.level === "group" ||
        targetScope.level === "subgroup"
      ) {
        // For group/subgroup news, user must be club-admin OR admin/coach of the group
        if (!targetScope.groupId) {
          throw new HttpsError(
            "invalid-argument",
            "groupId is required for group/subgroup news",
          );
        }

        // Verify group exists
        const groupDoc = await db
          .collection("clubs")
          .doc(clubId)
          .collection("groups")
          .doc(targetScope.groupId)
          .get();

        if (!groupDoc.exists) {
          throw new HttpsError(
            "not-found",
            `Group ${targetScope.groupId} not found`,
          );
        }

        // Check user's permissions
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();

        const clubAccess = userData?.clubAccess?.find(
          (ca: any) => ca.clubId === clubId,
        );

        // Check if user is club-admin (full access to all groups in club)
        const isClubAdmin = clubAccess?.role === "club-admin";

        if (!isClubAdmin) {
          // For non-club-admins, check group-specific roles
          const groupAccess = clubAccess?.groupAccess?.find(
            (g: any) => g.groupId === targetScope.groupId,
          );

          if (!groupAccess) {
            throw new HttpsError(
              "permission-denied",
              "You are not a member of this group",
            );
          }

          const hasPermission =
            groupAccess.roles?.includes("admin") ||
            groupAccess.roles?.includes("coach");
          if (!hasPermission) {
            throw new HttpsError(
              "permission-denied",
              "Only group admins and coaches can create group news",
            );
          }
        }
        // If isClubAdmin is true, permission is granted
      }

      // ============================================================================
      // STEP 3: Build Recipients List
      // ============================================================================
      let recipientUserIds: string[] = [];
      const recipientEmails: { email: string; name: string }[] = [];
      let membersDocRef: admin.firestore.DocumentReference;
      let shouldFilterByIsActive = true;

      if (targetScope.level === "club") {
        // Get all club members document
        membersDocRef = db
          .collection("clubs")
          .doc(clubId)
          .collection("allMembers")
          .doc("members");
        shouldFilterByIsActive = true;
      } else if (targetScope.level === "group") {
        // Get all group members document
        membersDocRef = db
          .collection("clubs")
          .doc(clubId)
          .collection("groups")
          .doc(targetScope.groupId!)
          .collection("allMembers")
          .doc("members");
        shouldFilterByIsActive = true;
      } else if (targetScope.level === "subgroup") {
        // Get all subgroup members document
        membersDocRef = db
          .collection("clubs")
          .doc(clubId)
          .collection("groups")
          .doc(targetScope.groupId!)
          .collection("subgroups")
          .doc(targetScope.subgroupId!)
          .collection("allMembers")
          .doc("members");
        // Subgroup level: NO isActive filter (hard delete pattern)
        shouldFilterByIsActive = false;
      } else {
        throw new HttpsError("invalid-argument", "Invalid target scope level");
      }

      // Read the members document
      const membersDoc = await membersDocRef.get();

      if (!membersDoc.exists) {
        throw new HttpsError(
          "failed-precondition",
          `No members document found for this ${targetScope.level}`,
        );
      }

      // Get members array from document
      const membersData = membersDoc.data();
      let allMembers = membersData?.members || [];

      if (allMembers.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "No members found matching the criteria",
        );
      }

      // Filter: For club/group level, only include active members
      let members = shouldFilterByIsActive
        ? allMembers.filter((m: any) => m.isActive !== false)
        : allMembers;

      // Apply role filter if specified
      if (data.roleFilter && data.roleFilter.length > 0) {
        members = members.filter((m: any) =>
          m.roles?.some((role: any) => data.roleFilter!.includes(role as any)),
        );
      }

      if (members.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "No members found matching the criteria",
        );
      }

      // Extract user IDs (for youth members, add guardians)
      for (const memberData of members) {
        if (
          memberData.needsGuardian &&
          memberData.guardiansContacts &&
          memberData.guardiansContacts.length > 0
        ) {
          console.log(
            `👶 Youth member detected: ${memberData.name}, adding guardians`,
          );

          // For youth members: add all guardians (not the youth directly)
          for (const guardian of memberData.guardiansContacts) {
            if (
              guardian.guardianUid &&
              !recipientUserIds.includes(guardian.guardianUid)
            ) {
              recipientUserIds.push(guardian.guardianUid);

              // Collect email for email delivery
              if (data.sendEmail && guardian.guardianEmail) {
                recipientEmails.push({
                  email: guardian.guardianEmail,
                  name: guardian.guardianName || guardian.guardianEmail,
                });
              }
            }
          }
        } else {
          // Regular adult member
          if (!recipientUserIds.includes(memberData.userId)) {
            recipientUserIds.push(memberData.userId);

            // Collect email for email delivery
            if (data.sendEmail && memberData.email) {
              recipientEmails.push({
                email: memberData.email,
                name: memberData.name || memberData.email,
              });
            }
          }
        }
      }

      console.log(`📋 Found ${recipientUserIds.length} recipients`);

      // Ensure creator can always see their news
      if (!recipientUserIds.includes(data.createdBy)) {
        recipientUserIds.push(data.createdBy);
        console.log(`✅ Added creator ${data.createdBy} to recipientUserIds`);
      }

      // ============================================================================
      // STEP 4: Create News Document
      // ============================================================================
      const newsRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("news")
        .doc();

      // Build target name for display
      const targetName =
        targetScope.level === "subgroup"
          ? targetScope.subgroupName || "Subgroup"
          : targetScope.level === "group"
            ? targetScope.groupName || "Group"
            : data.clubName;

      const newsDocument: NewsDocument = {
        newsId: newsRef.id,
        title: data.title,
        description: data.description,
        targetScope: {
          level: targetScope.level,
          clubId,
          clubName: data.clubName,
          ...(targetScope.groupId && { groupId: targetScope.groupId }),
          ...(targetScope.groupName && { groupName: targetScope.groupName }),
          ...(targetScope.subgroupId && { subgroupId: targetScope.subgroupId }),
          ...(targetScope.subgroupName && {
            subgroupName: targetScope.subgroupName,
          }),
        },
        recipientUserIds,
        roleFilter: data.roleFilter || null,
        emailDelivery: {
          enabled: data.sendEmail || false,
        },
        readBy: [],
        readCount: 0,
        createdBy: data.createdBy,
        createdByName: data.createdByName,
        createdAt: FieldValue.serverTimestamp(),
        isActive: true,
        version: 1,
      };

      await newsRef.set(newsDocument);

      console.log(`✅ News created: ${newsRef.id}`);

      // ============================================================================
      // STEP 5: Send Notifications to All Recipients
      // ============================================================================
      console.log(
        `📬 Sending notifications to ${recipientUserIds.length} users...`,
      );

      const notificationPromises = recipientUserIds.map(
        async (recipientUserId) => {
          try {
            await createNotificationDirect(recipientUserId, {
              type: "news",
              title: `News: ${data.title}`,
              message:
                data.description.length > 100
                  ? data.description.substring(0, 100) + "..."
                  : data.description,
              sourceId: newsRef.id,
              sourceCollection: "news",
              clubId,
              clubName: data.clubName,
              ...(targetScope.groupId && { groupId: targetScope.groupId }),
              ...(targetScope.groupName && {
                groupName: targetScope.groupName,
              }),
              priority: "normal",
              actionUrl: `/news/${newsRef.id}`,
            });
          } catch (notifError: any) {
            console.error(
              `⚠️ Failed to send notification to user ${recipientUserId}:`,
              notifError.message,
            );
            // Don't throw - notification failure shouldn't block news creation
          }
        },
      );

      await Promise.all(notificationPromises);

      console.log(`✅ Notifications sent successfully`);

      // ============================================================================
      // STEP 6: Send Emails (if enabled)
      // ============================================================================
      let emailsSent = 0;
      let emailsFailed = 0;

      if (data.sendEmail && recipientEmails.length > 0) {
        console.log(
          `📧 Sending emails to ${recipientEmails.length} recipients...`,
        );

        const emailPromises = recipientEmails.map(async ({ email, name }) => {
          try {
            const htmlContent = newsEmailTemplate(
              data.title,
              data.description,
              data.createdByName,
              targetName,
            );

            await emailTransporter.sendMail({
              from: config.email.from,
              to: email,
              subject: `${targetName}: ${data.title}`,
              html: htmlContent,
            });

            emailsSent++;
          } catch (emailError: any) {
            console.error(
              `⚠️ Failed to send email to ${email}:`,
              emailError.message,
            );
            emailsFailed++;
          }
        });

        await Promise.all(emailPromises);

        // Update news document with email delivery stats
        await newsRef.update({
          "emailDelivery.sentAt": FieldValue.serverTimestamp(),
          "emailDelivery.sentCount": emailsSent,
          "emailDelivery.failedCount": emailsFailed,
        });

        console.log(`✅ Emails sent: ${emailsSent}, failed: ${emailsFailed}`);
      }

      // ============================================================================
      // STEP 7: Return Success Response
      // ============================================================================
      return {
        success: true,
        newsId: newsRef.id,
        totalRecipients: recipientUserIds.length,
        emailsSent: data.sendEmail ? emailsSent : undefined,
        emailsFailed: data.sendEmail ? emailsFailed : undefined,
        message: `News created successfully with ${recipientUserIds.length} recipients${
          data.sendEmail ? ` and ${emailsSent} emails sent` : ""
        }`,
      };
    } catch (error: any) {
      console.error("❌ Error in createNews:", error);

      // Re-throw HttpsError instances
      if (error instanceof HttpsError) {
        throw error;
      }

      // Wrap other errors
      throw new HttpsError(
        "internal",
        `Failed to create news: ${error.message}`,
      );
    }
  },
);
