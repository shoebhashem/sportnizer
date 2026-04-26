import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { ChartAccount } from "../config/accounting";
import { config } from "../utils/config";

export type ExportFormat = "csv" | "sie" | "saft";

interface VerificationLine {
  account: number;
  debit: number;
  credit: number;
  description: string;
}

interface Verification {
  verNumber: number;
  date: admin.firestore.Timestamp;
  description: string;
  lines: VerificationLine[];
  sourceType: string;
  feeTitle?: string;
  category?: string;
}

/**
 * Unified accounting export function.
 *
 * Supports three formats selected by the caller:
 *   csv   — Universal spreadsheet-compatible export, works in any country
 *   sie   — SIE 4E (Sweden): accepted by Visma, Fortnox and all Swedish accounting systems
 *   saft  — SAF-T XML (Norway, Portugal, Poland and other EU countries)
 *
 * Uses the club's own chart of accounts for account names.
 * Falls back to account numbers when the chart has no matching entry.
 *
 * SECURITY: Only club admins may export.
 */
export const exportAccountingData = onCall(
  { region: config.region },
  async (
    request,
  ): Promise<{ success: boolean; content: string; filename: string }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, year, format } = request.data;

    if (!clubId || typeof clubId !== "string") {
      throw new HttpsError("invalid-argument", "clubId is required");
    }

    const validFormats: ExportFormat[] = ["csv", "sie", "saft"];
    const exportFormat: ExportFormat = validFormats.includes(format)
      ? format
      : "csv";

    const fiscalYear = year ? Number(year) : new Date().getFullYear();

    const db = admin.firestore();

    // Verify club-admin access
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!userDoc.exists) throw new HttpsError("not-found", "User not found");

    const clubAccess: any[] = userDoc.data()?.clubAccess || [];
    const access = clubAccess.find((a: any) => a.clubId === clubId);
    if (!access || access.role !== "club-admin") {
      throw new HttpsError("permission-denied", "Club admin access required");
    }

    // Fetch club metadata
    const clubDoc = await db.collection("clubs").doc(clubId).get();
    if (!clubDoc.exists) throw new HttpsError("not-found", "Club not found");
    const clubName: string = clubDoc.data()?.name ?? "Unknown Club";
    const clubCurrency: string = (
      clubDoc.data()?.currency ?? "sek"
    ).toUpperCase();

    // Fetch chart of accounts for this club (for account names in exports)
    const chartSnap = await db
      .collection("clubs")
      .doc(clubId)
      .collection("chartOfAccounts")
      .get();

    const chartByNumber: Record<number, ChartAccount> = {};
    chartSnap.docs.forEach((d) => {
      const a = d.data() as ChartAccount;
      chartByNumber[a.number] = a;
    });

    // Fetch verifications for the fiscal year
    const from = admin.firestore.Timestamp.fromDate(
      new Date(`${fiscalYear}-01-01T00:00:00Z`),
    );
    const to = admin.firestore.Timestamp.fromDate(
      new Date(`${fiscalYear}-12-31T23:59:59Z`),
    );

    const snap = await db
      .collection("clubs")
      .doc(clubId)
      .collection("verifications")
      .where("date", ">=", from)
      .where("date", "<=", to)
      .orderBy("date", "asc")
      .get();

    const verifications: Verification[] = snap.docs.map((d) => ({
      verNumber: d.data().verNumber,
      date: d.data().date,
      description: d.data().description ?? "",
      lines: d.data().lines ?? [],
      sourceType: d.data().sourceType ?? "",
      feeTitle: d.data().feeTitle,
      category: d.data().category,
    }));

    const accountName = (number: number): string =>
      chartByNumber[number]?.name ?? `Account ${number}`;

    let content: string;
    let filename: string;
    const safeName = sanitize(clubName).replace(/\s+/g, "_");

    switch (exportFormat) {
      case "sie":
        content = buildSIE(
          verifications,
          chartByNumber,
          clubName,
          fiscalYear,
          request.auth.token.email ?? "",
        );
        filename = `SIE_${safeName}_${fiscalYear}.se`;
        break;

      case "saft":
        content = buildSAFT(
          verifications,
          chartByNumber,
          clubName,
          clubCurrency,
          fiscalYear,
          accountName,
        );
        filename = `SAFT_${safeName}_${fiscalYear}.xml`;
        break;

      case "csv":
      default:
        content = buildCSV(verifications, accountName);
        filename = `Accounting_${safeName}_${fiscalYear}.csv`;
        break;
    }

    return { success: true, content, filename };
  },
);

