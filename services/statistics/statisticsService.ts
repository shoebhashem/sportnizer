/**
 * Statistics Service
 *
 * Central service for fetching and filtering attendance statistics
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import type {
    EventTypeFilter,
    FilteredMemberStats,
    MemberEventStats,
    MemberStatDisplay,
    YearlyAttendanceStatistics,
} from "../types/statistics";

/**
 * Fetches yearly attendance statistics for a group
 *
 * @param clubId - Club ID
 * @param groupId - Group ID
 * @param year - Year (e.g., 2026)
 * @returns Statistics data or null if not found
 */
export async function getGroupStatistics(
  clubId: string,
  groupId: string,
  year: number,
): Promise<YearlyAttendanceStatistics | null> {
  try {
    console.log("📊 Fetching group statistics:", { clubId, groupId, year });

    const functions = getFunctions(undefined, "europe-north1");
    const getStatisticsFn = httpsCallable<
      {
        clubId: string;
        groupId: string;
        year: number;
      },
      {
        success: boolean;
        statistics?: YearlyAttendanceStatistics;
        message?: string;
      }
    >(functions, "getStatistics");

    const response = await getStatisticsFn({
      clubId,
      groupId,
      year,
    });

    if (response.data.success && response.data.statistics) {
      console.log("✅ Statistics fetched successfully");
      return response.data.statistics;
    }

    console.log("⚠️ No statistics found:", response.data.message);
    return null;
  } catch (error: any) {
    console.error("❌ Error fetching statistics:", error);

    // Return null instead of throwing to allow empty state handling
    if (error.code === "permission-denied") {
      throw new Error("You don't have permission to view these statistics");
    }

    return null;
  }
}

/**
 * Filters member stats by event type
 *
 * @param memberStats - Member's full statistics
 * @param filter - Event type filter ('all', 'training', 'match', 'other')
 * @returns Filtered attendance rate and event counts
 */
export function filterMemberStatsByType(
  memberStats: MemberEventStats,
  filter: EventTypeFilter,
): FilteredMemberStats {
  if (filter === "all") {
    return {
      attendanceRate: memberStats.attendanceRate,
      eventsInvited: memberStats.eventsInvitedTo,
      eventsAttended: memberStats.eventsAttended,
    };
  }

  // Get type-specific stats
  const typeStats = memberStats.byEventType[filter];

  // Calculate type-specific attendance rate
  const attendanceRate =
    typeStats.invited > 0 ? (typeStats.attended / typeStats.invited) * 100 : 0;

  return {
    attendanceRate: Math.round(attendanceRate * 10) / 10, // Round to 1 decimal
    eventsInvited: typeStats.invited,
    eventsAttended: typeStats.attended,
  };
}

/**
 * Gets sorted member list for display
 *
 * @param statistics - Full statistics data
 * @param filter - Event type filter
 * @param sortBy - Sort by 'rate' (attendance rate) or 'name'
 * @returns Sorted array of member stats for display
 */
export function getSortedMemberList(
  statistics: YearlyAttendanceStatistics,
  filter: EventTypeFilter,
  sortBy: "rate" | "name" = "rate",
): MemberStatDisplay[] {
  const memberList: MemberStatDisplay[] = [];

  // Convert memberStats object to array
  Object.entries(statistics.memberStats).forEach(([userId, memberStats]) => {
    const filteredStats = filterMemberStatsByType(memberStats, filter);

    memberList.push({
      userId,
      userName: memberStats.userName,
      attendanceRate: filteredStats.attendanceRate,
      eventsInvited: filteredStats.eventsInvited,
      eventsAttended: filteredStats.eventsAttended,
    });
  });

  // Sort the list
  memberList.sort((a, b) => {
    if (sortBy === "rate") {
      // Sort by attendance rate (descending), then by name
      if (b.attendanceRate !== a.attendanceRate) {
        return b.attendanceRate - a.attendanceRate;
      }
      return a.userName.localeCompare(b.userName);
    } else {
      // Sort by name (ascending)
      return a.userName.localeCompare(b.userName);
    }
  });

  return memberList;
}

/**
 * Calculates group average for a specific filter
 *
 * @param statistics - Full statistics data
 * @param filter - Event type filter
 * @returns Average attendance rate for the group
 */
export function getGroupAverage(
  statistics: YearlyAttendanceStatistics,
  filter: EventTypeFilter,
): number {
  if (filter === "all") {
    return (
      Math.round(statistics.groupAggregates.averageAttendanceRate * 10) / 10
    );
  }

  // Calculate type-specific average
  const memberList = getSortedMemberList(statistics, filter);

  if (memberList.length === 0) {
    return 0;
  }

  const totalRate = memberList.reduce(
    (sum, member) => sum + member.attendanceRate,
    0,
  );

  return Math.round((totalRate / memberList.length) * 10) / 10;
}
