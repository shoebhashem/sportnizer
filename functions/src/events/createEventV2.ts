import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createNotificationDirect } from "../notifications/createNotification";
import {
    CreateEventRequestV2,
    CreateEventResponse,
    EventDocument,
    EventResponse,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Creates a new event with intelligent recipient targeting and notifications
 *
 * Features:
 * - Default recipients: All members at target level (club/group/subgroup)
 * - Optional role filtering
 * - Automatic notification sending to all invited users
 * - Permission validation via existing permission service
 *
 * @param request - Event creation data
 * @returns Promise with event ID on success
 *
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('permission-denied') - User lacks permission to create event
 * @throws HttpsError('invalid-argument') - Missing required fields
 * @throws HttpsError('not-found') - Club or group doesn't exist
 */
export const createEventV2 = onCall(
  { region: config.region },
  async (request): Promise<CreateEventResponse> => {
    try {
      // ============================================================================
      // STEP 1: Authentication & Validation
      // ============================================================================
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;
      const data: CreateEventRequestV2 = request.data;

      // Validate required fields
      validateRequiredFields(data, [
        "clubId",
        "clubName",
        "eventType",
        "title",
        "startDate",
        "endDate",
        "targetScope",
        "createdBy",
        "createdByName",
      ]);

      validateRequiredFields(data.targetScope, ["level"]);

      const db = admin.firestore();

      console.log(
        `📅 Creating event "${data.title}" for ${data.targetScope.level} level`,
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
        // For club-level events, user must be club-admin
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();

        const clubAccess = userData?.clubAccess?.find(
          (ca: any) => ca.clubId === clubId,
        );
        if (!clubAccess || clubAccess.role !== "club-admin") {
          throw new HttpsError(
            "permission-denied",
            "Only club administrators can create club-wide events",
          );
        }
      } else if (
        targetScope.level === "group" ||
        targetScope.level === "subgroup"
      ) {
        // For group/subgroup events, user must be club-admin OR admin/coach of the group
        if (!targetScope.groupId) {
          throw new HttpsError(
            "invalid-argument",
            "groupId is required for group/subgroup events",
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
              "Only group admins and coaches can create group events",
            );
          }
        }
        // If isClubAdmin is true, permission is granted
      }

      // ============================================================================
      // STEP 3: Build Invited Users List
      // ============================================================================
      let invitedUserIds: string[] = [];
      let membersDocRef: admin.firestore.DocumentReference;
      let shouldFilterByIsActive = true; // Default: filter by isActive (soft delete)

      if (targetScope.level === "club") {
        // Get all club members document
        membersDocRef = db
          .collection("clubs")
          .doc(clubId)
          .collection("allMembers")
          .doc("members");
        // Club level: filter by isActive (soft delete pattern)
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
        // Group level: filter by isActive (soft delete pattern)
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

      // Filter: For club/group level, only include active members (exclude soft-deleted)
      // For subgroup level, include all members (hard delete - no isActive check)
      let members = shouldFilterByIsActive
        ? allMembers.filter((m: any) => m.isActive !== false)
        : allMembers;

      // Apply role filter if specified
      if (data.roleFilter && data.roleFilter.length > 0) {
        members = members.filter((m: any) =>
          m.roles?.some((role: any) => data.roleFilter!.includes(role as any)),
        );
      }

      // Apply selected member filter if specified
      if (data.selectedMemberIds && data.selectedMemberIds.length > 0) {
        members = members.filter((m: any) =>
          data.selectedMemberIds!.includes(m.userId),
        );
      }

      if (members.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "No members found matching the criteria",
        );
      }

      // Extract user IDs and build responses array
      const responses: EventResponse[] = [];

      for (const memberData of members) {
        // Check if this is a youth member (needs guardian)
        if (
          memberData.needsGuardian &&
          memberData.guardiansContacts &&
          memberData.guardiansContacts.length > 0
        ) {
          console.log(
            `👶 Youth member detected: ${memberData.name}, inviting guardians`,
          );

          // For youth members: invite all guardians (not the youth directly)
          for (const guardian of memberData.guardiansContacts) {
            if (
              guardian.guardianUid &&
              !invitedUserIds.includes(guardian.guardianUid)
            ) {
              invitedUserIds.push(guardian.guardianUid);
            }
          }

          // Create response object for the youth member (but guardians will respond)
          responses.push({
            userId: memberData.userId, // Youth's userId for tracking
            userName: memberData.name || "Unknown",
            photoUrl: memberData.photoURL || null,
            response: "pending",
            isYouthMember: true,
            guardianIds: memberData.guardiansContacts
              .map((g: any) => g.guardianUid)
              .filter((id: string) => id),
            guardianNames: memberData.guardiansContacts
              .map((g: any) => g.guardianName || g.guardianEmail)
              .filter((n: string) => n),
          });
        } else {
          // Regular adult member
          invitedUserIds.push(memberData.userId);

          responses.push({
            userId: memberData.userId,
            userName: memberData.name || "Unknown",
            photoUrl: memberData.photoURL || null,
            response: "pending",
          });
        }
      }

      console.log(`📋 Found ${invitedUserIds.length} members to invite`);

      // ============================================================================
      // STEP 3.5: Ensure Creator Can Always See Event
      // ============================================================================
      // Always add creator to invitedUserIds so they can view/edit the event.
      // Events are queried via invitedUserIds (array-contains), so this is
      // required for the creator to see the event in their list.
      if (!invitedUserIds.includes(data.createdBy)) {
        invitedUserIds.push(data.createdBy);
        console.log(`✅ Added creator ${data.createdBy} to invitedUserIds`);
      }

      // Only add creator to responses[] if they are already a group member.
      // A club-admin who is not in the group should NOT appear as a respondent
      // — they can still view & manage the event via invitedUserIds + createdBy.
      const creatorInResponses = responses.some(
        (r) => r.userId === data.createdBy,
      );
      const creatorIsGroupMember = members.some(
        (m: any) => m.userId === data.createdBy,
      );
      if (!creatorInResponses && creatorIsGroupMember) {
        // Fetch creator profile for name/photo
        const creatorDoc = await db
          .collection("users")
          .doc(data.createdBy)
          .get();
        const creatorData = creatorDoc.data();

        responses.push({
          userId: data.createdBy,
          userName:
            creatorData?.displayName || data.createdByName || "Event Creator",
          photoUrl: creatorData?.photoURL || null,
          response: "pending",
        });
        console.log(
          `✅ Added creator ${data.createdBy} to responses array (is group member)`,
        );
      } else if (!creatorInResponses) {
        console.log(
          `ℹ️ Creator ${data.createdBy} is not a group member — added to invitedUserIds only (not responses)`,
        );
      }

      // ============================================================================
      // STEP 4: Create Event Document
      // ============================================================================
      const eventRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("events")
        .doc();

      // Parse dates - use startTime/endTime if provided (contains actual time),
      // otherwise fall back to startDate/endDate (date-only strings)
      const startDate = Timestamp.fromDate(
        new Date(data.startTime || data.startDate),
      );
      const endDate = Timestamp.fromDate(
        new Date(data.endTime || data.endDate),
      );

      // Parse gathering time: frontend now sends full ISO timestamp
      const gatheringTime = data.gatheringTime
        ? Timestamp.fromDate(new Date(data.gatheringTime))
        : null;

      const responseDeadline = data.responseDeadline
        ? Timestamp.fromDate(new Date(data.responseDeadline))
        : null;

      const eventDocument: EventDocument = {
        eventId: eventRef.id,
        title: data.title,
        description: data.description || null,
        eventType: data.eventType,
        startDate,
        endDate,
        gatheringTime,
        responseDeadline,
        location: data.location || null,
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
        invitedUserIds,
        roleFilter: data.roleFilter || null,
        capacity: data.capacityLimit
          ? {
              min: null,
              max: data.capacityLimit,
            }
          : null,
        responses,
        responseSummary: {
          totalInvited: responses.length,
          accepted: 0,
          declined: 0,
          pending: responses.length,
        },
        createdBy: data.createdBy,
        createdByName: data.createdByName,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        status: "scheduled",
        isActive: true,
        version: 1, // Version field for future notification system
      };

      await eventRef.set(eventDocument);

      console.log(`✅ Event created: ${eventRef.id}`);

      // ============================================================================
      // STEP 5: Send Notifications to All Invited Users
      // Personalized: guardians see the youth member's name in the message.
      // Derive the guardian→youth mapping from the `responses` array (same
      // source the frontend uses to render per-invitee event cards).
      // ============================================================================

      const eventDateStr = new Date(data.startDate).toLocaleDateString();

      // Build one notification job per invitee:
      //   - youth member  → one job per guardian, actionUrl points to the youth's inviteeUserId
      //   - direct member → one job for themselves
      type NotificationJob = {
        targetUserId: string;
        message: string;
        inviteeUserId: string;
        inviteeName: string;
      };

      const notificationJobs: NotificationJob[] = [];

      for (const resp of responses) {
        if (
          resp.isYouthMember &&
          resp.guardianIds &&
          resp.guardianIds.length > 0
        ) {
          // One notification per guardian, linking to the youth player's context
          for (const guardianId of resp.guardianIds) {
            notificationJobs.push({
              targetUserId: guardianId,
              message: `${resp.userName || "Your child"} has been invited to ${data.title} on ${eventDateStr}`,
              inviteeUserId: resp.userId,
              inviteeName: resp.userName || "",
            });
          }
        } else {
          // Direct member: notify themselves with their own invitee context
          notificationJobs.push({
            targetUserId: resp.userId,
            message: `You've been invited to ${data.title} on ${eventDateStr}`,
            inviteeUserId: resp.userId,
            inviteeName: resp.userName || "",
          });
        }
      }

      console.log(
        `📬 Sending ${notificationJobs.length} notifications (from ${responses.length} invitees)...`,
      );

      const notificationPromises = notificationJobs.map(async (job) => {
        try {
          await createNotificationDirect(job.targetUserId, {
            type: "event",
            title: `New Event: ${data.title}`,
            message: job.message,
            sourceId: eventRef.id,
            sourceCollection: "events",
            clubId,
            clubName: data.clubName,
            ...(targetScope.groupId && { groupId: targetScope.groupId }),
            ...(targetScope.groupName && { groupName: targetScope.groupName }),
            priority: "normal",
            actionUrl: `/event-details?eventId=${eventRef.id}&clubId=${clubId}&inviteeUserId=${job.inviteeUserId}&inviteeName=${encodeURIComponent(job.inviteeName)}`,
          });
        } catch (notifError: any) {
          console.error(
            `⚠️ Failed to send notification to user ${job.targetUserId}:`,
            notifError.message,
          );
          // Don't throw - notification failure shouldn't block event creation
        }
      });

      await Promise.all(notificationPromises);

      console.log(`✅ Notifications sent successfully`);

      // ============================================================================
      // STEP 6: Return Success Response
      // ============================================================================
      return {
        success: true,
        eventId: eventRef.id,
        totalRecipients: notificationJobs.length,
        message: `Event created successfully with ${notificationJobs.length} invitations sent`,
        // Note: totalRecipients counts notification jobs (may exceed invitedUserIds.length
        // when a guardian has multiple youth players in the same event).
      };
    } catch (error: any) {
      console.error("❌ Error in createEventV2:", error);

      // Re-throw HttpsError instances
      if (error instanceof HttpsError) {
        throw error;
      }

      // Wrap other errors
      throw new HttpsError(
        "internal",
        `Failed to create event: ${error.message}`,
      );
    }
  },
);
