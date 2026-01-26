import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { permanentlyDeleteClub } from '../clubs/permanentlyDeleteClub';
import { permanentlyDeleteGroup } from '../groups/permanentlyDeleteGroup';

/**
 * Scheduled function that runs daily to cleanup expired soft-deleted entities
 * Runs at 2 AM UTC to avoid peak usage times
 * Deletes groups and clubs that have passed their grace period
 * Note: Cloud Scheduler requires supported regions (us-central1, europe-west1, etc.)
 */
export const cleanupDeletedEntities = onSchedule(
  {
    schedule: '0 2 * * *', // Daily at 2 AM
    timeZone: 'UTC',
    region: 'europe-west1' // Cloud Scheduler supported region
  },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    
    console.log(`🗑️ Starting cleanup of deleted entities at ${now.toDate()}`);
    
    let groupsDeleted = 0;
    let clubsDeleted = 0;
    let usersUpdated = 0;
    const errors: string[] = [];
    
    try {
      // 1. Cleanup expired groups
      console.log('🔍 Searching for expired groups...');
      const expiredGroupsSnapshot = await db.collectionGroup('groups')
        .where('isActive', '==', false)
        .where('deletionScheduledAt', '<=', now)
        .get();
      
      console.log(`Found ${expiredGroupsSnapshot.size} expired groups`);
      
      for (const groupDoc of expiredGroupsSnapshot.docs) {
        try {
          const clubId = groupDoc.ref.parent.parent!.id;
          const groupId = groupDoc.id;
          
          console.log(`Deleting group ${groupId} from club ${clubId}`);
          
          // Get all members before deletion
          const membersDoc = await groupDoc.ref.collection('allMembers').doc('members').get();
          const membersData = membersDoc.data();
          const memberIds = membersData?.members?.map((m: any) => m.userId) || [];
          
          // Permanently delete the group
          await permanentlyDeleteGroup(clubId, groupId);
          groupsDeleted++;
          
          // Update all user documents to remove the group from their groupAccess
          for (const userId of memberIds) {
            try {
              const userRef = db.collection('users').doc(userId);
              const userDoc = await userRef.get();
              
              if (userDoc.exists) {
                const userData = userDoc.data();
                
                // Remove the group from user's clubAccess[].groupAccess[]
                const updatedClubAccess = userData?.clubAccess?.map((club: any) => {
                  if (club.clubId === clubId) {
                    return {
                      ...club,
                      groupAccess: club.groupAccess?.filter((g: any) => g.groupId !== groupId) || []
                    };
                  }
                  return club;
                });
                
                // Check if user should be marked inactive
                const hasActiveGroups = updatedClubAccess?.some((club: any) => 
                  club.groupAccess && club.groupAccess.length > 0
                );
                
                const updateData: any = {
                  clubAccess: updatedClubAccess,
                  version: admin.firestore.FieldValue.increment(1)
                };
                
                if (!hasActiveGroups && userData?.isActive !== false) {
                  updateData.isActive = false;
                  updateData.inactiveSince = admin.firestore.FieldValue.serverTimestamp();
                  console.log(`Marking user ${userId} as inactive (no active groups)`);
                }
                
                await userRef.update(updateData);
                usersUpdated++;
              }
            } catch (userError) {
              console.error(`Error updating user ${userId}:`, userError);
              errors.push(`User update failed: ${userId}`);
            }
          }
          
        } catch (groupError) {
          console.error(`Error deleting group ${groupDoc.id}:`, groupError);
          errors.push(`Group deletion failed: ${groupDoc.id}`);
        }
      }
      
      // 2. Cleanup expired clubs
      console.log('🔍 Searching for expired clubs...');
      const expiredClubsSnapshot = await db.collection('clubs')
        .where('isActive', '==', false)
        .where('deletionScheduledAt', '<=', now)
        .get();
      
      console.log(`Found ${expiredClubsSnapshot.size} expired clubs`);
      
      for (const clubDoc of expiredClubsSnapshot.docs) {
        try {
          const clubId = clubDoc.id;
          console.log(`Deleting club ${clubId}`);
          
          // Get all club members before deletion
          const clubMembersDoc = await clubDoc.ref.collection('allMembers').doc('members').get();
          const clubMembersData = clubMembersDoc.data();
          const memberIds = clubMembersData?.members?.map((m: any) => m.userId) || [];
          
          // Permanently delete the club (cascades to all groups and subgroups)
          await permanentlyDeleteClub(clubId);
          clubsDeleted++;
          
          // Update all user documents to remove the club from their clubAccess
          for (const userId of memberIds) {
            try {
              const userRef = db.collection('users').doc(userId);
              const userDoc = await userRef.get();
              
              if (userDoc.exists) {
                const userData = userDoc.data();
                
                // Remove the club from user's clubAccess[]
                const updatedClubAccess = userData?.clubAccess?.filter(
                  (club: any) => club.clubId !== clubId
                ) || [];
                
                const updateData: any = {
                  clubAccess: updatedClubAccess,
                  version: admin.firestore.FieldValue.increment(1)
                };
                
                // Mark user inactive if no clubs remain
                if (updatedClubAccess.length === 0 && userData?.isActive !== false) {
                  updateData.isActive = false;
                  updateData.inactiveSince = admin.firestore.FieldValue.serverTimestamp();
                  console.log(`Marking user ${userId} as inactive (no clubs)`);
                }
                
                await userRef.update(updateData);
                usersUpdated++;
              }
            } catch (userError) {
              console.error(`Error updating user ${userId}:`, userError);
              errors.push(`User update failed: ${userId}`);
            }
          }
          
        } catch (clubError) {
          console.error(`Error deleting club ${clubDoc.id}:`, clubError);
          errors.push(`Club deletion failed: ${clubDoc.id}`);
        }
      }
      
      // 3. Log summary
      console.log(`✅ Cleanup complete:
        - Groups deleted: ${groupsDeleted}
        - Clubs deleted: ${clubsDeleted}
        - Users updated: ${usersUpdated}
        - Errors: ${errors.length}
      `);
      
      if (errors.length > 0) {
        console.error('❌ Errors encountered:', errors);
      }
      
    } catch (error) {
      console.error('❌ Fatal error in cleanup job:', error);
      throw error;
    }
  }
);
