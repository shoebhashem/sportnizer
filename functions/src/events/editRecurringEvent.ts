import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { EditRecurringEventRequest } from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Edits one or more occurrences of a recurring event
 *
 * Two scopes:
 * - "single": Edit only this specific occurrence (marks it as isModified: true)
 * - "future": Edit this occurrence and all future occurrences that haven't been individually modified
 *
 * For "future" scope, the master document template is also updated so
 * any description of the series reflects the latest values.
 *
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('not-found') - Event or master not found
 * @throws HttpsError('permission-denied') - User lacks permission
 * @throws HttpsError('invalid-argument') - Missing required fields
 */
export const editRecurringEvent = onCall(
  { region: config.region, timeoutSeconds: 60 },
  async (
    request,
  ): Promise<{ success: boolean; updatedCount?: number; error?: string }> => {
    try {
      // ============================================================================
      // STEP 1: Authentication & Validation
      // ============================================================================
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;
      const data: EditRecurringEventRequest = request.data;

      validateRequiredFields(data, [
        "clubId",
        "eventId",
        "recurringEventId",
        "scope",
      ]);

      if (data.scope !== "single" && data.scope !== "future") {
        throw new HttpsError(
          "invalid-argument",
          "scope must be 'single' or 'future'",
        );
      }

      const db = admin.firestore();
      const clubId = data.clubId;

      // ============================================================================
      // STEP 2: Fetch the target event & master doc
      // ============================================================================
      const eventRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("events")
        .doc(data.eventId);

      const masterRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("recurringEvents")
        .doc(data.recurringEventId);

      const [eventDoc, masterDoc] = await Promise.all([
        eventRef.get(),
        masterRef.get(),
      ]);

      if (!eventDoc.exists) {
        throw new HttpsError("not-found", "Event occurrence not found");
      }
      if (!masterDoc.exists) {
        throw new HttpsError("not-found", "Recurring event master not found");
      }

      const eventData = eventDoc.data()!;
      const masterData = masterDoc.data()!;

      // ============================================================================
      // STEP 3: Permission Validation
      // ============================================================================
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
                "Only event creator, club admin, or group admin/coach can edit events",
              );
            }
          } else {
            throw new HttpsError(
              "permission-denied",
              "Only event creator, club admin, or group admin/coach can edit events",
            );
          }
        }
      }

      // ============================================================================
      // STEP 4: Build update payload
      // ============================================================================
      const updateFields: any = {
        updatedAt: FieldValue.serverTimestamp(),
        version: FieldValue.increment(1),
      };

      if (data.title !== undefined) updateFields.title = data.title;
      if (data.description !== undefined)
        updateFields.description = data.description;
      if (data.eventType !== undefined) updateFields.eventType = data.eventType;
      if (data.location !== undefined) updateFields.location = data.location;

      if (data.startTime !== undefined) {
        updateFields.startDate = Timestamp.fromDate(new Date(data.startTime));
      }
      if (data.endTime !== undefined) {
        updateFields.endDate = Timestamp.fromDate(new Date(data.endTime));
      }
      if (data.gatheringTime !== undefined) {
        updateFields.gatheringTime = data.gatheringTime
          ? Timestamp.fromDate(new Date(data.gatheringTime))
          : null;
      }
      if (data.capacityLimit !== undefined) {
        updateFields.capacity = data.capacityLimit
          ? { min: null, max: data.capacityLimit }
          : null;
      }
      if (data.responseDeadline !== undefined) {
        updateFields.responseDeadline = data.responseDeadline
          ? Timestamp.fromDate(new Date(data.responseDeadline))
          : null;
      }

      // ============================================================================
      // STEP 5: Apply updates based on scope
      // ============================================================================
      let updatedCount = 0;

      if (data.scope === "single") {
        // Single occurrence: update just this event, mark as modified
        updateFields.isModified = true;
        await eventRef.update(updateFields);
        updatedCount = 1;

        console.log(
          `✅ Single occurrence ${data.eventId} edited (marked as modified)`,
        );
      } else {
        // "future" scope: update this occurrence and all future non-modified ones
        const currentOccurrenceIndex = eventData.occurrenceIndex ?? 0;
        const occurrenceEventIds = masterData.occurrenceEventIds || [];

        // Get all future occurrence IDs (including current)
        const futureEventIds = occurrenceEventIds.slice(currentOccurrenceIndex);

        // Batch update all future occurrences
        // Firestore batch limit is 500
        const batchSize = 450;
        for (let i = 0; i < futureEventIds.length; i += batchSize) {
          const batchIds = futureEventIds.slice(i, i + batchSize);
          const batch = db.batch();

          // Fetch all events in this batch to check isModified status
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

            // Skip individually modified occurrences (except the one being edited)
            if (docData.isModified && doc.id !== data.eventId) continue;

            // Skip cancelled or completed events
            if (
              docData.status === "cancelled" ||
              docData.status === "completed"
            )
              continue;

            // For time-based fields on future occurrences, we need to apply
            // the time change relative to each occurrence's date
            const occUpdateFields = { ...updateFields };

            if (data.startTime && doc.id !== data.eventId) {
              // For non-current occurrences, calculate new time keeping the occurrence date
              const newStartTime = new Date(data.startTime);
              const occurrentStartDate = docData.startDate?.toDate
                ? docData.startDate.toDate()
                : new Date(docData.startDate);

              const updatedStart = new Date(occurrentStartDate);
              updatedStart.setHours(
                newStartTime.getHours(),
                newStartTime.getMinutes(),
                newStartTime.getSeconds(),
              );
              occUpdateFields.startDate = Timestamp.fromDate(updatedStart);

              // If end time is provided, adjust accordingly
              if (data.endTime) {
                const newEndTime = new Date(data.endTime);
                const updatedEnd = new Date(occurrentStartDate);
                updatedEnd.setHours(
                  newEndTime.getHours(),
                  newEndTime.getMinutes(),
                  newEndTime.getSeconds(),
                );
                // Handle end time on next day
                if (updatedEnd <= updatedStart) {
                  updatedEnd.setDate(updatedEnd.getDate() + 1);
                }
                occUpdateFields.endDate = Timestamp.fromDate(updatedEnd);
              }

              // Adjust gathering time
              if (data.gatheringTime) {
                const newGatheringTime = new Date(data.gatheringTime);
                const updatedGathering = new Date(occurrentStartDate);
                updatedGathering.setHours(
                  newGatheringTime.getHours(),
                  newGatheringTime.getMinutes(),
                  newGatheringTime.getSeconds(),
                );
                occUpdateFields.gatheringTime =
                  Timestamp.fromDate(updatedGathering);
              }

              // Adjust response deadline
              if (data.responseDeadline) {
                const newDeadline = new Date(data.responseDeadline);
                // Calculate offset from the original start time
                const originalStartMs = new Date(data.startTime).getTime();
                const deadlineOffsetMs =
                  originalStartMs - newDeadline.getTime();
                const updatedDeadline = new Date(
                  updatedStart.getTime() - deadlineOffsetMs,
                );
                occUpdateFields.responseDeadline =
                  Timestamp.fromDate(updatedDeadline);
              }
            }

            batch.update(doc.ref, occUpdateFields);
            updatedCount++;
          }

          await batch.commit();
        }

        // Also update the master template with new values
        const masterUpdate: any = {
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (data.title !== undefined) masterUpdate.title = data.title;
        if (data.description !== undefined)
          masterUpdate.description = data.description;
        if (data.eventType !== undefined)
          masterUpdate.eventType = data.eventType;
        if (data.location !== undefined) masterUpdate.location = data.location;
        if (data.startTime) {
          const t = new Date(data.startTime);
          masterUpdate.startTimeOfDay = `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}`;
        }
        if (data.endTime) {
          const t = new Date(data.endTime);
          masterUpdate.endTimeOfDay = `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}`;
        }
        if (data.gatheringTime !== undefined) {
          if (data.gatheringTime) {
            const t = new Date(data.gatheringTime);
            masterUpdate.gatheringTimeOfDay = `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}`;
          } else {
            masterUpdate.gatheringTimeOfDay = null;
          }
        }
        if (data.capacityLimit !== undefined)
          masterUpdate.capacityLimit = data.capacityLimit;

        await masterRef.update(masterUpdate);

        console.log(
          `✅ Recurring event edited (future scope): ${updatedCount} occurrences updated, master updated`,
        );
      }

      return {
        success: true,
        updatedCount,
      };
    } catch (error: any) {
      console.error("❌ Error in editRecurringEvent:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        `Failed to edit recurring event: ${error.message}`,
      );
    }
  },
);
