import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createNotificationDirect } from "../notifications/createNotification";
import {
  CreateRecurringEventRequest,
  CreateRecurringEventResponse,
  EventDocument,
  EventResponse,
  RecurringEventMaster,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Helper: Generate occurrence dates based on recurrence settings
 */
function generateOccurrenceDates(
  firstDate: Date,
  frequency: "weekly" | "biweekly" | "monthly",
  endType: "date" | "occurrences",
  seriesEndDate?: Date,
  occurrenceCount?: number,
): Date[] {
  const dates: Date[] = [new Date(firstDate)];
  const MAX_OCCURRENCES = 52; // Safety limit: max 1 year of weekly events

  let maxCount: number;
  if (endType === "occurrences") {
    maxCount = Math.min(occurrenceCount || 10, MAX_OCCURRENCES);
  } else {
    maxCount = MAX_OCCURRENCES; // Will be limited by endDate
  }

  let currentDate = new Date(firstDate);

  while (dates.length < maxCount) {
    const nextDate = new Date(currentDate);

    switch (frequency) {
      case "weekly":
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case "biweekly":
        nextDate.setDate(nextDate.getDate() + 14);
        break;
      case "monthly":
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
    }

    // Check if we've passed the end date
    if (endType === "date" && seriesEndDate && nextDate > seriesEndDate) {
      break;
    }

    dates.push(new Date(nextDate));
    currentDate = nextDate;
  }

  return dates;
}

/**
 * Creates a recurring event series with pre-generated occurrence documents
 *
 * This function:
 * 1. Validates permissions (same as createEventV2)
 * 2. Creates a RecurringEventMaster document
 * 3. Pre-generates all individual occurrence EventDocuments
 * 4. Sends notifications for the first occurrence only
 *
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('permission-denied') - User lacks permission
 * @throws HttpsError('invalid-argument') - Missing required fields or invalid recurrence settings
 */
export const createRecurringEvent = onCall(
  { region: config.region, timeoutSeconds: 120 },
  async (request): Promise<CreateRecurringEventResponse> => {
    try {
      // ============================================================================
      // STEP 1: Authentication & Validation
      // ============================================================================
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;
      const data: CreateRecurringEventRequest = request.data;

      validateRequiredFields(data, [
        "clubId",
        "clubName",
        "eventType",
        "title",
        "startDate",
        "startTime",
        "endDate",
        "endTime",
        "frequency",
        "endType",
        "targetScope",
        "createdBy",
        "createdByName",
      ]);

      // Validate recurrence end condition
      if (data.endType === "date" && !data.seriesEndDate) {
        throw new HttpsError(
          "invalid-argument",
          "seriesEndDate is required when endType is 'date'",
        );
      }
      if (data.endType === "occurrences" && !data.occurrenceCount) {
        throw new HttpsError(
          "invalid-argument",
          "occurrenceCount is required when endType is 'occurrences'",
        );
      }
      if (
        data.endType === "occurrences" &&
        (data.occurrenceCount! < 2 || data.occurrenceCount! > 52)
      ) {
        throw new HttpsError(
          "invalid-argument",
          "occurrenceCount must be between 2 and 52",
        );
      }

      const db = admin.firestore();
      const clubId = data.clubId;
      const targetScope = data.targetScope;

      console.log(
        `📅 Creating recurring event "${data.title}" (${data.frequency}) for ${targetScope.level} level`,
      );

      // ============================================================================
      // STEP 2: Permission Validation (same logic as createEventV2)
      // ============================================================================
      const clubDoc = await db.collection("clubs").doc(clubId).get();
      if (!clubDoc.exists) {
        throw new HttpsError("not-found", `Club ${clubId} not found`);
      }

      if (targetScope.level === "club") {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();
        const clubAccess = userData?.clubAccess?.find(
          (ca: any) => ca.clubId === clubId,
        );
        if (clubAccess?.role !== "club-admin") {
          throw new HttpsError(
            "permission-denied",
            "Only club admins can create club-level events",
          );
        }
      } else if (
        targetScope.level === "group" ||
        targetScope.level === "subgroup"
      ) {
        const groupDoc = await db
          .collection("clubs")
          .doc(clubId)
          .collection("groups")
          .doc(targetScope.groupId!)
          .get();
        if (!groupDoc.exists) {
          throw new HttpsError(
            "not-found",
            `Group ${targetScope.groupId} not found`,
          );
        }

        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();
        const clubAccess = userData?.clubAccess?.find(
          (ca: any) => ca.clubId === clubId,
        );

        if (clubAccess?.role !== "club-admin") {
          const groupAccess = clubAccess?.groupAccess?.find(
            (ga: any) => ga.groupId === targetScope.groupId,
          );
          const hasGroupPermission =
            groupAccess?.roles?.includes("admin") ||
            groupAccess?.roles?.includes("coach");
          if (!hasGroupPermission) {
            throw new HttpsError(
              "permission-denied",
              "Only club admins, group admins, or coaches can create events",
            );
          }
        }
      }

      // ============================================================================
      // STEP 3: Resolve Recipients (same logic as createEventV2)
      // ============================================================================
      let invitedUserIds: string[] = [];
      const responses: EventResponse[] = [];

      // Fetch members based on target scope
      if (targetScope.level === "club") {
        const membersDoc = await db
          .collection("clubs")
          .doc(clubId)
          .collection("metadata")
          .doc("members")
          .get();
        const membersData = membersDoc.data();
        invitedUserIds = membersData?.memberIds || [];
      } else if (targetScope.level === "group") {
        const membersDoc = await db
          .collection("clubs")
          .doc(clubId)
          .collection("groups")
          .doc(targetScope.groupId!)
          .collection("metadata")
          .doc("members")
          .get();
        const membersData = membersDoc.data();
        invitedUserIds = membersData?.memberIds || [];
      } else if (targetScope.level === "subgroup") {
        const membersDoc = await db
          .collection("clubs")
          .doc(clubId)
          .collection("groups")
          .doc(targetScope.groupId!)
          .collection("subgroups")
          .doc(targetScope.subgroupId!)
          .collection("metadata")
          .doc("members")
          .get();
        const membersData = membersDoc.data();
        invitedUserIds = membersData?.memberIds || [];
      }

      // Apply role filter if specified
      if (data.roleFilter && data.roleFilter.length > 0) {
        const userDocs = await Promise.all(
          invitedUserIds.map((uid) => db.collection("users").doc(uid).get()),
        );

        invitedUserIds = userDocs
          .filter((doc) => {
            const userData = doc.data();
            if (!userData) return false;
            const clubAccess = userData.clubAccess?.find(
              (ca: any) => ca.clubId === clubId,
            );
            if (!clubAccess) return false;

            // Check club-level role
            if (data.roleFilter!.includes(clubAccess.role as any)) return true;

            // Check group-level roles
            if (targetScope.groupId && clubAccess.groupAccess) {
              const groupAccess = clubAccess.groupAccess.find(
                (ga: any) => ga.groupId === targetScope.groupId,
              );
              if (
                groupAccess?.roles?.some((r: string) =>
                  data.roleFilter!.includes(r as any),
                )
              )
                return true;
            }

            return false;
          })
          .map((doc) => doc.id);
      }

      // Build responses array with user profiles
      const userProfileDocs = await Promise.all(
        invitedUserIds.map((uid) => db.collection("users").doc(uid).get()),
      );

      for (const userDoc of userProfileDocs) {
        const userData = userDoc.data();
        if (!userData) continue;

        const isYouth =
          userData.clubAccess
            ?.find((ca: any) => ca.clubId === clubId)
            ?.groupAccess?.find((ga: any) => ga.groupId === targetScope.groupId)
            ?.roles?.includes("player-underage") || false;

        responses.push({
          userId: userDoc.id,
          userName: userData.displayName || "Unknown",
          photoUrl: userData.photoURL || null,
          response: "pending",
          ...(isYouth && {
            isYouthMember: true,
            guardianIds: userData.guardianIds || [],
            guardianNames: userData.guardianNames || [],
          }),
        });
      }

      // Check if the creator is already in the resolved member list BEFORE
      // force-adding them, so we know whether they are a genuine group member.
      const creatorIsGroupMember = invitedUserIds.includes(data.createdBy);

      // Ensure creator is always in invitedUserIds (so they can see the event)
      if (!creatorIsGroupMember) {
        invitedUserIds.push(data.createdBy);
      }
      // Only add creator to responses[] if they are a group member.
      // A club-admin who is not in the group can still view & manage the event
      // via invitedUserIds + createdBy, but should not appear as a respondent.
      const creatorInResponses = responses.some(
        (r) => r.userId === data.createdBy,
      );
      if (!creatorInResponses && creatorIsGroupMember) {
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
      }

      // ============================================================================
      // STEP 4: Generate Occurrence Dates
      // ============================================================================
      const firstStartDate = new Date(data.startTime || data.startDate);
      const firstEndDate = new Date(data.endTime || data.endDate);
      const durationMs = firstEndDate.getTime() - firstStartDate.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));

      const occurrenceDates = generateOccurrenceDates(
        firstStartDate,
        data.frequency,
        data.endType,
        data.seriesEndDate ? new Date(data.seriesEndDate) : undefined,
        data.occurrenceCount,
      );

      console.log(
        `📅 Generated ${occurrenceDates.length} occurrences for recurring event`,
      );

      // ============================================================================
      // STEP 5: Create Master Document & All Occurrences in a Batch
      // ============================================================================
      // Firestore batch limit is 500 operations. Each occurrence = 1 write.
      // With max 52 occurrences + 1 master = 53, well within limit.

      const masterRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("recurringEvents")
        .doc();

      const occurrenceRefs: admin.firestore.DocumentReference[] = [];
      const occurrenceEventIds: string[] = [];

      // Pre-create document references for all occurrences
      for (let i = 0; i < occurrenceDates.length; i++) {
        const occRef = db
          .collection("clubs")
          .doc(clubId)
          .collection("events")
          .doc();
        occurrenceRefs.push(occRef);
        occurrenceEventIds.push(occRef.id);
      }

      // Extract time-of-day from first occurrence
      const startTimeOfDay = `${firstStartDate.getHours().toString().padStart(2, "0")}:${firstStartDate.getMinutes().toString().padStart(2, "0")}`;
      const endTimeOfDay = `${firstEndDate.getHours().toString().padStart(2, "0")}:${firstEndDate.getMinutes().toString().padStart(2, "0")}`;

      let gatheringTimeOfDay: string | null = null;
      if (data.gatheringTime) {
        const gt = new Date(data.gatheringTime);
        gatheringTimeOfDay = `${gt.getHours().toString().padStart(2, "0")}:${gt.getMinutes().toString().padStart(2, "0")}`;
      }

      // Calculate response deadline offset (hours before event start)
      let responseDeadlineOffset: number | null = null;
      if (data.responseDeadline) {
        const deadline = new Date(data.responseDeadline);
        const offsetMs = firstStartDate.getTime() - deadline.getTime();
        responseDeadlineOffset = Math.round(offsetMs / (1000 * 60 * 60)); // hours
      }

      // Build master document
      const masterDoc: RecurringEventMaster = {
        recurringEventId: masterRef.id,
        clubId,
        title: data.title,
        description: data.description || null,
        eventType: data.eventType,
        location: data.location || null,
        startTimeOfDay,
        endTimeOfDay,
        gatheringTimeOfDay,
        durationMinutes,
        frequency: data.frequency,
        dayOfWeek: firstStartDate.getDay(),
        ...(data.frequency === "monthly" && {
          dayOfMonth: firstStartDate.getDate(),
        }),
        endType: data.endType,
        ...(data.endType === "date" &&
          data.seriesEndDate && {
            endDate: Timestamp.fromDate(new Date(data.seriesEndDate)),
          }),
        ...(data.endType === "occurrences" && {
          occurrenceCount: data.occurrenceCount,
        }),
        targetScope: {
          level: targetScope.level,
          clubId,
          clubName: data.clubName,
          ...(targetScope.groupId && { groupId: targetScope.groupId }),
          ...(targetScope.groupName && { groupName: targetScope.groupName }),
          ...(targetScope.subgroupId && {
            subgroupId: targetScope.subgroupId,
          }),
          ...(targetScope.subgroupName && {
            subgroupName: targetScope.subgroupName,
          }),
        },
        roleFilter: data.roleFilter || null,
        capacityLimit: data.capacityLimit || null,
        responseDeadlineOffset,
        occurrenceEventIds,
        totalOccurrences: occurrenceDates.length,
        createdBy: data.createdBy,
        createdByName: data.createdByName,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        isActive: true,
        status: "active",
      };

      // Use batched writes (Firestore limit: 500 per batch)
      const batch = db.batch();

      // Write master document
      batch.set(masterRef, masterDoc);

      // Write all occurrence documents
      for (let i = 0; i < occurrenceDates.length; i++) {
        const occDate = occurrenceDates[i];

        // Calculate start/end for this occurrence
        const occStartDate = new Date(occDate);
        const occEndDate = new Date(occDate.getTime() + durationMs);

        // Calculate gathering time for this occurrence
        let occGatheringTime: any = null;
        if (data.gatheringTime) {
          const gt = new Date(data.gatheringTime);
          const gatheringOffset = firstStartDate.getTime() - gt.getTime();
          occGatheringTime = Timestamp.fromDate(
            new Date(occStartDate.getTime() - gatheringOffset),
          );
        }

        // Calculate response deadline for this occurrence
        let occResponseDeadline: any = null;
        if (responseDeadlineOffset) {
          occResponseDeadline = Timestamp.fromDate(
            new Date(
              occStartDate.getTime() - responseDeadlineOffset * 60 * 60 * 1000,
            ),
          );
        }

        // Each occurrence gets its own fresh responses array (all pending)
        const occResponses: EventResponse[] = responses.map((r) => ({
          ...r,
          response: "pending" as const,
        }));

        const eventDocument: EventDocument = {
          eventId: occurrenceRefs[i].id,
          title: data.title,
          description: data.description || null,
          eventType: data.eventType,
          startDate: Timestamp.fromDate(occStartDate),
          endDate: Timestamp.fromDate(occEndDate),
          gatheringTime: occGatheringTime,
          responseDeadline: occResponseDeadline,
          location: data.location || null,
          targetScope: {
            level: targetScope.level,
            clubId,
            clubName: data.clubName,
            ...(targetScope.groupId && { groupId: targetScope.groupId }),
            ...(targetScope.groupName && {
              groupName: targetScope.groupName,
            }),
            ...(targetScope.subgroupId && {
              subgroupId: targetScope.subgroupId,
            }),
            ...(targetScope.subgroupName && {
              subgroupName: targetScope.subgroupName,
            }),
          },
          invitedUserIds,
          roleFilter: data.roleFilter || null,
          capacity: data.capacityLimit
            ? { min: null, max: data.capacityLimit }
            : null,
          responses: occResponses,
          responseSummary: {
            totalInvited: occResponses.length,
            accepted: 0,
            declined: 0,
            pending: occResponses.length,
          },
          createdBy: data.createdBy,
          createdByName: data.createdByName,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          status: "scheduled",
          isActive: true,
          version: 1,

          // Recurring event fields
          isRecurring: true,
          recurringEventId: masterRef.id,
          occurrenceIndex: i,
          isModified: false,
        };

        batch.set(occurrenceRefs[i], eventDocument);
      }

      // Commit all writes atomically
      await batch.commit();

      console.log(
        `✅ Recurring event created: master=${masterRef.id}, occurrences=${occurrenceDates.length}`,
      );

      // ============================================================================
      // STEP 6: Send Notifications (only for the first upcoming occurrence)
      // Personalized: guardians see the youth member's name in the message
      // ============================================================================

      // Build guardian → youth names mapping from responses array
      const guardianYouthNames: Record<string, string[]> = {};
      const directMemberIds = new Set<string>();

      for (const resp of responses) {
        if (
          resp.isYouthMember &&
          resp.guardianIds &&
          resp.guardianIds.length > 0
        ) {
          for (const guardianId of resp.guardianIds) {
            if (!guardianYouthNames[guardianId]) {
              guardianYouthNames[guardianId] = [];
            }
            guardianYouthNames[guardianId].push(resp.userName || "Unknown");
          }
        } else {
          directMemberIds.add(resp.userId);
        }
      }

      console.log(
        `📬 Sending notifications for recurring event to ${invitedUserIds.length} users...`,
      );

      const firstOccurrenceDate = occurrenceDates[0];
      const notificationPromises = invitedUserIds.map(
        async (invitedUserId: string) => {
          try {
            // Determine personalized message
            let message: string;
            const youthNames = guardianYouthNames[invitedUserId];

            if (youthNames && youthNames.length > 0) {
              const nameList = youthNames.join(", ");
              if (directMemberIds.has(invitedUserId)) {
                message = `You and ${nameList} have been invited to ${data.title} (${data.frequency}, ${occurrenceDates.length} occurrences) starting ${firstOccurrenceDate.toLocaleDateString()}`;
              } else {
                message = `${nameList} has been invited to ${data.title} (${data.frequency}, ${occurrenceDates.length} occurrences) starting ${firstOccurrenceDate.toLocaleDateString()}`;
              }
            } else {
              message = `You've been invited to ${data.title} (${data.frequency}, ${occurrenceDates.length} occurrences) starting ${firstOccurrenceDate.toLocaleDateString()}`;
            }

            await createNotificationDirect(invitedUserId, {
              type: "event",
              title: `New Recurring Event: ${data.title}`,
              message,
              sourceId: occurrenceEventIds[0], // Link to first occurrence
              sourceCollection: "events",
              clubId,
              clubName: data.clubName,
              ...(targetScope.groupId && { groupId: targetScope.groupId }),
              ...(targetScope.groupName && {
                groupName: targetScope.groupName,
              }),
              priority: "normal",
              actionUrl: `/event-details?eventId=${occurrenceEventIds[0]}&clubId=${clubId}`,
              metadata: {
                recurringEventId: masterRef.id,
                totalOccurrences: occurrenceDates.length,
              },
            });
          } catch (notifError: any) {
            console.error(
              `⚠️ Failed to send notification to user ${invitedUserId}:`,
              notifError.message,
            );
          }
        },
      );

      await Promise.all(notificationPromises);
      console.log(`✅ Notifications sent successfully`);

      // ============================================================================
      // STEP 7: Return Success
      // ============================================================================
      return {
        success: true,
        recurringEventId: masterRef.id,
        occurrenceEventIds,
        totalOccurrences: occurrenceDates.length,
        totalRecipients: invitedUserIds.length,
        message: `Recurring event created with ${occurrenceDates.length} occurrences and ${invitedUserIds.length} invitations`,
      };
    } catch (error: any) {
      console.error("❌ Error in createRecurringEvent:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Failed to create recurring event: ${error.message}`,
      );
    }
  },
);
