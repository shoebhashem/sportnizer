import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { YearlyAttendanceStatistics } from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Internal function to update statistics (called by recordAttendance)
 *
 * @param eventId - Event ID
 * @param clubId - Club ID
 * @returns Promise with success status
 */
export async function updateStatisticsInternal(
  eventId: string,
  clubId: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const db = admin.firestore();
    const eventRef = db
      .collection("clubs")
      .doc(clubId)
      .collection("events")
      .doc(eventId);

    console.log(`📊 Updating statistics for event ${eventId}`);

    // Fetch Event Data
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new Error("Event not found");
    }

    const eventData = eventDoc.data();

    // Validate event has been completed
    if (eventData?.status !== "completed") {
      throw new Error("Event must be completed before updating statistics");
    }

    // Extract year from event date
    const eventDate = eventData.startDate?.toDate();
    if (!eventDate) {
      throw new Error("Event has no start date");
    }

    const year = eventDate.getFullYear();

    // Get target scope info
    const targetScope = eventData.targetScope;
    let groupId: string;
    let groupName: string;

    if (targetScope.level === "club") {
      // For club-level events, we don't track statistics
      console.log("⚠️ Club-level events do not have group statistics tracking");
      return {
        success: true,
        message: "Club-level events do not require statistics updates",
      };
    } else if (
      targetScope.level === "group" ||
      targetScope.level === "subgroup"
    ) {
      // For subgroups, statistics are aggregated into parent group
      groupId = targetScope.groupId!;
      groupName = targetScope.groupName!;
    } else {
      throw new Error("Invalid target scope level");
    }

    console.log(`📈 Updating statistics for group ${groupName} (year ${year})`);

    // Update Statistics Document Using Transaction
    const statsRef = db
      .collection("clubs")
      .doc(clubId)
      .collection("groups")
      .doc(groupId)
      .collection("statistics")
      .doc(year.toString());

    await db.runTransaction(async (transaction) => {
      const statsDoc = await transaction.get(statsRef);

      let statsData: YearlyAttendanceStatistics;

      if (!statsDoc.exists) {
        // Create new statistics document for this year
        statsData = {
          year,
          groupId,
          groupName,
          clubId,
          memberStats: {},
          groupAggregates: {
            totalEvents: 0,
            totalEventsByType: {
              training: 0,
              match: 0,
              meeting: 0,
              other: 0,
            },
            averageAttendanceRate: 0,
          },
          createdAt: FieldValue.serverTimestamp(),
          lastUpdated: FieldValue.serverTimestamp(),
        };
      } else {
        statsData = statsDoc.data() as YearlyAttendanceStatistics;
      }

      // Update member statistics
      const responses = eventData.responses || [];

      responses.forEach((response: any) => {
        const userId = response.userId;

        // Initialize member stats if not exists
        if (!statsData.memberStats[userId]) {
          statsData.memberStats[userId] = {
            userName: response.userName,
            eventsInvitedTo: 0,
            eventsAccepted: 0,
            eventsDeclined: 0,
            eventsAttended: 0,
            attendanceRate: 0,
            responseRate: 0,
            byEventType: {
              training: { invited: 0, attended: 0 },
              match: { invited: 0, attended: 0 },
              meeting: { invited: 0, attended: 0 },
              other: { invited: 0, attended: 0 },
            },
            lastUpdated: FieldValue.serverTimestamp(),
          };
        }

        const memberStats = statsData.memberStats[userId];

        // Update counts
        memberStats.eventsInvitedTo++;
        if (response.response === "accepted") memberStats.eventsAccepted++;
        if (response.response === "declined") memberStats.eventsDeclined++;
        if (response.actualAttendance) memberStats.eventsAttended++;

        // Update by event type
        const eventType = eventData.eventType as
          | "training"
          | "match"
          | "meeting"
          | "other";
        memberStats.byEventType[eventType].invited++;
        if (response.actualAttendance) {
          memberStats.byEventType[eventType].attended++;
        }

        // Recalculate rates
        memberStats.attendanceRate =
          memberStats.eventsInvitedTo > 0
            ? (memberStats.eventsAttended / memberStats.eventsInvitedTo) * 100
            : 0;

        memberStats.responseRate =
          memberStats.eventsInvitedTo > 0
            ? ((memberStats.eventsAccepted + memberStats.eventsDeclined) /
                memberStats.eventsInvitedTo) *
              100
            : 0;

        memberStats.lastUpdated = FieldValue.serverTimestamp();
      });

      // Update group aggregates
      statsData.groupAggregates.totalEvents++;
      const eventType = eventData.eventType as
        | "training"
        | "match"
        | "meeting"
        | "other";
      statsData.groupAggregates.totalEventsByType[eventType]++;

      // Recalculate average attendance rate
      const memberStatsArray = Object.values(statsData.memberStats);
      const totalAttendanceRate = memberStatsArray.reduce(
        (sum, member) => sum + member.attendanceRate,
        0,
      );
      statsData.groupAggregates.averageAttendanceRate =
        memberStatsArray.length > 0
          ? totalAttendanceRate / memberStatsArray.length
          : 0;

      statsData.lastUpdated = FieldValue.serverTimestamp();

      // Save statistics document
      transaction.set(statsRef, statsData, { merge: true });

      console.log(
        `✅ Statistics updated for ${memberStatsArray.length} members`,
      );
    });

    return {
      success: true,
      message: `Statistics updated successfully for year ${year}`,
    };
  } catch (error: any) {
    console.error("❌ Error in updateStatisticsInternal:", error);
    return {
      success: false,
      error: error.message || "Failed to update statistics",
    };
  }
}

/**
 * Updates yearly attendance statistics after event completion (Cloud Function)
 *
 * Features:
 * - Extracts year from event date
 * - Creates or updates year-based statistics document
 * - Tracks per-member statistics (attendance rates, event counts)
 * - Calculates group-level aggregates
 * - Supports event type breakdown (training, match, meeting, other)
 *
 * This function is called automatically by recordAttendance or can be invoked manually
 *
 * @param request - Contains eventId and clubId
 * @returns Promise with success status
 *
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('invalid-argument') - Missing required fields
 * @throws HttpsError('not-found') - Event not found
 */
export const updateStatistics = onCall(
  { region: config.region },
  async (
    request,
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      // Authentication check
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const { eventId, clubId } = request.data;

      validateRequiredFields(request.data, ["eventId", "clubId"]);

      // Call internal function
      const result = await updateStatisticsInternal(eventId, clubId);

      if (!result.success) {
        throw new HttpsError(
          "internal",
          result.error || "Failed to update statistics",
        );
      }

      return result;
    } catch (error: any) {
      console.error("❌ Error in updateStatistics:", error);

      // Re-throw HttpsError instances
      if (error instanceof HttpsError) {
        throw error;
      }

      // Wrap other errors
      throw new HttpsError(
        "internal",
        `Failed to update statistics: ${error.message}`,
      );
    }
  },
);
