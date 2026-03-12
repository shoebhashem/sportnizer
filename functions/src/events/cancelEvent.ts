import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createNotificationDirect } from "../notifications/createNotification";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Cancels an event and sends notifications to all invited users
 *
 * Supports both single events and recurring events:
 * - Single event: pass clubId + eventId
 * - Recurring "single" scope: pass clubId + eventId + recurringEventId + scope="single"
 * - Recurring "future" scope: pass clubId + eventId + recurringEventId + scope="future"
 *   (cancels this occurrence and all future non-modified occurrences)
 *
 * @param request - Contains clubId, eventId, cancellationReason (optional), recurringEventId (optional), scope (optional)
 * @returns Promise with success/error
 *
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('not-found') - Event not found
 * @throws HttpsError('permission-denied') - User lacks permission to cancel
 * @throws HttpsError('failed-precondition') - Event already cancelled or completed
 */
export const cancelEvent = onCall(
  { region: config.region, timeoutSeconds: 60 },
  async (
    request,
  ): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    cancelledCount?: number;
  }> => {
    try {
      // ============================================================================
      // STEP 1: Authentication & Validation
      // ============================================================================
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;
      const { clubId, eventId, cancellationReason, recurringEventId, scope } =
        request.data;

      validateRequiredFields(request.data, ["clubId", "eventId"]);

      const db = admin.firestore();

      // ============================================================================
      // STEP 2: Fetch Event & Validate State
      // ============================================================================
      const eventRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("events")
        .doc(eventId);

      const eventDoc = await eventRef.get();
      if (!eventDoc.exists) {
        throw new HttpsError("not-found", "Event not found");
      }

      const eventData = eventDoc.data();
      if (!eventData) {
        throw new HttpsError("not-found", "Event data is empty");
      }

      // Check if event is already cancelled or completed
      if (eventData.status === "cancelled") {
        throw new HttpsError(
          "failed-precondition",
          "Event is already cancelled",
        );
      }
      if (eventData.status === "completed") {
        throw new HttpsError(
          "failed-precondition",
          "Cannot cancel a completed event",
        );
      }

      // ============================================================================
      // STEP 3: Permission Validation
      // ============================================================================
      // Same permission model as updateEvent: creator, club-admin, or group admin/coach
      const isCreator = eventData.createdBy === userId;

      if (!isCreator) {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();

        if (!userData) {
          throw new HttpsError("permission-denied", "User profile not found");
        }

        const clubAccess = userData.clubAccess?.find(
          (ca: any) => ca.clubId === clubId,
        );

        if (!clubAccess) {
          throw new HttpsError(
            "permission-denied",
            "You are not a member of this club",
          );
        }

        const isClubAdmin = clubAccess.role === "club-admin";

        if (!isClubAdmin) {
          // Check group-level admin/coach permissions
          const eventGroupId =
            eventData.targetScope?.groupId || eventData.groupId;
          if (eventGroupId && clubAccess.groupAccess) {
            const groupAccess = clubAccess.groupAccess.find(
              (g: any) => g.groupId === eventGroupId,
            );

            const hasGroupPermission =
              groupAccess?.roles?.includes("admin") ||
              groupAccess?.roles?.includes("coach");

            if (!hasGroupPermission) {
              throw new HttpsError(
                "permission-denied",
                "Only event creator, club admin, or group admin/coach can cancel events",
              );
            }
          } else {
            throw new HttpsError(
              "permission-denied",
              "Only event creator, club admin, or group admin/coach can cancel events",
            );
          }
        }
      }

      // ============================================================================
      // STEP 4: Cancel the Event(s)
      // ============================================================================
      const isRecurringCancel = recurringEventId && scope;
      let cancelledCount = 0;
      let allNotificationUserIds: string[] = [];

      if (isRecurringCancel && scope === "future") {
        // ---- RECURRING: Cancel this + all future occurrences ----
        const masterRef = db
          .collection("clubs")
          .doc(clubId)
          .collection("recurringEvents")
          .doc(recurringEventId);

        const masterDoc = await masterRef.get();
        if (!masterDoc.exists) {
          throw new HttpsError("not-found", "Recurring event master not found");
        }

        const masterData = masterDoc.data()!;
        const occurrenceEventIds: string[] =
          masterData.occurrenceEventIds || [];
        const currentOccurrenceIndex = eventData.occurrenceIndex ?? 0;

        // Get all future occurrence IDs (including current)
        const futureEventIds = occurrenceEventIds.slice(currentOccurrenceIndex);

        // Batch cancel all future occurrences
        const batchSize = 450;
        const uniqueNotificationUserIds = new Set<string>();

        for (let i = 0; i < futureEventIds.length; i += batchSize) {
          const batchIds = futureEventIds.slice(i, i + batchSize);
          const batch = db.batch();

          // Fetch all events in this batch
          const batchDocs = await Promise.all(
            batchIds.map((eid: string) =>
              db
                .collection("clubs")
                .doc(clubId)
                .collection("events")
                .doc(eid)
                .get(),
            ),
          );

          for (const doc of batchDocs) {
            if (!doc.exists) continue;
            const docData = doc.data()!;

            // Skip already cancelled or completed events
            if (
              docData.status === "cancelled" ||
              docData.status === "completed"
            )
              continue;

            // Skip individually modified occurrences (except the one being cancelled)
            if (docData.isModified && doc.id !== eventId) continue;

            batch.update(doc.ref, {
              status: "cancelled",
              cancellationReason: cancellationReason || null,
              cancelledAt: FieldValue.serverTimestamp(),
              cancelledBy: userId,
              updatedAt: FieldValue.serverTimestamp(),
              version: FieldValue.increment(1),
            });
            cancelledCount++;

            // Collect unique user IDs for notifications
            const userIds: string[] = docData.invitedUserIds || [];
            userIds.forEach((uid: string) =>
              uniqueNotificationUserIds.add(uid),
            );
          }

          await batch.commit();
        }

        // Check if ALL occurrences are now cancelled → update master status
        const pastEventIds = occurrenceEventIds.slice(
          0,
          currentOccurrenceIndex,
        );
        const pastDocs = await Promise.all(
          pastEventIds.map((eid: string) =>
            db
              .collection("clubs")
              .doc(clubId)
              .collection("events")
              .doc(eid)
              .get(),
          ),
        );
        const allPastCancelledOrCompleted = pastDocs.every((doc) => {
          const d = doc.data();
          return !d || d.status === "cancelled" || d.status === "completed";
        });

        // If all past are cancelled/completed and we just cancelled all future, mark master as cancelled
        if (allPastCancelledOrCompleted || currentOccurrenceIndex === 0) {
          await masterRef.update({
            status: "cancelled",
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        allNotificationUserIds = Array.from(uniqueNotificationUserIds);

        console.log(
          `✅ Recurring event: ${cancelledCount} future occurrences cancelled by user ${userId}`,
        );
      } else {
        // ---- SINGLE EVENT or SINGLE OCCURRENCE ----
        // Keep isActive: true so cancelled events remain visible in lists
        // The status: "cancelled" field is the source of truth for cancellation
        await eventRef.update({
          status: "cancelled",
          cancellationReason: cancellationReason || null,
          cancelledAt: FieldValue.serverTimestamp(),
          cancelledBy: userId,
          updatedAt: FieldValue.serverTimestamp(),
          version: FieldValue.increment(1),
        });
        cancelledCount = 1;
        allNotificationUserIds = eventData.invitedUserIds || [];

        console.log(`✅ Event ${eventId} cancelled by user ${userId}`);
      }

      // ============================================================================
      // STEP 5: Send Cancellation Notifications
      // ============================================================================
      const eventTitle = eventData.title || "Event";
      const clubName =
        eventData.targetScope?.clubName || eventData.clubName || "Club";
      const groupId = eventData.targetScope?.groupId || eventData.groupId;
      const groupName = eventData.targetScope?.groupName || eventData.groupName;

      // Build notification message
      const reasonSuffix = cancellationReason
        ? ` Reason: ${cancellationReason}`
        : "";

      const cancelScopeText =
        isRecurringCancel && scope === "future"
          ? ` and ${cancelledCount - 1} future occurrence(s)`
          : "";

      console.log(
        `📬 Sending cancellation notifications to ${allNotificationUserIds.length} users...`,
      );

      const notificationPromises = allNotificationUserIds.map(
        async (invitedUserId: string) => {
          try {
            await createNotificationDirect(invitedUserId, {
              type: "event_cancelled",
              title: `Event Cancelled: ${eventTitle}`,
              message: `The event "${eventTitle}" has been cancelled${cancelScopeText}.${reasonSuffix}`,
              sourceId: eventId,
              sourceCollection: "events",
              clubId,
              clubName,
              ...(groupId && { groupId }),
              ...(groupName && { groupName }),
              priority: "high",
              actionUrl: `/events/${eventId}`,
              metadata: {
                eventId,
                cancellationReason: cancellationReason || null,
                ...(isRecurringCancel && {
                  recurringEventId,
                  scope,
                  cancelledCount,
                }),
              },
            });
          } catch (notifError: any) {
            console.error(
              `⚠️ Failed to send cancellation notification to user ${invitedUserId}:`,
              notifError.message,
            );
            // Don't throw - notification failure shouldn't block cancellation
          }
        },
      );

      await Promise.all(notificationPromises);

      console.log(`✅ Cancellation notifications sent successfully`);

      // ============================================================================
      // STEP 6: Return Success
      // ============================================================================
      return {
        success: true,
        cancelledCount,
        message: `${cancelledCount} event(s) cancelled successfully. ${allNotificationUserIds.length} notifications sent.`,
      };
    } catch (error: any) {
      console.error("❌ Error in cancelEvent:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Failed to cancel event: ${error.message}`,
      );
    }
  },
);
