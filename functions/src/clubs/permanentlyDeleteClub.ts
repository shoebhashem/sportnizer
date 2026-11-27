import * as admin from 'firebase-admin';
import { permanentlyDeleteGroup } from '../groups/permanentlyDeleteGroup';

const STORAGE_BUCKET = 'sportnizer.firebasestorage.app';

/**
 * Club subcollections that are KEPT when a club is permanently deleted.
 * These are bookkeeping records that must be retained for legal reasons
 * (Swedish bookkeeping rules), so they stay at clubs/{clubId}/<name>
 * even after the club document itself is gone.
 *
 * Also kept (not stored under the club, so never touched here):
 * membershipFees, payments, stripeEvents, lokReports.
 */
export const RETAINED_CLUB_SUBCOLLECTIONS: ReadonlySet<string> = new Set([
  'chartOfAccounts',
  'accountingConfig',
  'accountingMeta',
  'verifications',
]);

/**
 * Top-level collections whose documents belong to a club via a `clubId`
 * field and are deleted together with the club.
 */
const CLUB_LINKED_TOP_LEVEL_COLLECTIONS = ['invitations', 'guardianInvitations'];

export interface PermanentlyDeleteClubResult {
  success: boolean;
  deletedGroups: number;
  deletedSubgroups: number;
  deletedMembers: number;
  deletedSubcollections: string[];
  retainedSubcollections: string[];
  deletedLinkedDocuments: number;
  deletedStorageFolders: string[];
}

/**
 * Permanently deletes a club and all its data, except bookkeeping records
 * (see RETAINED_CLUB_SUBCOLLECTIONS).
 *
 * This is a helper function called by the scheduled cleanup function
 * NOT exposed as a callable function.
 *
 * The club document is deleted LAST, so if anything fails half-way the club
 * is still marked for deletion and the weekly cleanup simply retries.
 * Every step is safe to run more than once.
 */
export async function permanentlyDeleteClub(
  clubId: string
): Promise<PermanentlyDeleteClubResult> {
  if (!clubId) {
    throw new Error('permanentlyDeleteClub: clubId is required');
  }

  const db = admin.firestore();
  const clubRef = db.collection('clubs').doc(clubId);

  let deletedGroups = 0;
  let totalDeletedSubgroups = 0;
  let totalDeletedMembers = 0;
  const deletedSubcollections: string[] = [];
  const retainedSubcollections: string[] = [];
  let deletedLinkedDocuments = 0;
  const deletedStorageFolders: string[] = [];

  try {
    // 1. Delete all groups (members are processed and each group is deleted
    //    together with all of its subcollections).
    const groupsSnapshot = await clubRef.collection('groups').get();
    const groupIds = groupsSnapshot.docs.map((doc) => doc.id);
    for (const groupId of groupIds) {
      const result = await permanentlyDeleteGroup(clubId, groupId);
      deletedGroups++;
      totalDeletedSubgroups += result.deletedSubgroups;
      totalDeletedMembers += result.deletedMembers;
    }
    if (deletedGroups > 0) {
      console.log(`Deleted ${deletedGroups} groups from club ${clubId}`);
    }

    // 2. Delete every other club subcollection (allMembers, events, news with
    //    comments/reactions, settings, recurringEvents, metadata, ...), at any
    //    depth, except the retained bookkeeping collections.
    const subcollections = await clubRef.listCollections();
    for (const collectionRef of subcollections) {
      if (RETAINED_CLUB_SUBCOLLECTIONS.has(collectionRef.id)) {
        retainedSubcollections.push(collectionRef.id);
        continue;
      }
      await db.recursiveDelete(collectionRef);
      deletedSubcollections.push(collectionRef.id);
    }
    console.log(
      `Deleted subcollections of club ${clubId}: [${deletedSubcollections.join(', ')}]; ` +
      `kept: [${retainedSubcollections.join(', ')}]`
    );

    // 3. Delete top-level documents that belong to this club (invitations).
    for (const collectionName of CLUB_LINKED_TOP_LEVEL_COLLECTIONS) {
      const linked = await db
        .collection(collectionName)
        .where('clubId', '==', clubId)
        .get();
      for (const doc of linked.docs) {
        await db.recursiveDelete(doc.ref);
        deletedLinkedDocuments++;
      }
    }
    if (deletedLinkedDocuments > 0) {
      console.log(
        `Deleted ${deletedLinkedDocuments} invitation documents for club ${clubId}`
      );
    }

    // 4. Delete the club logo and group pictures from Storage.
    const bucket = admin.storage().bucket(STORAGE_BUCKET);
    const storagePrefixes = [
      `profilePictures/clubs/${clubId}/`,
      ...groupIds.map((groupId) => `profilePictures/groups/${groupId}/`),
    ];
    for (const prefix of storagePrefixes) {
      await bucket.deleteFiles({ prefix, force: true });
      deletedStorageFolders.push(prefix);
    }
    console.log(`Deleted ${storagePrefixes.length} Storage folders for club ${clubId}`);

    // 5. Delete the club document itself (NOT recursively, so the retained
    //    bookkeeping subcollections stay).
    await clubRef.delete();
    console.log(`Permanently deleted club ${clubId}`);

    return {
      success: true,
      deletedGroups,
      deletedSubgroups: totalDeletedSubgroups,
      deletedMembers: totalDeletedMembers,
      deletedSubcollections,
      retainedSubcollections,
      deletedLinkedDocuments,
      deletedStorageFolders,
    };
  } catch (error) {
    console.error(`Error permanently deleting club ${clubId}:`, error);
    throw error;
  }
}
