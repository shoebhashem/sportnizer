import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

interface VerificationLine {
  account: number;
  debit: number;
  credit: number;
  description: string;
}

interface VerificationSummary {
  verificationId: string;
  verNumber: number;
  date: number; // Unix ms
  description: string;
  lines: VerificationLine[];
  sourceType: string;
  feeId: string | null;
  feeTitle: string | null;
  category: string | null;
  basAccount: number | null;
  groupId: string | null;
  memberId: string | null;
  memberName: string | null;
  createdAt: number;
}

/**
 * Get accounting data (verifications) for a club.
 *
 * Supports optional date range filtering via `fromDate` / `toDate` (ISO strings).
 * SECURITY: Only club admins may access.
 */
export const getAccountingData = onCall(
  { region: config.region },
  async (
    request,
  ): Promise<{
    success: boolean;
    verifications: VerificationSummary[];
    totalDebit: number;
    totalCredit: number;
  }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, fromDate, toDate } = request.data;

    if (!clubId || typeof clubId !== "string") {
      throw new HttpsError("invalid-argument", "clubId is required");
    }

    const db = admin.firestore();

    // Verify club-admin access
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!userDoc.exists) throw new HttpsError("not-found", "User not found");

    const clubAccess: any[] = userDoc.data()?.clubAccess || [];
    const access = clubAccess.find((a) => a.clubId === clubId);
    if (!access || access.role !== "club-admin") {
      throw new HttpsError("permission-denied", "Club admin access required");
    }

    let query: admin.firestore.Query = db
      .collection("clubs")
      .doc(clubId)
      .collection("verifications")
      .orderBy("date", "desc");

    if (fromDate) {
      query = query.where("date", ">=", Timestamp.fromDate(new Date(fromDate)));
    }
    if (toDate) {
      query = query.where("date", "<=", Timestamp.fromDate(new Date(toDate)));
    }

    const snap = await query.limit(500).get();

    let totalDebit = 0;
    let totalCredit = 0;

    const verifications: VerificationSummary[] = snap.docs.map((doc) => {
      const d = doc.data();
      const lines: VerificationLine[] = d.lines || [];
      lines.forEach((l) => {
        totalDebit += l.debit;
        totalCredit += l.credit;
      });
      return {
        verificationId: doc.id,
        verNumber: d.verNumber,
        date: d.date?.toMillis?.() ?? 0,
        description: d.description,
        lines,
        sourceType: d.sourceType,
        feeId: d.feeId,
        feeTitle: d.feeTitle,
        category: d.category,
        basAccount: d.basAccount,
        groupId: d.groupId,
        memberId: d.memberId,
        memberName: d.memberName,
        createdAt: d.createdAt?.toMillis?.() ?? 0,
      };
    });

    return { success: true, verifications, totalDebit, totalCredit };
  },
);
