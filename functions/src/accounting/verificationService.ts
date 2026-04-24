import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export interface VerificationLine {
  account: number;
  debit: number;
  credit: number;
  description: string;
}

export interface CreateVerificationParams {
  clubId: string;
  date: Date;
  description: string;
  lines: VerificationLine[];
  sourceType: "stripe_payment" | "stripe_refund";
  stripeChargeId?: string;
  stripePaymentIntentId?: string;
  feeId?: string;
  feeTitle?: string;
  category?: string;
  basAccount?: number;
  earmarkedGroupId?: string;
  memberId?: string;
  memberName?: string;
  groupId?: string;
}

/**
 * Auto-assigns the next sequential verification number for a club
 * and writes the verification document in a single transaction.
 */
export async function createVerification(
  db: admin.firestore.Firestore,
  params: CreateVerificationParams,
): Promise<string> {
  const counterRef = db
    .collection("clubs")
    .doc(params.clubId)
    .collection("accountingMeta")
    .doc("counters");

  const verRef = db
    .collection("clubs")
    .doc(params.clubId)
    .collection("verifications")
    .doc();

  await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const lastNumber: number = counterSnap.exists
      ? (counterSnap.data()?.lastVerNumber ?? 0)
      : 0;
    const nextNumber = lastNumber + 1;

    tx.set(counterRef, { lastVerNumber: nextNumber }, { merge: true });

    tx.set(verRef, {
      verNumber: nextNumber,
      date: admin.firestore.Timestamp.fromDate(params.date),
      description: params.description,
      lines: params.lines,
      sourceType: params.sourceType,
      stripeChargeId: params.stripeChargeId ?? null,
      stripePaymentIntentId: params.stripePaymentIntentId ?? null,
      feeId: params.feeId ?? null,
      feeTitle: params.feeTitle ?? null,
      category: params.category ?? null,
      basAccount: params.basAccount ?? null,
      earmarkedGroupId: params.earmarkedGroupId ?? null,
      memberId: params.memberId ?? null,
      memberName: params.memberName ?? null,
      groupId: params.groupId ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return verRef.id;
}
