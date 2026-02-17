/**
 * Attendance Service
 *
 * Handles recording attendance for events after they have occurred.
 * Integrates with backend recordAttendance function which automatically
 * triggers statistics updates.
 */

import { getFunctions, httpsCallable } from "firebase/functions";

export interface AttendanceRecord {
  userId: string;
  attended: boolean;
}

export interface RecordAttendanceResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Records attendance for an event and marks it as completed
 *
 * This function:
 * 1. Validates user has permission (admin/coach)
 * 2. Records who attended and who didn't
 * 3. Marks event as completed (cannot be modified after)
 * 4. Automatically triggers statistics update
 *
 * @param eventId - Event ID
 * @param clubId - Club ID
 * @param attendanceRecords - Array of attendance records
 * @param recordedBy - User ID of who is recording (admin/coach)
 * @param recordedByName - Display name of who is recording
 * @returns Promise with success status
 *
 * @throws Error if user lacks permission
 * @throws Error if event is already completed
 * @throws Error if recording fails
 */
export async function recordEventAttendance(
  eventId: string,
  clubId: string,
  attendanceRecords: AttendanceRecord[],
  recordedBy: string,
  recordedByName: string,
): Promise<RecordAttendanceResponse> {
  try {
    console.log("📋 Recording attendance:", {
      eventId,
      clubId,
      attendedCount: attendanceRecords.filter((r) => r.attended).length,
      totalRecords: attendanceRecords.length,
      recordedBy,
    });

    const functions = getFunctions(undefined, "europe-north1");
    const recordAttendanceFn = httpsCallable<
      {
        eventId: string;
        clubId: string;
        attendanceRecords: AttendanceRecord[];
        recordedBy: string;
      },
      RecordAttendanceResponse
    >(functions, "recordAttendance");

    const response = await recordAttendanceFn({
      eventId,
      clubId,
      attendanceRecords,
      recordedBy,
    });

    console.log("✅ Attendance recorded successfully:", response.data);

    return response.data;
  } catch (error: any) {
    console.error("❌ Error recording attendance:", error);

    // Extract error message from Firebase error
    const errorMessage =
      error.message || error.details?.message || "Failed to record attendance";

    throw new Error(errorMessage);
  }
}

/**
 * Fetches yearly statistics for a group
 *
 * @param clubId - Club ID
 * @param groupId - Group ID
 * @param year - Year to fetch statistics for
 * @returns Promise with statistics data
 */
export async function getGroupStatistics(
  clubId: string,
  groupId: string,
  year: number,
): Promise<any> {
  try {
    const functions = getFunctions(undefined, "europe-north1");
    const getStatisticsFn = httpsCallable(functions, "getStatistics");

    const response = await getStatisticsFn({
      clubId,
      groupId,
      year,
    });

    return response.data;
  } catch (error: any) {
    console.error("❌ Error fetching statistics:", error);
    throw new Error(error.message || "Failed to fetch statistics");
  }
}
