/**
 * LOK-stöd Validation Engine (Server-side)
 *
 * Validates activities against Riksidrottsförbundet (RF) LOK-stöd requirements:
 * - Participants must be age 7–25
 * - Minimum 3 eligible participants (not counting leaders)
 * - Maximum 30 participants counted for funding per activity
 * - Activity duration must be ≥ 60 minutes
 * - At least 1 leader must be present
 * - Activity must be organized by a registered sports association (förening)
 * - Activity must occur within the reporting period
 */

import { getAgeAtDate } from "./encryptPersonnummer";

// ─── Types ─────────────────────────────────────────────────────

export interface LokParticipantInput {
  userId: string;
  personnummer: string; // Decrypted 12-digit YYYYMMDDXXXX
  role: "participant" | "leader";
  attended: boolean;
}

export interface LokActivityInput {
  eventId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  activityType: string; // "training" | "match" | "meeting" | "other"
  sport: string;
  groupId: string;
  groupName: string;
  participants: LokParticipantInput[];
}

export interface LokValidationResult {
  valid: boolean;
  eligible: boolean; // Whether this activity qualifies for LOK-stöd
  errors: LokValidationError[];
  warnings: LokValidationWarning[];
  summary: {
    totalParticipants: number;
    eligibleParticipants: number; // Age 7–25 who attended
    countedParticipants: number; // min(eligibleParticipants, 30)
    leaderCount: number;
    durationMinutes: number;
    activityDate: Date;
  };
}

export interface LokValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface LokValidationWarning {
  code: string;
  message: string;
}

// ─── Constants ─────────────────────────────────────────────────

export const LOK_CONSTANTS = {
  MIN_AGE: 7,
  MAX_AGE: 25,
  MIN_PARTICIPANTS: 3, // Minimum eligible participants (excluding leaders)
  MAX_COUNTED_PARTICIPANTS: 30, // Maximum participants counted for funding
  MIN_DURATION_MINUTES: 60,
  MIN_LEADERS: 1,
  // Reporting periods
  H1_START_MONTH: 0, // January (0-indexed)
  H1_END_MONTH: 5, // June
  H2_START_MONTH: 6, // July
  H2_END_MONTH: 11, // December
};

// ─── Validation Functions ──────────────────────────────────────

/**
 * Main validation function for a LOK-stöd activity.
 */
export const validateLokActivity = (
  activity: LokActivityInput,
): LokValidationResult => {
  const errors: LokValidationError[] = [];
  const warnings: LokValidationWarning[] = [];

  // 1. Validate activity date
  if (!activity.date) {
    errors.push({
      code: "MISSING_DATE",
      message: "Activity date is required.",
      field: "date",
    });
  }

  // 2. Validate duration
  const durationMinutes = calculateDurationMinutes(
    activity.startTime,
    activity.endTime,
  );

  if (durationMinutes < LOK_CONSTANTS.MIN_DURATION_MINUTES) {
    errors.push({
      code: "DURATION_TOO_SHORT",
      message: `Activity duration must be at least ${LOK_CONSTANTS.MIN_DURATION_MINUTES} minutes. Current: ${durationMinutes} minutes.`,
      field: "duration",
    });
  }

  // 3. Validate activity type
  const validTypes = ["training", "match", "meeting", "other"];
  if (!validTypes.includes(activity.activityType)) {
    errors.push({
      code: "INVALID_ACTIVITY_TYPE",
      message: `Invalid activity type: ${activity.activityType}. Must be one of: ${validTypes.join(", ")}.`,
      field: "activityType",
    });
  }

  // 4. Categorize participants
  const attendingParticipants = activity.participants.filter(
    (p) => p.attended && p.role === "participant",
  );
  const attendingLeaders = activity.participants.filter(
    (p) => p.attended && p.role === "leader",
  );

  // 5. Validate leaders
  if (attendingLeaders.length < LOK_CONSTANTS.MIN_LEADERS) {
    errors.push({
      code: "NO_LEADER",
      message: `At least ${LOK_CONSTANTS.MIN_LEADERS} leader must be present. Current: ${attendingLeaders.length}.`,
      field: "leaders",
    });
  }

  // 6. Check participant ages and count eligible ones
  const activityDate =
    activity.date instanceof Date ? activity.date : new Date(activity.date);

  const eligibleParticipants: LokParticipantInput[] = [];
  const ineligibleDueToAge: string[] = [];

  for (const participant of attendingParticipants) {
    if (!participant.personnummer) {
      warnings.push({
        code: "MISSING_PERSONNUMMER",
        message: `Participant ${participant.userId} has no personnummer — cannot verify age.`,
      });
      continue;
    }

    const age = getAgeAtDate(participant.personnummer, activityDate);

    if (age >= LOK_CONSTANTS.MIN_AGE && age <= LOK_CONSTANTS.MAX_AGE) {
      eligibleParticipants.push(participant);
    } else {
      ineligibleDueToAge.push(participant.userId);
    }
  }

  if (ineligibleDueToAge.length > 0) {
    warnings.push({
      code: "PARTICIPANTS_OUTSIDE_AGE_RANGE",
      message: `${ineligibleDueToAge.length} participant(s) are outside the age range ${LOK_CONSTANTS.MIN_AGE}–${LOK_CONSTANTS.MAX_AGE} and will not be counted.`,
    });
  }

  // 7. Check minimum eligible participants
  if (eligibleParticipants.length < LOK_CONSTANTS.MIN_PARTICIPANTS) {
    errors.push({
      code: "TOO_FEW_PARTICIPANTS",
      message: `Minimum ${LOK_CONSTANTS.MIN_PARTICIPANTS} eligible participants (age ${LOK_CONSTANTS.MIN_AGE}–${LOK_CONSTANTS.MAX_AGE}) required. Current: ${eligibleParticipants.length}.`,
      field: "participants",
    });
  }

  // 8. Cap at max counted participants
  const countedParticipants = Math.min(
    eligibleParticipants.length,
    LOK_CONSTANTS.MAX_COUNTED_PARTICIPANTS,
  );

  if (eligibleParticipants.length > LOK_CONSTANTS.MAX_COUNTED_PARTICIPANTS) {
    warnings.push({
      code: "PARTICIPANTS_CAPPED",
      message: `Eligible participants (${eligibleParticipants.length}) exceed maximum counted (${LOK_CONSTANTS.MAX_COUNTED_PARTICIPANTS}). Only ${LOK_CONSTANTS.MAX_COUNTED_PARTICIPANTS} will be reported.`,
    });
  }

  // 9. Validate sport field
  if (!activity.sport || activity.sport.trim().length === 0) {
    errors.push({
      code: "MISSING_SPORT",
      message: "Sport/activity type (idrott) must be specified.",
      field: "sport",
    });
  }

  const isEligible = errors.length === 0;

  return {
    valid: errors.length === 0,
    eligible: isEligible,
    errors,
    warnings,
    summary: {
      totalParticipants: attendingParticipants.length,
      eligibleParticipants: eligibleParticipants.length,
      countedParticipants,
      leaderCount: attendingLeaders.length,
      durationMinutes,
      activityDate,
    },
  };
};

