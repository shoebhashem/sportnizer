import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  RecordAttendanceRequest,
  RecordAttendanceResponse,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Records actual attendance for an event (admin/coach only)
 *
 * Features:
 * - Validates admin/coach permissions
 * - Records who attended and who didn't
 * - Updates responseSummary with attended count
 * - Marks event as completed
 * - Triggers statistics update (via updateStatistics function)
 *
 * @param request - Attendance records data
 * @returns Promise with success status
 *
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('permission-denied') - User not admin/coach
 * @throws HttpsError('invalid-argument') - Missing required fields
 * @throws HttpsError('not-found') - Event not found
 * @throws HttpsError('failed-precondition') - Event not ready for attendance recording
 */
export const recordAttendance = onCall(
  { region: config.region },
  async (request): Promise<RecordAttendanceResponse> => {
    try {
      // ============================================================================
      // STEP 1: Authentication & Validation
      // ============================================================================
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const data: RecordAttendanceRequest = request.data;

      validateRequiredFields(data, [
        "eventId",
        "clubId",
        "attendanceRecords",
        "recordedBy",
      ]);

      if (
        !Array.isArray(data.attendanceRecords) ||
        data.attendanceRecords.length === 0
      ) {
        throw new HttpsError(
          "invalid-argument",
          "attendanceRecords must be a non-empty array",
        );
      }

      const db = admin.firestore();
      const eventRef = db
        .collection("clubs")
        .doc(data.clubId)
        .collection("events")
        .doc(data.eventId);

      console.log(
        `📋 Recording attendance for event ${data.eventId} by user ${data.recordedBy}`,
      );

      // ============================================================================
      // STEP 2: Permission Validation
      // ============================================================================
      const eventDoc = await eventRef.get();

      if (!eventDoc.exists) {
        throw new HttpsError("not-found", "Event not found");
      }

      const eventData = eventDoc.data();

      // Check user's permission based on event's target scope
      const targetScope = eventData?.targetScope;
      const userId = request.auth.uid;

      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      const clubAccess = userData?.clubAccess?.find(
        (ca: any) => ca.clubId === data.clubId,
      );

      if (!clubAccess) {
        throw new HttpsError(
          "permission-denied",
          "You are not a member of this club",
        );
      }

      let hasPermission = false;

      if (targetScope.level === "club") {
        // For club-level events, user must be club-admin
        hasPermission = clubAccess.role === "club-admin";
      } else if (
        targetScope.level === "group" ||
        targetScope.level === "subgroup"
      ) {
        // Check if user is club-admin (full access to all groups in club)
        const isClubAdmin = clubAccess.role === "club-admin";

        if (isClubAdmin) {
          hasPermission = true;
        } else {
          // For non-club-admins, check group-specific roles
          const groupAccess = clubAccess.groupAccess?.find(
            (g: any) => g.groupId === targetScope.groupId,
          );
          hasPermission =
            groupAccess?.roles?.includes("admin") ||
            groupAccess?.roles?.includes("coach");
        }
      }

      if (!hasPermission) {
        throw new HttpsError(
          "permission-denied",
          "Only admins and coaches can record attendance",
        );
      }

      // ============================================================================
      // STEP 3: Update Attendance Records Using Transaction
      // ============================================================================
      await db.runTransaction(async (transaction) => {
        const eventDocSnapshot = await transaction.get(eventRef);

        if (!eventDocSnapshot.exists) {
          throw new HttpsError("not-found", "Event not found");
        }

        const currentEventData = eventDocSnapshot.data();

        if (!currentEventData) {
          throw new HttpsError("internal", "Event data is missing");
        }

        // Check if event is already completed
        if (currentEventData.status === "completed") {
          throw new HttpsError(
            "failed-precondition",
            "This event is already completed. Attendance cannot be modified.",
          );
        }

        const responses = currentEventData.responses || [];

        // Update attendance for each record
        let attendedCount = 0;

        data.attendanceRecords.forEach((record) => {
          const responseIndex = responses.findIndex(
            (r: any) => r.userId === record.userId,
          );

          if (responseIndex !== -1) {
            responses[responseIndex] = {
              ...responses[responseIndex],
              actualAttendance: record.attended,
              recordedBy: data.recordedBy,
              recordedAt: Timestamp.now(),
            };

            if (record.attended) {
              attendedCount++;
            }
          }
        });

        // Update responseSummary with attended count
        const responseSummary = {
          ...currentEventData.responseSummary,
          attended: attendedCount,
        };

        // Get recorder's name from user document
        const recorderDoc = await transaction.get(
          db.collection("users").doc(data.recordedBy),
        );
        const recorderName =
          recorderDoc.data()?.displayName ||
          recorderDoc.data()?.name ||
          "Coach";

        // Update event document with completion metadata
        transaction.update(eventRef, {
          responses,
          responseSummary,
          status: "completed",
          completedAt: FieldValue.serverTimestamp(),
          completedBy: data.recordedBy,
          completedByName: recorderName,
          updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`✅ Attendance recorded: ${attendedCount} attended`);
      });

      // ============================================================================
      // STEP 4: Auto-Trigger Statistics Update
      // ============================================================================
      // Fetch event data again to get targetScope information
      const eventDocAfter = await eventRef.get();
      const eventDataAfter = eventDocAfter.data();

      // Only update statistics for group/subgroup events (not club-level)
      if (eventDataAfter && eventDataAfter.targetScope?.level !== "club") {
        console.log(
          `📊 Auto-triggering statistics update for group ${eventDataAfter.targetScope.groupId}`,
        );

        try {
          const { updateStatisticsInternal } = require("./updateStatistics");
          await updateStatisticsInternal(data.eventId, data.clubId);
          console.log(`✅ Statistics updated successfully`);
        } catch (statsError: any) {
          console.error(
            `⚠️ Statistics update failed, but attendance was recorded:`,
            statsError,
          );
          // Don't fail the whole operation if statistics update fails
        }
      } else {
        console.log(`ℹ️ Skipping statistics update (club-level event)`);
      }

      // ============================================================================
      // STEP 5: Return Success Response
      // ============================================================================
      return {
        success: true,
        message: "Attendance recorded and event completed successfully",
      };
    } catch (error: any) {
      console.error("❌ Error in recordAttendance:", error);

      // Re-throw HttpsError instances
      if (error instanceof HttpsError) {
        throw error;
      }

      // Wrap other errors
      throw new HttpsError(
        "internal",
        `Failed to record attendance: ${error.message}`,
      );
    }
  },
);
