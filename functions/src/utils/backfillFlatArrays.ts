/**
 * /functions/src/utils/backfillFlatArrays.ts
 *
 * One-time backfill script to populate flat role arrays on all existing
 * user documents.  Run this once after deploying the Cloud Function
 * updates so that Firestore security rules can read the flat arrays.
 *
 * Usage (from the functions/ directory):
 *   npx ts-node -e "require('./src/utils/backfillFlatArrays').backfillFlatArrays()"
 *
 * Or deploy as a callable Cloud Function and trigger it from the Firebase
 * console / admin tool:
 *   exports.backfillFlatArrays = backfillFlatArraysCallable;
 */

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
    buildFlatArraysFromClubAccess,
    collectDependentGroupIds,
} from "./flatArrayHelpers";

// Ensure admin is initialised (idempotent)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Core backfill logic — can be called from a Cloud Function or directly.
 * Processes all users in batches of 500.
 */
export async function backfillFlatArrays(): Promise<{
  total: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const BATCH_SIZE = 500;
  let total = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  let lastDoc: FirebaseFirestore.DocumentSnapshot | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query: FirebaseFirestore.Query = db
      .collection("users")
      .orderBy("__name__")
      .limit(BATCH_SIZE);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      total++;
      try {
        const data = doc.data();
        const clubAccess = data?.clubAccess || [];
        const flat = buildFlatArraysFromClubAccess(clubAccess);

        // Also compute guardianOfGroups from dependents[] for guardian users
        // This supplements the clubAccess-derived guardianOfGroups with
        // groups accessed via the dependent relationship.
        const dependents = data?.dependents || [];
        if (dependents.length > 0) {
          const depGroupIds = collectDependentGroupIds(dependents);
          for (const gId of depGroupIds) {
            if (!flat.guardianOfGroups.includes(gId)) {
              flat.guardianOfGroups.push(gId);
            }
          }
        }

        // Only update if at least one flat array differs or is missing
        const needsUpdate =
          !arraysEqual(data?.adminOfClubs, flat.adminOfClubs) ||
          !arraysEqual(data?.memberOfClubs, flat.memberOfClubs) ||
          !arraysEqual(data?.adminOfGroups, flat.adminOfGroups) ||
          !arraysEqual(data?.coachOfGroups, flat.coachOfGroups) ||
          !arraysEqual(data?.memberOfGroups, flat.memberOfGroups) ||
          !arraysEqual(data?.guardianOfGroups, flat.guardianOfGroups);

        if (needsUpdate) {
          batch.update(doc.ref, {
            adminOfClubs: flat.adminOfClubs,
            memberOfClubs: flat.memberOfClubs,
            adminOfGroups: flat.adminOfGroups,
            coachOfGroups: flat.coachOfGroups,
            memberOfGroups: flat.memberOfGroups,
            guardianOfGroups: flat.guardianOfGroups,
          });
          batchCount++;
          updated++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        errors.push(`${doc.id}: ${err.message || err}`);
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      console.log(
        `Committed batch: ${batchCount} users updated (${total} processed so far)`,
      );
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  const summary = { total, updated, skipped, errors };
  console.log("Backfill complete:", JSON.stringify(summary, null, 2));
  return summary;
}

/**
 * Callable Cloud Function wrapper — restricted to admins.
 */
export const backfillFlatArraysCallable = onCall(
  { region: "europe-west1" },
  async (request) => {
    // Only allow authenticated users (you can add further role checks)
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Must be signed in to run backfill.",
      );
    }

    console.log(
      `Backfill triggered by user ${request.auth.uid} at ${new Date().toISOString()}`,
    );
    return backfillFlatArrays();
  },
);

// ---- Helpers --------------------------------------------------------------

function arraysEqual(a: string[] | undefined | null, b: string[]): boolean {
  if (!a) return b.length === 0;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}
