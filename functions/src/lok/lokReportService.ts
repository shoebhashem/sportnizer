/**
 * LOK Report Service (Server-side)
 *
 * Manages LOK-stöd report lifecycle:
 * - Generate draft reports from completed events
 * - Detect conflicts (time-overlap + same-day same-sport)
 * - Validate reports against LOK rules
 * - Submit reports to RF via API
 * - Track report status
 */

import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isClubAdmin } from "../utils/roleValidation";
import { decryptPersonnummerBatch, getAgeAtDate } from "./encryptPersonnummer";
import {
    getPeriodBounds,
    LokActivityInput,
    LokParticipantInput,
    validateLokActivity,
} from "./lokValidation";

// ─── Conflict Detection ────────────────────────────────────────

interface LokConflict {
  type: "TIME_OVERLAP" | "SAME_DAY_SAME_SPORT";
  activityIds: string[]; // The two conflicting event IDs
  affectedUserIds: string[]; // Users that appear in both
  resolved: boolean;
  resolution?: "keep_first" | "keep_second" | "exclude_both";
  resolvedBy?: string;
  resolvedAt?: Date;
}

/**
 * Detect TYPE A conflicts: participant physically in two overlapping activities.
 * RF requires a person can only attend one activity at a time.
 */
function detectTimeOverlapConflicts(
  activities: {
    eventId: string;
    startTime: Date;
    endTime: Date;
    participants: LokParticipantInput[];
  }[],
): LokConflict[] {
  const conflicts: LokConflict[] = [];

  for (let i = 0; i < activities.length; i++) {
    for (let j = i + 1; j < activities.length; j++) {
      const a = activities[i];
      const b = activities[j];

      // Check time overlap: a starts before b ends AND b starts before a ends
      const overlaps = a.startTime < b.endTime && b.startTime < a.endTime;
      if (!overlaps) continue;

      const aUserIds = new Set(a.participants.map((p) => p.userId));
      const bUserIds = new Set(b.participants.map((p) => p.userId));
      const sharedUsers = [...aUserIds].filter((uid) => bUserIds.has(uid));

      if (sharedUsers.length > 0) {
        conflicts.push({
          type: "TIME_OVERLAP",
          activityIds: [a.eventId, b.eventId],
          affectedUserIds: sharedUsers,
          resolved: false,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Detect TYPE B conflicts: same participant in two activities of same sport on same day.
 * RF rules: a participant counts in only ONE activity per SF-sport per calendar day.
 * Weekly caps: ages 6–9 → max 3/week/sport; ages 10–25 → max 5/week/sport.
 */
function detectSameDaySameSportConflicts(
  activities: {
    eventId: string;
    date: Date;
    sport: string;
    participants: LokParticipantInput[];
  }[],
): LokConflict[] {
  const conflicts: LokConflict[] = [];

  // Group by date + sport
  const daySportMap = new Map<string, typeof activities>();
  for (const act of activities) {
    const dayKey = act.date.toISOString().split("T")[0];
    const key = `${dayKey}::${act.sport.toLowerCase()}`;
    if (!daySportMap.has(key)) daySportMap.set(key, []);
    daySportMap.get(key)!.push(act);
  }

  for (const [, group] of daySportMap) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        const aUserIds = new Set(a.participants.map((p) => p.userId));
        const bUserIds = new Set(b.participants.map((p) => p.userId));
        const sharedUsers = [...aUserIds].filter((uid) => bUserIds.has(uid));

        if (sharedUsers.length > 0) {
          conflicts.push({
            type: "SAME_DAY_SAME_SPORT",
            activityIds: [a.eventId, b.eventId],
            affectedUserIds: sharedUsers,
            resolved: false,
          });
        }
      }
    }
  }

  return conflicts;
}

// ─── Cloud Functions ───────────────────────────────────────────

/**
 * Generate a draft LOK report for a given period.
 * Collects all LOK-eligible completed events, validates them,
 * detects conflicts, and creates a report document.
 */
export const generateLokReport = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { clubId, period, force } = request.data as {
      clubId: string;
      period: string;
      /** When true: replaces any existing draft/stale report. Used by the confirmation flow. */
      force?: boolean;
    };

    if (!clubId || !period) {
      throw new HttpsError(
        "invalid-argument",
        "clubId and period are required.",
      );
    }

    const db = admin.firestore();
    const userId = request.auth.uid;

    // Verify caller is a club admin
    const clubDoc = await db.collection("clubs").doc(clubId).get();
    if (!clubDoc.exists) {
      throw new HttpsError("not-found", "Club not found.");
    }

    const clubData = clubDoc.data()!;
    const hasPermission = await isClubAdmin(userId, clubId);
    if (!hasPermission) {
      throw new HttpsError(
        "permission-denied",
        "Only club admins can generate LOK reports.",
      );
    }

    // Get period bounds
    const bounds = getPeriodBounds(period);
    if (!bounds) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid period format. Expected: YYYY-H1 or YYYY-H2.",
      );
    }

    // Check for existing reports — allow force-replace of draft/stale; block submitted/accepted
    const existingReports = await db
      .collection("lokReports")
      .where("clubId", "==", clubId)
      .where("period", "==", period)
      .where("status", "in", ["draft", "stale", "submitted", "accepted"])
      .get();

    if (!existingReports.empty) {
      for (const existingDoc of existingReports.docs) {
        const existingStatus = existingDoc.data().status;
        if (["submitted", "accepted"].includes(existingStatus)) {
          throw new HttpsError(
            "already-exists",
            `A ${existingStatus} report exists for period ${period} and cannot be overwritten.`,
          );
        }
        // Draft or stale: delete if force=true, otherwise block
        if (force && ["draft", "stale"].includes(existingStatus)) {
          const oldActivities = existingDoc.data().activities || [];
          const delBatch = db.batch();
          for (const act of oldActivities) {
            const eRef = db
              .collection("clubs")
              .doc(clubId)
              .collection("events")
              .doc(act.eventId);
            delBatch.update(eRef, {
              "lok.reportId": FieldValue.delete(),
              "lok.reportingPeriod": FieldValue.delete(),
              "lok.conflictStatus": FieldValue.delete(),
              "lok.confirmedForPeriod": FieldValue.delete(),
            });
          }
          delBatch.delete(existingDoc.ref);
          await delBatch.commit();
          console.log(`🗑️ Deleted ${existingStatus} report ${existingDoc.id} before confirmation`);
        } else if (!force) {
          throw new HttpsError(
            "already-exists",
            `A ${existingStatus} report already exists for period ${period}.`,
          );
        }
      }
    }

    // Fetch completed events in the period with LOK eligibility
    const eventsSnapshot = await db
      .collection("clubs")
      .doc(clubId)
      .collection("events")
      .where("startDate", ">=", Timestamp.fromDate(bounds.start))
      .where("startDate", "<=", Timestamp.fromDate(bounds.end))
      .get();

    // Filter to LOK-eligible events with attendance recorded
    const lokEvents = eventsSnapshot.docs.filter((doc) => {
      const data = doc.data();
      return data.lok?.eligible === true && data.completedAt;
    });

    if (lokEvents.length === 0) {
      return {
        success: true,
        empty: true,
        totalActivities: 0,
        info: `Inga LOK-berättigade avklarade aktiviteter hittades för period ${period}.`,
      };
    }

    // Collect all participant user IDs for batch decryption
    const allUserIds = new Set<string>();
    for (const eventDoc of lokEvents) {
      const responses = eventDoc.data().responses || [];
      for (const r of responses) {
        if (r.actualAttendance) {
          allUserIds.add(r.userId);
        }
      }
    }

    // Decrypt personnummer for all participants
    const personnummerMap = await decryptPersonnummerBatch(
      Array.from(allUserIds),
    );

    // Build activity inputs and validate each
    const activities: {
      eventId: string;
      eventData: any;
      input: LokActivityInput;
    }[] = [];

    for (const eventDoc of lokEvents) {
      const data = eventDoc.data();
      const startDate = data.startDate?.toDate?.() || new Date(data.startDate);
      const endDate =
        data.endDate?.toDate?.() ||
        (data.lok?.durationMinutes
          ? new Date(startDate.getTime() + data.lok.durationMinutes * 60000)
          : new Date(startDate.getTime() + 60 * 60000)); // Default 60 min

      const participants: LokParticipantInput[] = [];
      for (const r of data.responses || []) {
        if (r.actualAttendance && personnummerMap.has(r.userId)) {
          participants.push({
            userId: r.userId,
            personnummer: personnummerMap.get(r.userId)!,
            role: r.lokRole || "participant",
            attended: true,
          });
        }
      }

      activities.push({
        eventId: eventDoc.id,
        eventData: data,
        input: {
          eventId: eventDoc.id,
          date: startDate,
          startTime: startDate,
          endTime: endDate,
          activityType: data.eventType || "training",
          sport: data.groupName || "Unknown",
          groupId: data.groupId || "",
          groupName: data.groupName || "",
          participants,
        },
      });
    }

    // Validate each activity
    const validatedActivities = activities.map((a) => ({
      ...a,
      validation: validateLokActivity(a.input),
    }));

    const eligibleActivities = validatedActivities.filter(
      (a) => a.validation.eligible,
    );

    // Build report activities array
    const reportActivities = eligibleActivities.map((a) => ({
      eventId: a.eventId,
      date: a.input.date,
      durationMinutes: a.validation.summary.durationMinutes,
      activityType: a.input.activityType,
      sport: a.input.sport,
      groupId: a.input.groupId,
      groupName: a.input.groupName,
      participants: a.input.participants.map((p) => ({
        userId: p.userId,
        personalNumber: p.personnummer, // Stored encrypted in the report
        role: p.role,
        ageAtActivity: getAgeAtDate(p.personnummer, a.input.date),
      })),
      participantCount: a.validation.summary.countedParticipants,
    }));

    // Calculate totals
    const uniqueParticipants = new Set<string>();
    const uniqueLeaders = new Set<string>();
    for (const act of reportActivities) {
      for (const p of act.participants) {
        if (p.role === "participant") {
          uniqueParticipants.add(p.userId);
        } else {
          uniqueLeaders.add(p.userId);
        }
      }
    }

    const now = FieldValue.serverTimestamp();

    // ── Conflict detection ──────────────────────────────────────
    const activityInputsForConflict = eligibleActivities.map((a) => ({
      eventId: a.eventId,
      date: a.input.date,
      startTime: a.input.startTime,
      endTime: a.input.endTime,
      sport: a.input.sport,
      participants: a.input.participants,
    }));

    const timeOverlapConflicts = detectTimeOverlapConflicts(
      activityInputsForConflict,
    );
    const sameDayConflicts = detectSameDaySameSportConflicts(
      activityInputsForConflict,
    );
    const allConflicts: LokConflict[] = [
      ...timeOverlapConflicts,
      ...sameDayConflicts,
    ];

    // Create the report document
    const reportData = {
      clubId,
      clubName: clubData.name,
      organizationNumber: clubData.rf?.organizationNumber || "",
      period,
      periodStart: Timestamp.fromDate(bounds.start),
      periodEnd: Timestamp.fromDate(bounds.end),
      status: "draft",
      totalActivities: reportActivities.length,
      totalParticipants: uniqueParticipants.size,
      totalLeaders: uniqueLeaders.size,
      activities: reportActivities,
      conflicts: allConflicts,
      hasUnresolvedConflicts: allConflicts.some((c) => !c.resolved),
      createdAt: now,
      lastUpdatedAt: now,
      createdBy: userId,
    };

    const reportRef = await db.collection("lokReports").add(reportData);

    // Update events with report reference + conflict status + confirmation if force
    const batch = db.batch();
    for (const act of eligibleActivities) {
      const eventRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("events")
        .doc(act.eventId);
      const hasConflict = allConflicts.some(
        (c) => !c.resolved && c.activityIds.includes(act.eventId),
      );
      const eventUpdate: Record<string, any> = {
        "lok.reportId": reportRef.id,
        "lok.reportingPeriod": period,
        "lok.conflictStatus": hasConflict ? "conflict" : "clean",
      };
      if (force) {
        eventUpdate["lok.confirmedForPeriod"] = period;
      }
      batch.update(eventRef, eventUpdate);
    }
    await batch.commit();

    // If this was a period confirmation (force=true), record it on the club document
    if (force) {
      const periodKey = period.replace("-", "_"); // "2026-H1" → "2026_H1" (valid map key)
      await db
        .collection("clubs")
        .doc(clubId)
        .update({
          [`rf.periodConfirmations.${periodKey}`]: {
            confirmedAt: FieldValue.serverTimestamp(),
            confirmedBy: userId,
            reportId: reportRef.id,
            totalActivities: reportActivities.length,
            hasConflicts: allConflicts.length > 0,
          },
        });
      console.log(`✅ Confirmed LOK period ${period} for club ${clubId}`);
    }

    console.log(
      `📊 Generated LOK report ${reportRef.id} for club ${clubId}, period ${period}: ${reportActivities.length} activities, ${uniqueParticipants.size} participants`,
    );

    return {
      success: true,
      reportId: reportRef.id,
      summary: {
        totalActivities: reportActivities.length,
        totalParticipants: uniqueParticipants.size,
        totalLeaders: uniqueLeaders.size,
        skippedActivities:
          validatedActivities.length - eligibleActivities.length,
        conflicts: allConflicts.length,
        hasUnresolvedConflicts: allConflicts.some((c) => !c.resolved),
        warnings: validatedActivities
          .flatMap((a) => a.validation.warnings)
          .map((w) => w.message),
      },
    };
  },
);

