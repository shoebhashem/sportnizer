/**
 * List LOK-Eligible Completed Events
 *
 * Returns all LOK-eligible completed events for a club, optionally filtered
 * by period and/or group. Used by the eligible-events review screen so admins
 * can see, edit, and confirm activities before report generation.
 *
 * Does NOT return personnummer — only attendance booleans and display names.
 */

import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isClubAdmin } from "../utils/roleValidation";
import { getPeriodBounds } from "./lokValidation";

export const listEligibleEvents = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { clubId, groupId, period } = request.data as {
      clubId: string;
      groupId?: string;
      period?: string;
    };

    if (!clubId) {
      throw new HttpsError("invalid-argument", "clubId is required.");
    }

    const hasPermission = await isClubAdmin(request.auth.uid, clubId);
    if (!hasPermission) {
      throw new HttpsError(
        "permission-denied",
        "Only club admins can list eligible events.",
      );
    }

    const db = admin.firestore();
    const eventsRef = db
      .collection("clubs")
      .doc(clubId)
      .collection("events");

    // Use period bounds when provided — avoids a full collection scan.
    // Both branches filter in-memory for lok.eligible since adding
    // lok.eligible to every composite index is unnecessary.
    let query: admin.firestore.Query;
    if (period) {
      const bounds = getPeriodBounds(period);
      if (!bounds) {
        throw new HttpsError(
          "invalid-argument",
          "Invalid period format. Expected: YYYY-H1 or YYYY-H2.",
        );
      }
      query = eventsRef
        .where("startDate", ">=", Timestamp.fromDate(bounds.start))
        .where("startDate", "<=", Timestamp.fromDate(bounds.end))
        .orderBy("startDate", "desc")
        .limit(500);
    } else {
      // No period specified — return the most recent 500 events
      query = eventsRef.orderBy("startDate", "desc").limit(500);
    }

    const snapshot = await query.get();

    const events = snapshot.docs
      .filter((doc) => {
        const data = doc.data();
        return data.lok?.eligible === true && data.status === "completed";
      })
      .filter((doc) => {
        if (!groupId) return true;
        return doc.data().groupId === groupId;
      })
      .map((doc) => {
        const data = doc.data();
        const toIso = (ts: any): string | null =>
          ts?.toDate ? ts.toDate().toISOString() : ts instanceof Date ? ts.toISOString() : null;
        return {
          id: doc.id,
          title: data.title ?? "Aktivitet",
          startDate: toIso(data.startDate),
          endDate: toIso(data.endDate),
          startTime: toIso(data.startTime ?? data.startDate),
          endTime: toIso(data.endTime ?? data.endDate),
          groupId: data.groupId ?? null,
          groupName: data.groupName ?? null,
          eventType: data.eventType ?? "training",
          completedAt: toIso(data.completedAt),
          lok: {
            eligible: data.lok?.eligible ?? true,
            countedParticipants: data.lok?.countedParticipants ?? null,
            durationMinutes: data.lok?.durationMinutes ?? null,
            reportId: data.lok?.reportId ?? null,
            reportingPeriod: data.lok?.reportingPeriod ?? null,
            conflictStatus: data.lok?.conflictStatus ?? null,
            confirmedForPeriod: data.lok?.confirmedForPeriod ?? null,
          },
          // Return attendance data for the edit UI — no personnummer
          responses: (data.responses ?? []).map((r: any) => ({
            userId: r.userId,
            userName: r.userName ?? "Okänd",
            photoUrl: r.photoUrl ?? null,
            actualAttendance: r.actualAttendance ?? false,
            lokRole: r.lokRole ?? "participant",
          })),
          attendedCount: (data.responses ?? []).filter(
            (r: any) => r.actualAttendance === true,
          ).length,
        };
      });

    return { success: true, events };
  },
);
