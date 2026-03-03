/**
 * RF (Riksidrottsförbundet) API 2.0 Integration Service
 *
 * Handles communication with RF's REST API via Gravitee Integration Platform.
 * This service submits LOK-stöd attendance reports to RF.
 *
 * Prerequisites:
 * - License agreement with RF (Riksidrottsförbundet)
 * - API credentials from Gravitee Integration Platform
 * - Club registered in RF's system (IdrottOnline)
 *
 * RF API 2.0 Documentation:
 * - Base URL: https://api.rf.se/v2 (via Gravitee gateway)
 * - Authentication: API key + OAuth2 client credentials
 * - Old XML/SFTP import deprecated (avvecklat 2025-12-31)
 * - Old REST export deprecated (avvecklat 2026-02-02)
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isClubAdmin } from "../utils/roleValidation";

// ─── Types ─────────────────────────────────────────────────────

interface RfApiConfig {
  baseUrl: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

interface RfTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface RfSubmissionActivity {
  date: string; // ISO 8601 date
  duration_minutes: number;
  activity_type: string;
  sport: string;
  group_name: string;
  participants: {
    personal_number: string; // YYYYMMDDXXXX
    role: "participant" | "leader";
    age_at_activity: number;
  }[];
  participant_count: number;
}

interface RfSubmissionPayload {
  organization_id: string;
  organization_number: string;
  period: string;
  period_start: string; // ISO 8601
  period_end: string; // ISO 8601
  activities: RfSubmissionActivity[];
  total_activities: number;
  total_participants: number;
  total_leaders: number;
}

interface RfSubmissionResponse {
  receipt_id: string;
  status: "accepted" | "rejected" | "pending_review";
  errors?: {
    code: string;
    message: string;
    activity_index?: number;
  }[];
  warnings?: {
    code: string;
    message: string;
  }[];
}

// Cache the OAuth token in memory
let cachedToken: { token: string; expiresAt: number } | null = null;

// ─── API Communication ─────────────────────────────────────────

/**
 * Get RF API configuration from environment.
 * These should be set via Firebase secrets:
 *   firebase functions:secrets:set RF_API_KEY
 *   firebase functions:secrets:set RF_CLIENT_ID
 *   firebase functions:secrets:set RF_CLIENT_SECRET
 */
const getRfApiConfig = (): RfApiConfig => {
  const config: RfApiConfig = {
    baseUrl: process.env.RF_API_BASE_URL || "https://api.rf.se/v2",
    apiKey: process.env.RF_API_KEY || "",
    clientId: process.env.RF_CLIENT_ID || "",
    clientSecret: process.env.RF_CLIENT_SECRET || "",
  };

  if (!config.apiKey || !config.clientId || !config.clientSecret) {
    throw new HttpsError(
      "failed-precondition",
      "RF API credentials not configured. Contact system administrator.",
    );
  }

  return config;
};

/**
 * Obtain OAuth2 access token from RF's auth endpoint.
 */