/**
 * Get LOK report details.
 */
export const getLokReport = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { reportId } = request.data;
    if (!reportId) {
      throw new HttpsError("invalid-argument", "reportId is required.");
    }

    const db = admin.firestore();
    const reportDoc = await db.collection("lokReports").doc(reportId).get();

    if (!reportDoc.exists) {
      throw new HttpsError("not-found", "Report not found.");
    }

    const reportData = reportDoc.data()!;

    // Verify caller has access (is club admin)
    const hasPermission = await isClubAdmin(
      request.auth.uid,
      reportData.clubId,
    );
    if (!hasPermission) {
      throw new HttpsError(
        "permission-denied",
        "Only club admins can view LOK reports.",
      );
    }

    // Strip personnummer from response — only show summary data
    const sanitizedActivities = reportData.activities?.map((act: any) => ({
      ...act,
      participants: act.participants?.map((p: any) => ({
        userId: p.userId,
        role: p.role,
        ageAtActivity: p.ageAtActivity,
        // personalNumber is NOT sent to client
      })),
    }));

    return {
      success: true,
      report: {
        id: reportDoc.id,
        ...reportData,
        activities: sanitizedActivities,
      },
    };
  },
);

/**
 * List LOK reports for a club.
 */
export const listLokReports = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { clubId, status } = request.data;
    if (!clubId) {
      throw new HttpsError("invalid-argument", "clubId is required.");
    }

    const db = admin.firestore();

    // Verify caller is club admin
    const hasPermission = await isClubAdmin(request.auth.uid, clubId);
    if (!hasPermission) {
      throw new HttpsError(
        "permission-denied",
        "Only club admins can view LOK reports.",
      );
    }

    let query: admin.firestore.Query = db
      .collection("lokReports")
      .where("clubId", "==", clubId)
      .orderBy("createdAt", "desc")
      .limit(50);

    if (status) {
      query = db
        .collection("lokReports")
        .where("clubId", "==", clubId)
        .where("status", "==", status)
        .orderBy("createdAt", "desc")
        .limit(50);
    }

    const snapshot = await query.get();

    const reports = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        period: data.period,
        status: data.status,
        totalActivities: data.totalActivities,
        totalParticipants: data.totalParticipants,
        totalLeaders: data.totalLeaders,
        submittedAt: data.submittedAt,
        rfReceiptId: data.rfReceiptId,
        createdAt: data.createdAt,
        staledAt: data.staledAt,
        staledByEvent: data.staledByEvent,
      };
    });

    return { success: true, reports };
  },
);

