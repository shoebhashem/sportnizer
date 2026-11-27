import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { flatArrayFieldsFromClubAccess } from "../utils/flatArrayHelpers";

/**
 * Marker written on clubAccess / groupAccess entries that were deactivated
 * because their club was soft-deleted. Reactivating the club restores ONLY
 * entries carrying this marker, so memberships that were already inactive
 * for other reasons (left the club, removed, ...) stay inactive.
 */
export const CLUB_DELETION_REASON = "club-deletion";

/**
 * Users whose profile references the club: everyone in the club's
 * allMembers list plus anyone whose flat arrays still point at the club.
 */
async function findUsersOfClub(
  db: admin.firestore.Firestore,
  clubId: string,
): Promise<string[]> {
  const ids = new Set<string>();

  const membersDoc = await db
    .collection("clubs")
    .doc(clubId)
    .collection("allMembers")
    .doc("members")
    .get();
  for (const member of membersDoc.data()?.members || []) {
    if (member?.userId) ids.add(member.userId);
  }

  for (const field of ["adminOfClubs", "memberOfClubs"]) {
    const snapshot = await db
      .collection("users")
      .where(field, "array-contains", clubId)
      .select()
      .get();
    snapshot.docs.forEach((doc) => ids.add(doc.id));
  }

  return [...ids];
}

/**
 * Apply `transform` to the user's clubAccess entry for `clubId` inside a
 * transaction, and rebuild the flat role arrays. Returns true if changed.
 */
async function updateUserClubEntry(
  db: admin.firestore.Firestore,
  userId: string,
  clubId: string,
  transform: (entry: any) => any | null,
): Promise<boolean> {
  const userRef = db.collection("users").doc(userId);
  return db.runTransaction(async (tx) => {
    const userDoc = await tx.get(userRef);
    if (!userDoc.exists) return false;
    const clubAccess: any[] = userDoc.data()?.clubAccess || [];

    let changed = false;
    const updated = clubAccess.map((entry: any) => {
      if (entry?.clubId !== clubId) return entry;
      const next = transform(entry);
      if (next === null) return entry;
      changed = true;
      return next;
    });
    if (!changed) return false;

    tx.update(userRef, {
      clubAccess: updated,
      ...flatArrayFieldsFromClubAccess(updated),
      version: FieldValue.increment(1),
    });
    return true;
  });
}

/**
 * Called when a club is soft-deleted: deactivates the club (and its groups)
 * on every member's profile, so the club disappears from their app right
 * away and no longer blocks account deletion. Does not change the user's
 * own isActive; the weekly cleanup removes the entries for good later.
 */
export async function markClubAccessDeleted(
  clubId: string,
  deletionScheduledAt: Timestamp,
): Promise<{ usersUpdated: number; errors: number }> {
  const db = admin.firestore();
  const userIds = await findUsersOfClub(db, clubId);
  let usersUpdated = 0;
  let errors = 0;

  for (const userId of userIds) {
    try {
      const changed = await updateUserClubEntry(db, userId, clubId, (entry) => {
        if (entry.isActive === false) return null; // already inactive: leave as is
        return {
          ...entry,
          isActive: false,
          deletionScheduledAt,
          inactiveReason: CLUB_DELETION_REASON,
          groupAccess: (entry.groupAccess || []).map((group: any) =>
            group?.isActive === false ?
              group :
              {
                ...group,
                isActive: false,
                deletionScheduledAt,
                inactiveReason: CLUB_DELETION_REASON,
              },
          ),
        };
      });
      if (changed) usersUpdated++;
    } catch (error) {
      errors++;
      console.error(`markClubAccessDeleted: failed for user ${userId}`, error);
    }
  }

  console.log(
    `markClubAccessDeleted(${clubId}): ${usersUpdated}/${userIds.length} users updated, ${errors} errors`,
  );
  return { usersUpdated, errors };
}

/**
 * Called when a soft-deleted club is reactivated: restores only the
 * clubAccess / groupAccess entries that markClubAccessDeleted deactivated.
 */
export async function restoreClubAccessAfterReactivation(
  clubId: string,
): Promise<{ usersUpdated: number; errors: number }> {
  const db = admin.firestore();
  const userIds = await findUsersOfClub(db, clubId);
  let usersUpdated = 0;
  let errors = 0;

  const restore = (item: any) => {
    const copy = { ...item, isActive: true };
    delete copy.deletionScheduledAt;
    delete copy.inactiveReason;
    return copy;
  };

  for (const userId of userIds) {
    try {
      const changed = await updateUserClubEntry(db, userId, clubId, (entry) => {
        if (entry.inactiveReason !== CLUB_DELETION_REASON) return null;
        const restored = restore(entry);
        restored.groupAccess = (entry.groupAccess || []).map((group: any) =>
          group?.inactiveReason === CLUB_DELETION_REASON ? restore(group) : group,
        );
        return restored;
      });
      if (changed) usersUpdated++;
    } catch (error) {
      errors++;
      console.error(
        `restoreClubAccessAfterReactivation: failed for user ${userId}`,
        error,
      );
    }
  }

  console.log(
    `restoreClubAccessAfterReactivation(${clubId}): ${usersUpdated}/${userIds.length} users updated, ${errors} errors`,
  );
  return { usersUpdated, errors };
}
