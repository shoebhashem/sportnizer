/**
 * Kommun (Municipality) Export Service
 *
 * Generates attendance reports in CSV format for submission to Swedish municipalities.
 * Many kommun require attendance reports separately from RF's LOK-stöd system.
 *
 * Export formats:
 * - CSV: Comma-separated values for spreadsheet import (primary)
 * - JSON: Structured data for programmatic consumption
 *
 * Note: PDF generation would require a library like PDFKit.
 * For now, CSV is the most universally compatible format.
 * PDF can be added later by installing pdfkit to functions/package.json.
 */

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isClubAdmin } from "../utils/roleValidation";

// ─── Types ─────────────────────────────────────────────────────

interface KommunExportOptions {
  clubId: string;
  period: string; // e.g. "2026-H1"
  format: "csv" | "json";
  includeParticipantDetails: boolean; // If false, only summary data
}

interface KommunExportRow {
  date: string;
  activityType: string;
  sport: string;
  groupName: string;
  durationMinutes: number;
  participantCount: number;
  leaderCount: number;
  eligibleParticipants: number; // Age 7-25
  location?: string;
}

// ─── Cloud Functions ───────────────────────────────────────────

/**
 * Generate kommun attendance export from LOK report data.
 * Returns the export content as a string (CSV or JSON).
 */
export const generateKommunExport = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const {
      clubId,
      period,
      format = "csv",
      includeParticipantDetails = false,
    } = request.data as KommunExportOptions;

    if (!clubId || !period) {
      throw new HttpsError(
        "invalid-argument",
        "clubId and period are required.",
      );
    }

    const db = admin.firestore();
    const userId = request.auth.uid;

    // Verify caller is club admin
    const clubDoc = await db.collection("clubs").doc(clubId).get();
    if (!clubDoc.exists) {
      throw new HttpsError("not-found", "Club not found.");
    }

    const clubData = clubDoc.data()!;
    const hasPermission = await isClubAdmin(userId, clubId);
    if (!hasPermission) {
      throw new HttpsError(
        "permission-denied",
        "Only club admins can generate exports.",
      );
    }

    // Find the LOK report for this period
    const reportsSnapshot = await db
      .collection("lokReports")
      .where("clubId", "==", clubId)
      .where("period", "==", period)
      .limit(1)
      .get();

    if (reportsSnapshot.empty) {
      throw new HttpsError(
        "not-found",
        `No LOK report found for club ${clubId}, period ${period}. Generate a LOK report first.`,
      );
    }

    const report = reportsSnapshot.docs[0].data();

    // Build export rows
    const rows: KommunExportRow[] = (report.activities || []).map(
      (act: any) => {
        const participantsByRole = (act.participants || []).reduce(
          (acc: any, p: any) => {
            if (p.role === "leader") acc.leaders++;
            else acc.participants++;
            return acc;
          },
          { participants: 0, leaders: 0 },
        );

        return {
          date: act.date?.toDate?.()
            ? act.date.toDate().toISOString().split("T")[0]
            : new Date(act.date).toISOString().split("T")[0],
          activityType: act.activityType,
          sport: act.sport,
          groupName: act.groupName,
          durationMinutes: act.durationMinutes,
          participantCount: act.participantCount,
          leaderCount: participantsByRole.leaders,
          eligibleParticipants: participantsByRole.participants,
        };
      },
    );

    // Sort by date
    rows.sort((a, b) => a.date.localeCompare(b.date));

    let content: string;
    let mimeType: string;
    let filename: string;

    const clubNameSafe = clubData.name.replace(/[^a-zA-Z0-9åäöÅÄÖ]/g, "_");

    if (format === "csv") {
      content = generateCsv(
        rows,
        clubData,
        report,
        period,
        includeParticipantDetails,
      );
      mimeType = "text/csv;charset=utf-8";
      filename = `${clubNameSafe}_kommun_${period}.csv`;
    } else {
      content = generateJson(rows, clubData, report, period);
      mimeType = "application/json";
      filename = `${clubNameSafe}_kommun_${period}.json`;
    }

    console.log(
      `📋 Generated kommun export for club ${clubId}, period ${period}: ${rows.length} activities, format: ${format}`,
    );

    return {
      success: true,
      content,
      mimeType,
      filename,
      summary: {
        totalActivities: rows.length,
        totalParticipants: report.totalParticipants,
        totalLeaders: report.totalLeaders,
        period,
      },
    };
  },
);

