import { getFirestore } from "firebase-admin/firestore";

/**
 * Sync a user's email change across all denormalized locations:
 *
 * 1. allMembers arrays (club / group / subgroup) — field `email`
 * 2. Youth guardian arrays — `guardians[].guardianEmail`
 * 3. Guardian entries inside allMembers — `members[].guardians[].guardianEmail`
 *
 * Uses the same collectionGroup("allMembers") pattern as
 * `syncProfileToMemberArrays` in updateUserProfile.ts.
 */
export async function syncEmailToMemberArrays(
  uid: string,
  oldEmail: string,
  newEmail: string,
): Promise<void> {
  const db = getFirestore();

  // ── 1. allMembers arrays (email field on the member entry) ──────────
  //    NOTE: We avoid `.where("__name__", "==", "members")` because
  //    collection group queries require a full document path for __name__
  //    filters — which we don't have since clubs are dynamic.
  const allMembersSnap = await db.collectionGroup("allMembers").get();

  // Filter to "members" docs only (in code)
  const membersDocs = allMembersSnap.docs.filter((doc) => doc.id === "members");

  for (const doc of membersDocs) {
    const data = doc.data();
    const members: any[] = data?.members || [];

    let changed = false;
    const updatedMembers = members.map((m: any) => {
      // Direct member email
      if (m.userId === uid && m.email === oldEmail) {
        changed = true;
        return { ...m, email: newEmail };
      }
      return m;
    });

    if (changed) {
      await doc.ref.update({ members: updatedMembers });
    }
  }

  // ── 2. Guardian email inside allMembers member.guardians[] ──────────
  //    Each member entry may have a `guardians` sub-array with
  //    `{ guardianEmail, guardianName, guardianUid }`.
  for (const doc of membersDocs) {
    const data = doc.data();
    const members: any[] = data?.members || [];

    let changed = false;
    const updatedMembers = members.map((m: any) => {
      if (!Array.isArray(m.guardians)) return m;

      let guardianChanged = false;
      const updatedGuardians = m.guardians.map((g: any) => {
        if (g.guardianUid === uid || g.guardianEmail === oldEmail) {
          guardianChanged = true;
          return { ...g, guardianEmail: newEmail };
        }
        return g;
      });

      if (guardianChanged) {
        changed = true;
        return { ...m, guardians: updatedGuardians };
      }
      return m;
    });

    if (changed) {
      await doc.ref.update({ members: updatedMembers });
    }
  }

  // ── 3. Youth user documents – guardians[] array on the user doc ─────
  //    E.g. users/{youthUid}.guardians[].guardianEmail
  const usersSnap = await db.collection("users").get();

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    if (!Array.isArray(userData?.guardians)) continue;

    let changed = false;
    const updatedGuardians = userData.guardians.map((g: any) => {
      if (g.guardianUid === uid || g.guardianEmail === oldEmail) {
        changed = true;
        return { ...g, guardianEmail: newEmail };
      }
      return g;
    });

    if (changed) {
      await userDoc.ref.update({ guardians: updatedGuardians });
    }
  }

  console.log(`Synced email change for user ${uid}: ${oldEmail} → ${newEmail}`);
}
