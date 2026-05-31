import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createNotificationDirect } from "../notifications/createNotification";
import { buildAllInviteesNotificationJobs } from "../utils/notificationHelpers";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

export const updateEvent = onCall(
  { region: config.region },
  async (request): Promise<{ success: boolean; error?: string }> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      // 2. Extract and validate parameters
      const { clubId, eventId, eventData } = request.data;
      validateRequiredFields(request.data, ["clubId", "eventId", "eventData"]);

      // 3. Perform single atomic operation
      const db = admin.firestore();
      const eventRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("events")
        .doc(eventId);

      // Verify event exists and user has permission
      const eventDoc = await eventRef.get();
      if (!eventDoc.exists) {
        throw new HttpsError("not-found", "Event not found");
      }

      const event = eventDoc.data();
      if (event?.createdBy !== request.auth.uid) {
        // TODO: Add more sophisticated permission checking (club admins, group admins, etc.)
        throw new HttpsError(
          "permission-denied",
          "Only event creator can update event details",
        );
      }

      // Update only the provided fields
      const updateData: any = {
        updatedAt: FieldValue.serverTimestamp(),
        version: FieldValue.increment(1),
      };

      if (eventData.title) updateData.title = eventData.title;
      if (eventData.description !== undefined)
        updateData.description = eventData.description;
      if (eventData.eventType) updateData.eventType = eventData.eventType;
      if (eventData.location !== undefined)
        updateData.location = eventData.location;

      // Handle date/time updates
      if (eventData.startDate) {
        updateData.startDate = Timestamp.fromDate(
          new Date(eventData.startDate),
        );
      }
      if (eventData.endDate) {
        updateData.endDate = Timestamp.fromDate(
          new Date(eventData.endDate),
        );
      }
      if (eventData.gatheringTime !== undefined) {
        updateData.gatheringTime = eventData.gatheringTime
          ? Timestamp.fromDate(
              new Date(eventData.gatheringTime),
            )
          : null;
      }

      // Handle capacity
      if (eventData.capacityLimit !== undefined) {
        updateData.capacity = eventData.capacityLimit
          ? { min: null, max: eventData.capacityLimit }
          : null;
      }

      // Handle response deadline
      if (eventData.responseDeadline !== undefined) {
        updateData.responseDeadline = eventData.responseDeadline
          ? Timestamp.fromDate(
              new Date(eventData.responseDeadline),
            )
          : null;
      }

      await eventRef.update(updateData);

      // Send "event updated" notifications to all invitees (no pending-gate —
      // even accepted/declined members need to know about changes).
      // Fire-and-forget: notification failure must not fail the update.
      try {
        const updatedEvent = event!;
        const responses: any[] = updatedEvent.responses || [];
        const startDateStr = updatedEvent.startDate?.toDate
          ? updatedEvent.startDate.toDate().toLocaleDateString()
          : new Date(updatedEvent.startDate).toLocaleDateString();

        const notificationJobs = buildAllInviteesNotificationJobs(
          responses,
          updatedEvent.title,
          startDateStr,
          "time, location, or other details",
        );

        if (notificationJobs.length > 0) {
          await Promise.all(
            notificationJobs.map(async (job) => {
              try {
                await createNotificationDirect(job.targetUserId, {
                  type: "event",
                  title: `Event Updated: ${updatedEvent.title}`,
                  message: job.message,
                  sourceId: eventId,
                  sourceCollection: "events",
                  clubId,
                  clubName: updatedEvent.targetScope?.clubName || "",
                  ...(updatedEvent.targetScope?.groupId && {
                    groupId: updatedEvent.targetScope.groupId,
                  }),
                  ...(updatedEvent.targetScope?.groupName && {
                    groupName: updatedEvent.targetScope.groupName,
                  }),
                  priority: "normal",
                  actionUrl: `/event-details?eventId=${eventId}&clubId=${clubId}&inviteeUserId=${job.inviteeUserId}&inviteeName=${encodeURIComponent(job.inviteeName)}`,
                });
              } catch (notifErr: any) {
                console.error(
                  `⚠️ Edit notification failed for user ${job.targetUserId}:`,
                  notifErr.message,
                );
              }
            }),
          );
          console.log(
            `✅ Sent ${notificationJobs.length} edit notifications for event ${eventId}`,
          );
        }
      } catch (notifErr: any) {
        console.error(
          `⚠️ Failed to send edit notifications for event ${eventId}:`,
          notifErr.message,
        );
      }

      // 4. Return consistent response
      return {
        success: true,
      };
    } catch (error) {
      console.error("Error in updateEvent:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to update event");
    }
  },
);