// ─── Format Generators ─────────────────────────────────────────

/**
 * Generate CSV content for kommun export.
 */
const generateCsv = (
  rows: KommunExportRow[],
  clubData: any,
  report: any,
  period: string,
  includeDetails: boolean,
): string => {
  const BOM = "\uFEFF"; // UTF-8 BOM for proper Swedish character display in Excel
  const lines: string[] = [];

  // Header section
  lines.push(`Närvarorapport - ${clubData.name}`);
  lines.push(`Period: ${period}`);
  lines.push(
    `Organisationsnummer: ${clubData.rf?.organizationNumber || "N/A"}`,
  );
  lines.push(`Kommun: ${clubData.rf?.municipality || "N/A"}`);
  lines.push(`Genererad: ${new Date().toISOString().split("T")[0]}`);
  lines.push(""); // Empty line separator

  // Summary
  lines.push(`Totalt antal aktiviteter: ${rows.length}`);
  lines.push(`Totalt antal deltagare (unika): ${report.totalParticipants}`);
  lines.push(`Totalt antal ledare (unika): ${report.totalLeaders}`);
  lines.push("");

  // Column headers
  const headers = [
    "Datum",
    "Aktivitetstyp",
    "Idrott",
    "Grupp",
    "Längd (min)",
    "Deltagare (7-25 år)",
    "Ledare",
    "Totalt närvarande",
  ];
  lines.push(headers.join(";"));

  // Data rows (using semicolon as delimiter for Swedish Excel compatibility)
  for (const row of rows) {
    const values = [
      row.date,
      translateActivityType(row.activityType),
      row.sport,
      row.groupName,
      row.durationMinutes.toString(),
      row.eligibleParticipants.toString(),
      row.leaderCount.toString(),
      (row.eligibleParticipants + row.leaderCount).toString(),
    ];
    lines.push(values.map(escapeCsvField).join(";"));
  }

  // Footer summary
  lines.push("");
  lines.push(
    `Summa;;;;;;${rows.reduce((s, r) => s + r.leaderCount, 0)};${rows.reduce((s, r) => s + r.eligibleParticipants + r.leaderCount, 0)}`,
  );

  return BOM + lines.join("\n");
};

/**
 * Generate JSON content for kommun export.
 */
const generateJson = (
  rows: KommunExportRow[],
  clubData: any,
  report: any,
  period: string,
): string => {
  const exportData = {
    metadata: {
      clubName: clubData.name,
      organizationNumber: clubData.rf?.organizationNumber || null,
      municipality: clubData.rf?.municipality || null,
      period,
      generatedAt: new Date().toISOString(),
      format: "clubnizer-kommun-export-v1",
    },
    summary: {
      totalActivities: rows.length,
      totalUniqueParticipants: report.totalParticipants,
      totalUniqueLeaders: report.totalLeaders,
    },
    activities: rows,
  };

  return JSON.stringify(exportData, null, 2);
};

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Escape a CSV field value.
 */
const escapeCsvField = (value: string): string => {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

/**
 * Translate activity type to Swedish for kommun reports.
 */
const translateActivityType = (type: string): string => {
  const translations: Record<string, string> = {
    training: "Träning",
    match: "Match/Tävling",
    meeting: "Möte",
    other: "Övrigt",
  };
  return translations[type] || type;
};
