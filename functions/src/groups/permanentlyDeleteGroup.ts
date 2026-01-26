import * as admin from 'firebase-admin';

/**
 * Permanently deletes a group and all its data
 * This is a helper function called by the scheduled cleanup function
 * NOT exposed as a callable function
 */
export async function permanentlyDeleteGroup(
  clubId: string, 
  groupId: string
): Promise<{success: boolean, deletedSubgroups: number, deletedMembers: number}> {
  const db = admin.firestore();
  const groupRef = db.collection('clubs').doc(clubId).collection('groups').doc(groupId);
  
  let deletedSubgroups = 0;
  let deletedMembers = 0;
  
  try {
    // 1. Delete all subgroups
    const subgroupsSnapshot = await groupRef.collection('subgroups').get();
    if (!subgroupsSnapshot.empty) {
      const batch = db.batch();
      subgroupsSnapshot.docs.forEach((subgroupDoc) => {
        batch.delete(subgroupDoc.ref);
        deletedSubgroups++;
      });
      await batch.commit();
      console.log(`Deleted ${deletedSubgroups} subgroups from group ${groupId}`);
    }
    
    // 2. Delete allMembers collection
    const membersSnapshot = await groupRef.collection('allMembers').get();
    if (!membersSnapshot.empty) {
      const batch = db.batch();
      membersSnapshot.docs.forEach((memberDoc) => {
        batch.delete(memberDoc.ref);
        deletedMembers++;
      });
      await batch.commit();
      console.log(`Deleted ${deletedMembers} member documents from group ${groupId}`);
    }
    
    // 3. Delete group document
    await groupRef.delete();
    console.log(`Permanently deleted group ${groupId} from club ${clubId}`);
    
    return {
      success: true,
      deletedSubgroups,
      deletedMembers
    };
    
  } catch (error) {
    console.error(`Error permanently deleting group ${groupId}:`, error);
    throw error;
  }
}
