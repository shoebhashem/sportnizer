/**
 * RF Integration & Kommun Export Service (Frontend)
 *
 * Provides frontend service layer for:
 * - LOK report management (generate, view, submit)
 * - RF API status checking
 * - Club RF settings management
 * - Kommun export generation
 */

import { httpsCallable } from "firebase/functions";
import { functions } from "../core/firebase";

// ─── Types ─────────────────────────────────────────────────────

export interface LokReportSummary {
  id: string;
  period: string;
  status: "draft" | "stale" | "submitted" | "accepted" | "rejected";
  totalActivities: number;
  totalParticipants: number;
  totalLeaders: number;
  submittedAt?: any;
  rfReceiptId?: string;
  createdAt: any;
  staledAt?: any;
  staledByEvent?: string;
}

export interface GenerateReportResult {
  success: boolean;
  empty?: boolean;
  info?: string;
  totalActivities?: number;
  reportId?: string;
  summary?: {
    totalActivities: number;
    totalParticipants: number;
    totalLeaders: number;
    skippedActivities: number;
    warnings: string[];
  };
  error?: string;
}

export interface SubmitReportResult {
  success: boolean;
  status?: string;
  receiptId?: string;
  errors?: { code: string; message: string }[];
  warnings?: { code: string; message: string }[];
  error?: string;
}

export interface RfApiStatusResult {
  success: boolean;
  connected: boolean;
  message: string;
}

export interface RfSettings {
  organizationNumber?: string;
  rfOrganizationId?: string;
  districtId?: string;
  municipality?: string;
  integrationEnabled?: boolean;
}

export interface KommunExportResult {
  success: boolean;
  content?: string;
  mimeType?: string;
  filename?: string;
  summary?: {
    totalActivities: number;
    totalParticipants: number;
    totalLeaders: number;
    period: string;
  };
  error?: string;
}

// ─── LOK Report Functions ──────────────────────────────────────

/**
 * Generate a draft LOK report for a period.
 */
export const generateLokReport = async (
  clubId: string,
  period: string,
  force?: boolean,
): Promise<GenerateReportResult> => {
  try {
    const fn = httpsCallable(functions, "generateLokReport");
    const result = await fn({ clubId, period, ...(force ? { force: true } : {}) });
    return result.data as GenerateReportResult;
  } catch (error: any) {
    console.error("Error generating LOK report:", error);
    return {
      success: false,
      error: error.message || "Failed to generate LOK report.",
    };
  }
};

/**
 * Get LOK report details.
 */
export const getLokReport = async (
  reportId: string,
): Promise<{ success: boolean; report?: any; error?: string }> => {
  try {
    const fn = httpsCallable(functions, "getLokReport");
    const result = await fn({ reportId });
    return result.data as any;
  } catch (error: any) {
    console.error("Error getting LOK report:", error);
    return {
      success: false,
      error: error.message || "Failed to get LOK report.",
    };
  }
};

/**
 * List LOK reports for a club.
 */
export const listLokReports = async (
  clubId: string,
  status?: string,
): Promise<{
  success: boolean;
  reports: LokReportSummary[];
  error?: string;
}> => {
  try {
    const fn = httpsCallable(functions, "listLokReports");
    const result = await fn({ clubId, status });
    return result.data as any;
  } catch (error: any) {
    console.error("Error listing LOK reports:", error);
    return {
      success: false,
      reports: [],
      error: error.message || "Failed to list LOK reports.",
    };
  }
};

/**
 * Delete a draft LOK report.
 */
export const deleteLokReport = async (
  reportId: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const fn = httpsCallable(functions, "deleteLokReport");
    const result = await fn({ reportId });
    return result.data as any;
  } catch (error: any) {
    console.error("Error deleting LOK report:", error);
    return {
      success: false,
      error: error.message || "Failed to delete LOK report.",
    };
  }
};

/**
 * Resolve a conflict in a draft LOK report.
 */
export const resolveReportConflict = async (
  reportId: string,
  conflictIndex: number,
  resolution: "keep_first" | "keep_second" | "exclude_both",
): Promise<{
  success: boolean;
  hasUnresolvedConflicts?: boolean;
  error?: string;
}> => {
  try {
    const fn = httpsCallable(functions, "resolveReportConflict");
    const result = await fn({ reportId, conflictIndex, resolution });
    return result.data as any;
  } catch (error: any) {
    console.error("Error resolving LOK report conflict:", error);
    return {
      success: false,
      error: error.message || "Failed to resolve conflict.",
    };
  }
};

// ─── RF API Functions ──────────────────────────────────────────

/**
 * Submit a LOK report to RF.
 */
