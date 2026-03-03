/**
 * LOK Report Service (Server-side)
 *
 * Manages LOK-stöd report lifecycle:
 * - Generate draft reports from completed events
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

// ─── Cloud Functions ───────────────────────────────────────────

/**
 * Generate a draft LOK report for a given period.
 * Collects all LOK-eligible completed events, validates them,
 * and creates a report document.
 */
export const generateLokReport = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { clubId, period } = request.data;

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

    // Check RF integration is enabled
    if (!clubData.rf?.integrationEnabled) {
      throw new HttpsError(
        "failed-precondition",
        "RF integration is not enabled for this club.",
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

    // Check for existing draft report (prevent duplicates)
    const existingReports = await db
      .collection("lokReports")
      .where("clubId", "==", clubId)
      .where("period", "==", period)
      .where("status", "in", ["draft", "submitted"])
      .get();

    if (!existingReports.empty) {
      throw new HttpsError(
        "already-exists",
        `A ${existingReports.docs[0].data().status} report already exists for period ${period}.`,
      );
    }

    // Fetch completed events in the period with LOK eligibility
    const eventsSnapshot = await db
      .collection("clubs")
      .doc(clubId)
      .collection("events")
      .where(
        "startDate",
        ">=",
        Timestamp.fromDate(bounds.start),
      )
      .where("startDate", "<=", Timestamp.fromDate(bounds.end))
      .get();

    // Filter to LOK-eligible events with attendance recorded
    const lokEvents = eventsSnapshot.docs.filter((doc) => {
      const data = doc.data();
      return data.lok?.eligible === true && data.completedAt;
    });

    if (lokEvents.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        `No LOK-eligible completed events found for period ${period}.`,
      );
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
      createdAt: now,
      lastUpdatedAt: now,
      createdBy: userId,
    };

    const reportRef = await db.collection("lokReports").add(reportData);

    // Update events with report reference
    const batch = db.batch();
    for (const act of eligibleActivities) {
      const eventRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("events")
        .doc(act.eventId);
      batch.update(eventRef, {
        "lok.reportId": reportRef.id,
        "lok.reportingPeriod": period,
      });
    }
    await batch.commit();

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
      .limit(20);

    if (status) {
      query = query.where("status", "==", status);
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

    if (reportData.status !== "draft") {
      throw new HttpsError(
        "failed-precondition",
        "Only draft reports can be deleted.",
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
