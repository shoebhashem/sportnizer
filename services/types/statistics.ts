/**
 * Statistics Type Definitions
 *
 * Client-side types for attendance statistics
 */

export interface MemberEventStats {
  userName: string;
  eventsInvitedTo: number;
  eventsAccepted: number;
  eventsDeclined: number;
  eventsAttended: number;
  attendanceRate: number;
  responseRate: number;
  byEventType: {
    training: { invited: number; attended: number };
    match: { invited: number; attended: number };
    meeting: { invited: number; attended: number };
    other: { invited: number; attended: number };
  };
  lastUpdated: any; // Timestamp
}

export interface YearlyAttendanceStatistics {
  year: number;
  groupId: string;
  groupName: string;
  clubId: string;
  memberStats: {
    [userId: string]: MemberEventStats;
  };
  groupAggregates: {
    totalEvents: number;
    totalEventsByType: {
      training: number;
      match: number;
      meeting: number;
      other: number;
    };
    averageAttendanceRate: number;
  };
  createdAt: any; // Timestamp
  lastUpdated: any; // Timestamp
}

export type EventTypeFilter = "all" | "training" | "match" | "other";

export interface FilteredMemberStats {
  attendanceRate: number;
  eventsInvited: number;
  eventsAttended: number;
}

export interface MemberStatDisplay {
  userId: string;
  userName: string;
  attendanceRate: number;
  eventsInvited: number;
  eventsAttended: number;
  photoUrl?: string;
}
