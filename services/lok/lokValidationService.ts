/**
 * LOK Validation Service (Frontend)
 *
 * Client-side LOK-stöd validation helpers for the UI.
 * The full validation engine runs server-side in Cloud Functions.
 * This provides quick client-side feedback and UI helpers.
 */

// ─── Constants (mirror server-side) ────────────────────────────

export const LOK_RULES = {
  MIN_AGE: 6,
  MAX_AGE: 25,
  MIN_PARTICIPANTS: 3,
  MAX_COUNTED_PARTICIPANTS: 30,
  MIN_DURATION_MINUTES: 60,
  MIN_LEADERS: 1,
} as const;

// ─── Types ─────────────────────────────────────────────────────

export interface LokEligibilityCheck {
  eligible: boolean;
  reasons: string[]; // Translation keys for why not eligible
  warnings: string[]; // Translation keys for warnings
}

export interface LokEventSummary {
  participantCount: number;
  eligibleCount: number; // Age 7-25
  leaderCount: number;
  durationMinutes: number;
  isEligible: boolean;
}

// ─── Validation Helpers ────────────────────────────────────────

/**
 * Quick client-side check for LOK eligibility.
 * Used to show real-time feedback in the event completion UI.
 */
export const checkEventLokEligibility = (params: {
  durationMinutes: number;
  participantCount: number; // Participants age 7-25 who attended
  leaderCount: number; // Leaders who attended
  hasAttendanceRecorded: boolean;
}): LokEligibilityCheck => {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!params.hasAttendanceRecorded) {
    reasons.push("lok.validation.attendanceNotRecorded");
  }

  if (params.durationMinutes < LOK_RULES.MIN_DURATION_MINUTES) {
    reasons.push("lok.validation.durationTooShort");
  }

  if (params.participantCount < LOK_RULES.MIN_PARTICIPANTS) {
    reasons.push("lok.validation.tooFewParticipants");
  }

  if (params.leaderCount < LOK_RULES.MIN_LEADERS) {
    reasons.push("lok.validation.noLeader");
  }

  if (params.participantCount > LOK_RULES.MAX_COUNTED_PARTICIPANTS) {
    warnings.push("lok.validation.participantsCapped");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    warnings,
  };
};

/**
 * Calculate event duration in minutes from start/end times.
 */
export const calculateDurationMinutes = (
  startDate: Date,
  endDate: Date,
): number => {
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60)));
};

/**
 * Check if a participant's age falls within LOK range.
 * Birth date can be derived from personnummer on the server,
 * but we may have dateOfBirth in the user profile.
 */
export const isAgeLokEligible = (
  dateOfBirth: Date,
  activityDate: Date = new Date(),
): boolean => {
  const age = calculateAge(dateOfBirth, activityDate);
  return age >= LOK_RULES.MIN_AGE && age <= LOK_RULES.MAX_AGE;
};

/**
 * Calculate age at a given date.
 */
export const calculateAge = (
  dateOfBirth: Date,
  atDate: Date = new Date(),
): number => {
  let age = atDate.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = atDate.getMonth() - dateOfBirth.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && atDate.getDate() < dateOfBirth.getDate())
  ) {
    age--;
  }
  return age;
};

/**
 * Get the current LOK reporting period.
 */
export const getCurrentReportingPeriod = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const half = now.getMonth() <= 5 ? "H1" : "H2";
  return `${year}-${half}`;
};

/**
 * Get display label for a reporting period.
 */
export const getReportingPeriodLabel = (period: string): string => {
  const match = period.match(/^(\d{4})-H([12])$/);
  if (!match) return period;

  const year = match[1];
  const half = match[2];

  return half === "1" ? `${year} Jan–Jun` : `${year} Jul–Dec`;
};

/**
 * Get the submission deadline for a reporting period.
 * H1 (Jan-Jun): deadline ~25 Aug same year
 * H2 (Jul-Dec): deadline ~25 Feb next year
 */
export const getSubmissionDeadline = (period: string): Date | null => {
  const match = period.match(/^(\d{4})-H([12])$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const half = parseInt(match[2], 10);

  if (half === 1) {
    return new Date(year, 7, 25); // Aug 25
  } else {
    return new Date(year + 1, 1, 25); // Feb 25 next year
  }
};

/**
 * Check if we're within the submission window for a period.
 */
export const isWithinSubmissionWindow = (period: string): boolean => {
  const deadline = getSubmissionDeadline(period);
  if (!deadline) return false;

  const now = new Date();
  const match = period.match(/^(\d{4})-H([12])$/);
  if (!match) return false;

  const year = parseInt(match[1], 10);
  const half = parseInt(match[2], 10);

  // Period must have ended
  const periodEnd =
    half === 1
      ? new Date(year, 5, 30, 23, 59, 59)
      : new Date(year, 11, 31, 23, 59, 59);

  return now > periodEnd && now <= deadline;
};

// ─── Service Export ────────────────────────────────────────────

export const lokValidationService = {
  LOK_RULES,
  checkEventLokEligibility,
  calculateDurationMinutes,
  isAgeLokEligible,
  calculateAge,
  getCurrentReportingPeriod,
  getReportingPeriodLabel,
  getSubmissionDeadline,
  isWithinSubmissionWindow,
};

export default lokValidationService;