// ─── SIE 4E builder ───────────────────────────────────────────────────────────

function buildSIE(
  verifications: Verification[],
  chartByNumber: Record<number, ChartAccount>,
  clubName: string,
  fiscalYear: number,
  generatedBy: string,
): string {
  const lines: string[] = [];

  lines.push(`#FLAGGA 0`);
  lines.push(`#FORMAT PC8`);
  lines.push(`#SIETYP 4`);
  lines.push(`#PROGRAM "Clubnizer" "1.0"`);
  lines.push(`#GEN ${sieDate(new Date())} "${sanitize(generatedBy)}"`);
  lines.push(`#FNAMN "${sanitize(clubName)}"`);
  lines.push(`#RAR 0 ${fiscalYear}0101 ${fiscalYear}1231`);

  // Collect unique accounts
  const usedAccounts = new Set<number>();
  verifications.forEach((v) =>
    v.lines.forEach((l) => usedAccounts.add(l.account)),
  );

  usedAccounts.forEach((acc) => {
    const name = chartByNumber[acc]?.name ?? `Account ${acc}`;
    lines.push(`#KONTO ${acc} "${sanitize(name)}"`);
  });

  verifications.forEach((v) => {
    const dateStr = sieDate(v.date.toDate());
    const desc = sanitize(v.description ?? "");
    lines.push(`#VER "" ${v.verNumber} ${dateStr} "${desc}"`);
    lines.push(`{`);
    v.lines.forEach((l) => {
      const amount =
        l.debit > 0 ? sieAmount(l.debit) : `-${sieAmount(l.credit)}`;
      lines.push(`  #TRANS ${l.account} {} ${amount} ${dateStr} ""`);
    });
    lines.push(`}`);
  });

  return lines.join("\r\n") + "\r\n";
}

// ─── SAF-T XML builder ────────────────────────────────────────────────────────

