import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1),
      };

      if (eventData.title) updateData.title = eventData.title;
      if (eventData.description !== undefined)
        updateData.description = eventData.description;
      if (eventData.eventType) updateData.eventType = eventData.eventType;
      if (eventData.location !== undefined)
        updateData.location = eventData.location;

      // Handle date/time updates
      if (eventData.startDate) {
        updateData.startDate = admin.firestore.Timestamp.fromDate(
          new Date(eventData.startDate),
        );
      }
      if (eventData.endDate) {
        updateData.endDate = admin.firestore.Timestamp.fromDate(
          new Date(eventData.endDate),
        );
      }
      if (eventData.gatheringTime !== undefined) {
        if (eventData.gatheringTime) {
          // Check if it's HH:mm format (string like "15:30")
          if (
            typeof eventData.gatheringTime === "string" &&
            eventData.gatheringTime.includes(":") &&
            eventData.gatheringTime.length <= 5
          ) {
            const [hours, minutes] = eventData.gatheringTime
              .split(":")
              .map(Number);

            // Extract timezone offset from startDate ISO string
            const startISO = eventData.startDate || new Date().toISOString();
            const datePart = startISO.split("T")[0]; // e.g., "2026-02-12"
            const timezonePart =
              startISO.match(/([+-]\\d{2}:\\d{2}|Z)$/)?.[0] || "+00:00";

            // Construct new ISO string with gathering time in same timezone
            const gatheringISO = `${datePart}T${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00${timezonePart}`;
            updateData.gatheringTime = admin.firestore.Timestamp.fromDate(
              new Date(gatheringISO),
            );
          } else {
            // Fallback: treat as ISO timestamp (for backward compatibility)
            updateData.gatheringTime = admin.firestore.Timestamp.fromDate(
              new Date(eventData.gatheringTime),
            );
          }
        } else {
          updateData.gatheringTime = null;
        }
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
          ? admin.firestore.Timestamp.fromDate(
              new Date(eventData.responseDeadline),
            )
          : null;
      }

      await eventRef.update(updateData);

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