const getAccessToken = async (): Promise<string> => {
  // Check cached token
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const config = getRfApiConfig();

  const response = await fetch(`${config.baseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-API-Key": config.apiKey,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("RF OAuth error:", response.status, errorText);
    throw new HttpsError("unavailable", "Failed to authenticate with RF API.");
  }

  const data = (await response.json()) as RfTokenResponse;

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
};

/**
 * Make an authenticated request to the RF API.
 */
const rfApiRequest = async (
  method: string,
  path: string,
  body?: any,
): Promise<any> => {
  const config = getRfApiConfig();
  const token = await getAccessToken();

  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-API-Key": config.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `RF API error (${method} ${path}):`,
      response.status,
      errorText,
    );

    if (response.status === 401) {
      // Token may have expired, clear cache
      cachedToken = null;
      throw new HttpsError("unauthenticated", "RF API authentication failed.");
    }

    throw new HttpsError(
      "unavailable",
      `RF API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
};

// ─── Cloud Functions ───────────────────────────────────────────

/**
 * Submit a LOK report to RF via their API.
 * This transitions a draft report to "submitted" status.
 */
export const submitLokReportToRf = onCall(
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

    const report = reportDoc.data()!;

    // Only draft reports can be submitted
    if (report.status !== "draft") {
      throw new HttpsError(
        "failed-precondition",
        `Cannot submit a report with status "${report.status}". Only draft reports can be submitted.`,
      );
    }

    // Verify caller is club admin
    const clubDoc = await db.collection("clubs").doc(report.clubId).get();
    if (!clubDoc.exists) {
      throw new HttpsError("not-found", "Club not found.");
    }
    const clubData = clubDoc.data()!;
    const hasPermission = await isClubAdmin(request.auth.uid, report.clubId);
    if (!hasPermission) {
      throw new HttpsError(
        "permission-denied",
        "Only club admins can submit LOK reports.",
      );
    }

    // Build RF API payload
    const payload: RfSubmissionPayload = {
      organization_id: clubData.rf?.rfOrganizationId || "",
      organization_number: report.organizationNumber,
      period: report.period,
      period_start:
        report.periodStart?.toDate?.()?.toISOString() ||
        new Date(report.periodStart).toISOString(),
      period_end:
        report.periodEnd?.toDate?.()?.toISOString() ||
        new Date(report.periodEnd).toISOString(),
      activities: report.activities.map((act: any) => ({
        date:
          act.date?.toDate?.()?.toISOString?.()?.split("T")[0] ||
          new Date(act.date).toISOString().split("T")[0],
        duration_minutes: act.durationMinutes,
        activity_type: act.activityType,
        sport: act.sport,
        group_name: act.groupName,
        participants: act.participants.map((p: any) => ({
          personal_number: p.personalNumber,
          role: p.role,
          age_at_activity: p.ageAtActivity,
        })),
        participant_count: act.participantCount,
      })),
      total_activities: report.totalActivities,
      total_participants: report.totalParticipants,
      total_leaders: report.totalLeaders,
    };

    try {
      // Submit to RF API
      const rfResponse: RfSubmissionResponse = await rfApiRequest(
        "POST",
        "/lok/reports",
        payload,
      );

      const now = FieldValue.serverTimestamp();

      // Update report status based on RF response
      const updateData: Record<string, any> = {
        status:
          rfResponse.status === "accepted"
            ? "accepted"
            : rfResponse.status === "rejected"
              ? "rejected"
              : "submitted",
        submittedAt: now,
        submittedBy: request.auth.uid,
        rfReceiptId: rfResponse.receipt_id,
        lastUpdatedAt: now,
      };

      if (rfResponse.errors && rfResponse.errors.length > 0) {
        updateData.rfErrors = rfResponse.errors.map(
          (e) => `[${e.code}] ${e.message}`,
        );
      }

      await reportDoc.ref.update(updateData);

      // Update club's last sync timestamp
      await db.collection("clubs").doc(report.clubId).update({
        "rf.lastSyncAt": now,
        "rf.integrationStatus": "active",
      });

      console.log(
        `📤 LOK report ${reportId} submitted to RF. Status: ${rfResponse.status}, Receipt: ${rfResponse.receipt_id}`,
      );

      return {
        success: true,
        status: rfResponse.status,
        receiptId: rfResponse.receipt_id,
        errors: rfResponse.errors || [],
        warnings: rfResponse.warnings || [],
      };
    } catch (error: any) {
      // Update report to reflect the error
      await reportDoc.ref.update({
        "rf.lastError": error.message || "Unknown error",
        lastUpdatedAt: FieldValue.serverTimestamp(),
      });

      // Update club integration status
      await db.collection("clubs").doc(report.clubId).update({
        "rf.integrationStatus": "error",
      });

      throw error;
    }
  },
);

/**
 * Check RF API connection status.
 * Useful for verifying credentials are valid before submitting reports.
 */
export const checkRfApiStatus = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    try {
      // Attempt to get an OAuth token — validates credentials
      await getAccessToken();

      return {
        success: true,
        connected: true,
        message: "RF API connection successful.",
      };
    } catch (error: any) {
      return {
        success: true,
        connected: false,
        message: error.message || "Failed to connect to RF API.",
      };
    }
  },
);

/**
 * Update club RF integration settings.
 */
export const updateClubRfSettings = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { clubId, rfSettings } = request.data;

    if (!clubId || !rfSettings) {
      throw new HttpsError(
        "invalid-argument",
        "clubId and rfSettings are required.",
      );
    }

    const db = admin.firestore();

    // Verify caller is club admin
    const hasPermission = await isClubAdmin(request.auth.uid, clubId);
    if (!hasPermission) {
      throw new HttpsError(
        "permission-denied",
        "Only club admins can update RF settings.",
      );
    }

    // Validate organization number format (XXXXXX-XXXX)
    if (rfSettings.organizationNumber) {
      const orgNrPattern = /^\d{6}-\d{4}$/;
      if (!orgNrPattern.test(rfSettings.organizationNumber)) {
        throw new HttpsError(
          "invalid-argument",
          "Organization number must be in format XXXXXX-XXXX.",
        );
      }
    }

    const updateData: Record<string, any> = {};

    if (rfSettings.organizationNumber !== undefined) {
      updateData["rf.organizationNumber"] = rfSettings.organizationNumber;
    }
    if (rfSettings.rfOrganizationId !== undefined) {
      updateData["rf.rfOrganizationId"] = rfSettings.rfOrganizationId;
    }
    if (rfSettings.districtId !== undefined) {
      updateData["rf.districtId"] = rfSettings.districtId;
    }
    if (rfSettings.municipality !== undefined) {
      updateData["rf.municipality"] = rfSettings.municipality;
    }
    if (rfSettings.integrationEnabled !== undefined) {
      updateData["rf.integrationEnabled"] = rfSettings.integrationEnabled;
    }

    updateData["rf.integrationStatus"] = "pending";
    updateData.lastModifiedAt = FieldValue.serverTimestamp();

    await db.collection("clubs").doc(clubId).update(updateData);

    console.log(`⚙️ RF settings updated for club ${clubId}`);

    return { success: true };
  },
);