/**
 * Delete a draft LOK report.
 */
export const deleteLokReport = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { reportId } = request.data;
    if (!reportId) {
      throw new HttpsError("invalid-argument", "reportId is required.");
    }

    const db = admin.firestore();
    const reportDoc = await db.collection("lokReports").doc(reportId).get();

    if (!reportDoc.exists) {
      throw new HttpsError("not-found", "Report not found.");
    }

    const reportData = reportDoc.data()!;

    if (!["draft", "stale"].includes(reportData.status)) {
      throw new HttpsError(
        "failed-precondition",
        "Only draft or stale reports can be deleted.",
      );
    }

    // Verify caller is club admin
    const hasPermission = await isClubAdmin(
      request.auth.uid,
      reportData.clubId,
    );
    if (!hasPermission) {
      throw new HttpsError(
        "permission-denied",
        "Only club admins can delete LOK reports.",
      );
    }

    // Clear report references from events
    const batch = db.batch();
    for (const act of reportData.activities || []) {
      const eventRef = db
        .collection("clubs")
        .doc(reportData.clubId)
        .collection("events")
        .doc(act.eventId);
      batch.update(eventRef, {
        "lok.reportId": FieldValue.delete(),
        "lok.reportingPeriod": FieldValue.delete(),
      });
    }

    batch.delete(reportDoc.ref);
    await batch.commit();

    console.log(`🗑️ Deleted LOK report ${reportId}`);

    return { success: true };
  },
);