function buildSAFT(
  verifications: Verification[],
  chartByNumber: Record<number, ChartAccount>,
  clubName: string,
  currency: string,
  fiscalYear: number,
  accountName: (n: number) => string,
): string {
  const lines: string[] = [];

  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<AuditFile xmlns="urn:StandardAuditFile-Taxation-Financial:NO" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
  );

  // Header
  lines.push(`  <Header>`);
  lines.push(`    <AuditFileVersion>1.10</AuditFileVersion>`);
  lines.push(`    <Company>`);
  lines.push(`      <Name>${xmlEscape(clubName)}</Name>`);
  lines.push(`    </Company>`);
  lines.push(
    `    <DefaultCurrencyCode>${xmlEscape(currency)}</DefaultCurrencyCode>`,
  );
  lines.push(`    <SelectionCriteria>`);
  lines.push(`      <SelectionStart>${fiscalYear}-01-01</SelectionStart>`);
  lines.push(`      <SelectionEnd>${fiscalYear}-12-31</SelectionEnd>`);
  lines.push(`    </SelectionCriteria>`);
  lines.push(`  </Header>`);

  // Master files — chart of accounts
  const usedAccounts = new Set<number>();
  verifications.forEach((v) =>
    v.lines.forEach((l) => usedAccounts.add(l.account)),
  );

  lines.push(`  <MasterFiles>`);
  lines.push(`    <GeneralLedgerAccounts>`);
  usedAccounts.forEach((acc) => {
    const entry = chartByNumber[acc];
    const saftType = saftAccountType(entry?.type);
    lines.push(`      <Account>`);
    lines.push(`        <AccountID>${acc}</AccountID>`);
    lines.push(
      `        <AccountDescription>${xmlEscape(accountName(acc))}</AccountDescription>`,
    );
    lines.push(`        <AccountType>${saftType}</AccountType>`);
    lines.push(`      </Account>`);
  });
  lines.push(`    </GeneralLedgerAccounts>`);
  lines.push(`  </MasterFiles>`);

  // General ledger entries
  lines.push(`  <GeneralLedgerEntries>`);
  lines.push(`    <Journal>`);
  lines.push(`      <JournalID>1</JournalID>`);
  lines.push(
    `      <Description>${xmlEscape(clubName)} ${fiscalYear}</Description>`,
  );

  verifications.forEach((v) => {
    const dateStr = isoDate(v.date.toDate());
    lines.push(`      <Transaction>`);
    lines.push(`        <TransactionID>${v.verNumber}</TransactionID>`);
    lines.push(`        <TransactionDate>${dateStr}</TransactionDate>`);
    lines.push(
      `        <Description>${xmlEscape(v.description)}</Description>`,
    );

    v.lines.forEach((l, idx) => {
      const amountStr = saftAmount(l.debit > 0 ? l.debit : l.credit);
      lines.push(`        <Line>`);
      lines.push(`          <RecordID>${idx + 1}</RecordID>`);
      lines.push(`          <AccountID>${l.account}</AccountID>`);
      if (l.debit > 0) {
        lines.push(
          `          <DebitAmount><Amount>${amountStr}</Amount></DebitAmount>`,
        );
      } else {
        lines.push(
          `          <CreditAmount><Amount>${amountStr}</Amount></CreditAmount>`,
        );
      }
      if (l.description) {
        lines.push(
          `          <Description>${xmlEscape(l.description)}</Description>`,
        );
      }
      lines.push(`        </Line>`);
    });

    lines.push(`      </Transaction>`);
  });

  lines.push(`    </Journal>`);
  lines.push(`  </GeneralLedgerEntries>`);
  lines.push(`</AuditFile>`);

  return lines.join("\n");
}

// ─── CSV builder ──────────────────────────────────────────────────────────────

function buildCSV(
  verifications: Verification[],
  accountName: (n: number) => string,
): string {
  const rows: string[] = [];
  rows.push(
    csvRow([
      "Ver#",
      "Date",
      "Description",
      "Account",
      "Account Name",
      "Debit",
      "Credit",
      "Type",
    ]),
  );

  verifications.forEach((v) => {
    const dateStr = isoDate(v.date.toDate());
    v.lines.forEach((l) => {
      rows.push(
        csvRow([
          String(v.verNumber),
          dateStr,
          v.description,
          String(l.account),
          accountName(l.account),
          l.debit > 0 ? (l.debit / 100).toFixed(2) : "",
          l.credit > 0 ? (l.credit / 100).toFixed(2) : "",
          v.sourceType === "stripe_refund" ? "Refund" : "Payment",
        ]),
      );
    });
  });

  return rows.join("\r\n") + "\r\n";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sieDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Amount in main currency units with 2 decimal places (SIE uses currency units, not öre) */
function sieAmount(öre: number): string {
  return (öre / 100).toFixed(2);
}

function saftAmount(öre: number): string {
  return (öre / 100).toFixed(2);
}

/** Map internal AccountType to SAF-T AccountType taxonomy */
function saftAccountType(type?: string): string {
  switch (type) {
    case "Asset":
      return "Asset";
    case "Liability":
      return "Liability";
    case "Equity":
      return "Equity";
    case "Revenue":
      return "Income";
    case "Expense":
      return "Expense";
    default:
      return "Other";
  }
}

function csvRow(fields: string[]): string {
  return fields.map((f) => `"${(f ?? "").replace(/"/g, '""')}"`).join(",");
}

function xmlEscape(str: string): string {
  return (str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitize(str: string): string {
  return (str ?? "").replace(/["\\]/g, " ").trim();
}