/**
 * Validate an entire reporting period's activities.
 */
export const validateLokReportPeriod = (
  activities: LokActivityInput[],
  period: string, // e.g. "2026-H1"
): {
  valid: boolean;
  totalActivities: number;
  eligibleActivities: number;
  activityResults: {
    eventId: string;
    result: LokValidationResult;
  }[];
  periodErrors: LokValidationError[];
} => {
  const activityResults = activities.map((activity) => ({
    eventId: activity.eventId,
    result: validateLokActivity(activity),
  }));

  const eligibleActivities = activityResults.filter(
    (r) => r.result.eligible,
  ).length;

  const periodErrors: LokValidationError[] = [];

  // Validate period format
  const periodMatch = period.match(/^(\d{4})-H([12])$/);
  if (!periodMatch) {
    periodErrors.push({
      code: "INVALID_PERIOD",
      message: `Invalid reporting period format: ${period}. Expected: YYYY-H1 or YYYY-H2.`,
    });
  } else {
    const year = parseInt(periodMatch[1], 10);
    const half = parseInt(periodMatch[2], 10);

    // Check that all activities fall within the period
    const periodStart =
      half === 1 ? new Date(year, 0, 1) : new Date(year, 6, 1);
    const periodEnd =
      half === 1
        ? new Date(year, 6, 0) // June 30
        : new Date(year + 1, 0, 0); // Dec 31

    for (const activity of activities) {
      const actDate =
        activity.date instanceof Date ? activity.date : new Date(activity.date);

      if (actDate < periodStart || actDate > periodEnd) {
        periodErrors.push({
          code: "ACTIVITY_OUTSIDE_PERIOD",
          message: `Activity ${activity.eventId} (${actDate.toISOString().split("T")[0]}) falls outside reporting period ${period}.`,
        });
      }
    }
  }

  if (eligibleActivities === 0 && activities.length > 0) {
    periodErrors.push({
      code: "NO_ELIGIBLE_ACTIVITIES",
      message:
        "No activities in this period meet LOK-stöd eligibility requirements.",
    });
  }

  return {
    valid: periodErrors.length === 0 && eligibleActivities > 0,
    totalActivities: activities.length,
    eligibleActivities,
    activityResults,
    periodErrors,
  };
};

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Calculate duration between two timestamps in minutes.
 */
const calculateDurationMinutes = (start: Date, end: Date): number => {
  const startMs =
    start instanceof Date ? start.getTime() : new Date(start).getTime();
  const endMs = end instanceof Date ? end.getTime() : new Date(end).getTime();
  return Math.round((endMs - startMs) / (1000 * 60));
};

/**
 * Determine the LOK reporting period for a given date.
 */
export const getReportingPeriod = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const half = month <= LOK_CONSTANTS.H1_END_MONTH ? "H1" : "H2";
  return `${year}-${half}`;
};

/**
 * Get period date bounds.
 */
export const getPeriodBounds = (
  period: string,
): { start: Date; end: Date } | null => {
  const match = period.match(/^(\d{4})-H([12])$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const half = parseInt(match[2], 10);

  if (half === 1) {
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 5, 30, 23, 59, 59),
    };
  } else {
    return {
      start: new Date(year, 6, 1),
      end: new Date(year, 11, 31, 23, 59, 59),
    };
  }
};
