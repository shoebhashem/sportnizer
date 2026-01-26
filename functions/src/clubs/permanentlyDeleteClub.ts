import * as admin from 'firebase-admin';
import { permanentlyDeleteGroup } from '../groups/permanentlyDeleteGroup';

/**
 * Permanently deletes a club and all its data
 * This is a helper function called by the scheduled cleanup function
 * NOT exposed as a callable function
 */
export async function permanentlyDeleteClub(
  clubId: string
): Promise<{success: boolean, deletedGroups: number, deletedSubgroups: number, deletedMembers: number}> {
  const db = admin.firestore();
  const clubRef = db.collection('clubs').doc(clubId);
  
  let deletedGroups = 0;
  let totalDeletedSubgroups = 0;
  let totalDeletedMembers = 0;
  
  try {
    // 1. Delete all groups (which cascades to subgroups)
    const groupsSnapshot = await clubRef.collection('groups').get();
    if (!groupsSnapshot.empty) {
      for (const groupDoc of groupsSnapshot.docs) {
        const result = await permanentlyDeleteGroup(clubId, groupDoc.id);
        deletedGroups++;
        totalDeletedSubgroups += result.deletedSubgroups;
        totalDeletedMembers += result.deletedMembers;
      }
      console.log(`Deleted ${deletedGroups} groups from club ${clubId}`);
    }
    
    // 2. Delete club allMembers collection
    const clubMembersSnapshot = await clubRef.collection('allMembers').get();
    if (!clubMembersSnapshot.empty) {
      const batch = db.batch();
      clubMembersSnapshot.docs.forEach((memberDoc) => {
        batch.delete(memberDoc.ref);
      });
      await batch.commit();
      console.log(`Deleted ${clubMembersSnapshot.size} club member documents from club ${clubId}`);
    }
    
    // 3. Delete club document
    await clubRef.delete();
    console.log(`Permanently deleted club ${clubId}`);
    
    return {
      success: true,
      deletedGroups,
      deletedSubgroups: totalDeletedSubgroups,
      deletedMembers: totalDeletedMembers
    };
    
  } catch (error) {
    console.error(`Error permanently deleting club ${clubId}:`, error);
    throw error;
  }
}
