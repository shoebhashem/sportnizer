/**
 * Re-Edit Attendance (Club Admin only)
 *
 * Allows club admins to modify attendance records on already-completed events.
 * Unlike recordAttendance (which is for coaches and marks events completed for
 * the first time), this function is specifically for the LOK-stöd review flow:
 *
 * - Only club admins can call it
 * - The event must already be status: "completed"
 * - Marks any linked LOK report as "stale" so the admin knows to re-confirm
 * - Clears lok.conflictStatus and lok.confirmedForPeriod to force re-assessment
 */

import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { isClubAdmin } from "../utils/roleValidation";

export const reEditAttendance = onCall(
  { region: config.region },
  async (request) => {
    // ── Auth ──────────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      eventId,
      clubId,
      attendanceRecords,
      recordedBy,
    } = request.data as {
      eventId: string;
      clubId: string;
      attendanceRecords: { userId: string; attended: boolean }[];
      recordedBy: string;
    };

    if (!eventId || !clubId || !recordedBy) {
      throw new HttpsError(
        "invalid-argument",
        "eventId, clubId, and recordedBy are required",
      );
    }

    if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "attendanceRecords must be a non-empty array",
      );
    }

    // ── Permission ────────────────────────────────────────────
    const hasPermission = await isClubAdmin(request.auth.uid, clubId);
    if (!hasPermission) {
      throw new HttpsError(
        "permission-denied",
        "Only club admins can re-edit completed event attendance",
      );
    }

    const db = admin.firestore();
    const eventRef = db
      .collection("clubs")
      .doc(clubId)
      .collection("events")
      .doc(eventId);

    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      throw new HttpsError("not-found", "Event not found");
    }

    const eventData = eventDoc.data()!;
    if (eventData.status !== "completed") {
      throw new HttpsError(
        "failed-precondition",
        "Only completed events can have their attendance re-edited",
      );
    }

    // ── Update attendance in transaction ──────────────────────
    let attendedCount = 0;

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(eventRef);
      const data = snap.data()!;
      const responses = [...(data.responses || [])];

      for (const record of attendanceRecords) {
        const idx = responses.findIndex((r: any) => r.userId === record.userId);
        if (idx !== -1) {
          responses[idx] = {
            ...responses[idx],
            actualAttendance: record.attended,
            recordedBy,
            recordedAt: Timestamp.now(),
          };
        }
      }

      attendedCount = responses.filter(
        (r: any) => r.actualAttendance === true,
      ).length;

      transaction.update(eventRef, {
        responses,
        "responseSummary.attended": attendedCount,
        // Clear LOK confirmation state — must re-confirm after edit
        "lok.conflictStatus": FieldValue.delete(),
        "lok.confirmedForPeriod": FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // ── Mark linked LOK report as stale ───────────────────────
    const reportId = eventData.lok?.reportId;
    if (reportId) {
      const reportRef = db.collection("lokReports").doc(reportId);
      const reportDoc = await reportRef.get();
      if (reportDoc.exists) {
        const reportStatus = reportDoc.data()!.status;
        if (reportStatus === "draft") {
          await reportRef.update({
            status: "stale",
            staledAt: FieldValue.serverTimestamp(),
            staledByEvent: eventId,
          });
          console.log(
            `⚠️ Marked LOK report ${reportId} as stale (event ${eventId} was re-edited)`,
          );
        }
      }
    }

    console.log(
      `✏️ Re-edited attendance for event ${eventId}: ${attendedCount} attended`,
    );
    return { success: true, attendedCount };
  },
);