/**
 * Resolve a conflict in a LOK report.
 * resolution options:
 *   "keep_first"  – count only the first (chronologically earlier) activity
 *   "keep_second" – count only the second activity
 *   "exclude_both"– exclude both activities from the report
 */
export const resolveReportConflict = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { reportId, conflictIndex, resolution } = request.data as {
      reportId: string;
      conflictIndex: number;
      resolution: "keep_first" | "keep_second" | "exclude_both";
    };

    if (!reportId) {
      throw new HttpsError("invalid-argument", "reportId is required.");
    }
    if (typeof conflictIndex !== "number") {
      throw new HttpsError(
        "invalid-argument",
        "conflictIndex must be a number.",
      );
    }
    if (!["keep_first", "keep_second", "exclude_both"].includes(resolution)) {
      throw new HttpsError(
        "invalid-argument",
        "resolution must be keep_first, keep_second, or exclude_both.",
      );
    }

    const db = admin.firestore();
    const reportRef = db.collection("lokReports").doc(reportId);
    const reportDoc = await reportRef.get();

    if (!reportDoc.exists) {
      throw new HttpsError("not-found", "Report not found.");
    }

    const reportData = reportDoc.data()!;

    if (!["draft", "stale"].includes(reportData.status)) {
      throw new HttpsError(
        "failed-precondition",
        "Conflicts can only be resolved on draft or stale reports.",
      );
    }

    const hasPermission = await isClubAdmin(
      request.auth.uid,
      reportData.clubId,
    );
    if (!hasPermission) {
      throw new HttpsError(
        "permission-denied",
        "Only club admins can resolve report conflicts.",
      );
    }

    const conflicts: LokConflict[] = reportData.conflicts || [];
    if (conflictIndex < 0 || conflictIndex >= conflicts.length) {
      throw new HttpsError("out-of-range", "conflictIndex is out of range.");
    }

    conflicts[conflictIndex] = {
      ...conflicts[conflictIndex],
      resolved: true,
      resolution,
      resolvedBy: request.auth.uid,
      resolvedAt: new Date(),
    };

    const hasUnresolvedConflicts = conflicts.some((c) => !c.resolved);

    await reportRef.update({
      conflicts,
      hasUnresolvedConflicts,
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(
      `✅ Resolved conflict ${conflictIndex} in LOK report ${reportId} (${resolution})`,
    );

    return { success: true, hasUnresolvedConflicts };
  },
);