export const submitLokReportToRf = async (
  reportId: string,
): Promise<SubmitReportResult> => {
  try {
    const fn = httpsCallable(functions, "submitLokReportToRf");
    const result = await fn({ reportId });
    return result.data as SubmitReportResult;
  } catch (error: any) {
    console.error("Error submitting LOK report:", error);
    return {
      success: false,
      error: error.message || "Failed to submit LOK report to RF.",
    };
  }
};

/**
 * Check RF API connection status.
 */
export const checkRfApiStatus = async (): Promise<RfApiStatusResult> => {
  try {
    const fn = httpsCallable(functions, "checkRfApiStatus");
    const result = await fn();
    return result.data as RfApiStatusResult;
  } catch (error: any) {
    console.error("Error checking RF API status:", error);
    return {
      success: false,
      connected: false,
      message: error.message || "Failed to check RF API status.",
    };
  }
};

/**
 * Update club RF integration settings.
 */
export const updateClubRfSettings = async (
  clubId: string,
  rfSettings: RfSettings,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const fn = httpsCallable(functions, "updateClubRfSettings");
    const result = await fn({ clubId, rfSettings });
    return result.data as any;
  } catch (error: any) {
    console.error("Error updating RF settings:", error);
    return {
      success: false,
      error: error.message || "Failed to update RF settings.",
    };
  }
};

// ─── Kommun Export Functions ───────────────────────────────────

/**
 * Generate kommun attendance export.
 */
export const generateKommunExport = async (
  clubId: string,
  period: string,
  format: "csv" | "json" | "xml" = "csv",
): Promise<KommunExportResult> => {
  try {
    const fn = httpsCallable(functions, "generateKommunExport");
    const result = await fn({ clubId, period, format });
    return result.data as KommunExportResult;
  } catch (error: any) {
    console.error("Error generating kommun export:", error);
    return {
      success: false,
      error: error.message || "Failed to generate export.",
    };
  }
};

/**
 * Download kommun export content as a file (web platform).
 * Creates a blob URL and triggers download.
 */
export const downloadKommunExport = (
  content: string,
  filename: string,
  mimeType: string,
): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ─── LOK Eligible Events ───────────────────────────────────────

/** Attendance record for an eligible event (no personnummer). */
export interface LokEventAttendee {
  userId: string;
  userName: string;
  photoUrl: string | null;
  actualAttendance: boolean;
  lokRole: "participant" | "leader";
}

/** Eligible event as returned by listEligibleEvents. */
export interface LokEligibleEvent {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  groupId: string | null;
  groupName: string | null;
  eventType: string;
  completedAt: string | null;
  lok: {
    eligible: boolean;
    countedParticipants: number | null;
    durationMinutes: number | null;
    reportId: string | null;
    reportingPeriod: string | null;
    conflictStatus: "clean" | "conflict" | null;
    confirmedForPeriod: string | null;
  };
  responses: LokEventAttendee[];
  attendedCount: number;
}

/**
 * List LOK-eligible completed events for a period/group.
 */
export const listEligibleEvents = async (
  clubId: string,
  period?: string,
  groupId?: string,
): Promise<{ success: boolean; events: LokEligibleEvent[]; error?: string }> => {
  try {
    const fn = httpsCallable(functions, "listEligibleEvents");
    const result = await fn({ clubId, period, groupId });
    return result.data as any;
  } catch (error: any) {
    console.error("Error listing eligible events:", error);
    return {
      success: false,
      events: [],
      error: error.message || "Failed to list eligible events.",
    };
  }
};

/**
 * Re-edit attendance on a completed event (club admin only).
 * Marks any linked LOK report as stale.
 */
export const reEditAttendance = async (
  eventId: string,
  clubId: string,
  attendanceRecords: { userId: string; attended: boolean }[],
  recordedBy: string,
): Promise<{ success: boolean; attendedCount?: number; error?: string }> => {
  try {
    const fn = httpsCallable(functions, "reEditAttendance");
    const result = await fn({ eventId, clubId, attendanceRecords, recordedBy });
    return result.data as any;
  } catch (error: any) {
    console.error("Error re-editing attendance:", error);
    return {
      success: false,
      error: error.message || "Failed to re-edit attendance.",
    };
  }
};

// ─── Service Export ────────────────────────────────────────────

export const rfService = {
  generateLokReport,
  getLokReport,
  listLokReports,
  deleteLokReport,
  resolveReportConflict,
  submitLokReportToRf,
  checkRfApiStatus,
  updateClubRfSettings,
  generateKommunExport,
  downloadKommunExport,
  listEligibleEvents,
  reEditAttendance,
};

export default rfService;
