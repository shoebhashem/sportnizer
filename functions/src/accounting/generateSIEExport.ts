import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

/**
 * Generate a SIE 4 export file for a club's accounting verifications.
 *
 * SIE (Standard Import Export) is the Swedish standard for transferring
 * bookkeeping data between accounting systems (used by all Swedish
 * sports clubs and accepted by Visma, Fortnox, etc.).
 *
 * Reference: SIE-gruppen, SIE format 4E (journal/budget entries).
 *
 * SECURITY: Only club admins may generate exports.
 */
export const generateSIEExport = onCall(
  { region: config.region },
  async (
    request,
  ): Promise<{ success: boolean; content: string; filename: string }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, year } = request.data;

    if (!clubId || typeof clubId !== "string") {
      throw new HttpsError("invalid-argument", "clubId is required");
    }

    const fiscalYear = year ? Number(year) : new Date().getFullYear();

    const db = admin.firestore();

    // Verify club-admin access
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!userDoc.exists) throw new HttpsError("not-found", "User not found");

    const clubAccess: any[] = userDoc.data()?.clubAccess || [];
    const access = clubAccess.find((a) => a.clubId === clubId);
    if (!access || access.role !== "club-admin") {
      throw new HttpsError("permission-denied", "Club admin access required");
    }

    // Fetch club name
    const clubDoc = await db.collection("clubs").doc(clubId).get();
    if (!clubDoc.exists) throw new HttpsError("not-found", "Club not found");
    const clubName = clubDoc.data()?.name ?? "Unknown Club";

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

    // ---------------------------------------------------------------------------
    // Build SIE 4 file
    // ---------------------------------------------------------------------------
    const lines: string[] = [];

    // Header
    lines.push(`#FLAGGA 0`);
    lines.push(`#FORMAT PC8`);
    lines.push(`#SIETYP 4`);
    lines.push(`#PROGRAM "Clubnizer" "1.0"`);
    lines.push(
      `#GEN ${formatSieDate(new Date())} "${request.auth.token.email ?? ""}"`,
    );
    lines.push(`#FNAMN "${sanitize(clubName)}"`);
    lines.push(`#RAR 0 ${fiscalYear}0101 ${fiscalYear}1231`);

    // Collect unique accounts used
    const accountsUsed = new Set<number>();
    snap.docs.forEach((doc) => {
      const ver = doc.data();
      (ver.lines || []).forEach((l: { account: number }) =>
        accountsUsed.add(l.account),
      );
    });

    // Account plan (BAS)
    const ACCOUNT_NAMES: Record<number, string> = {
      1930: "Företagskonto / affärskonto",
      2071: "Lagkassa / öronmärkt medel",
      3010: "Medlemsavgifter",
      3020: "Träningsavgifter",
      3030: "Deltagaravgifter arrangemang",
      3210: "Sponsorintäkter",
      3310: "Försäljning kiosk / övrigt",
      3890: "Övriga intäkter",
      6570: "Bankkostnader (Stripe-avgifter)",
    };

    accountsUsed.forEach((acc) => {
      const name = ACCOUNT_NAMES[acc] ?? `Konto ${acc}`;
      lines.push(`#KONTO ${acc} "${sanitize(name)}"`);
    });

    // Verifications
    snap.docs.forEach((doc) => {
      const ver = doc.data();
      const dateStr = formatSieDate(ver.date.toDate());
      const desc = sanitize(ver.description ?? "");
      lines.push(`#VER "" ${ver.verNumber} ${dateStr} "${desc}"`);
      lines.push(`{`);
      (ver.lines || []).forEach(
        (l: { account: number; debit: number; credit: number }) => {
          // SIE uses positive for debit, negative for credit on a single amount field
          const amount =
            l.debit > 0 ? formatAmount(l.debit) : `-${formatAmount(l.credit)}`;
          lines.push(`  #TRANS ${l.account} {} ${amount} ${dateStr} ""`);
        },
      );
      lines.push(`}`);
    });

    const content = lines.join("\r\n") + "\r\n";
    const filename = `SIE_${sanitize(clubName).replace(/\s+/g, "_")}_${fiscalYear}.se`;

    return { success: true, content, filename };
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSieDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** Amount in kronor with 2 decimal places, e.g. 485.50 */
function formatAmount(öre: number): string {
  return (öre / 100).toFixed(2);
}

/** Remove characters that break SIE parsing */
function sanitize(str: string): string {
  return str.replace(/["\\]/g, " ").trim();
}
