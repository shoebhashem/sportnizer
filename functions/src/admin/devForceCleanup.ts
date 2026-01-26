import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { permanentlyDeleteClub } from '../clubs/permanentlyDeleteClub';
import { permanentlyDeleteGroup } from '../groups/permanentlyDeleteGroup';
import { config } from '../utils/config';

/**
 * Development-only function to force cleanup of deleted entities
 * Bypasses the 30-day grace period for testing purposes
 * ONLY works in development/staging projects, blocked in production
 */
export const devForceCleanup = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, message?: string, deletedGroups?: number, deletedClubs?: number, error?: string}> => {
    try {
      // CRITICAL: Only allow in development environment
      const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
      if (projectId?.includes('prod') || projectId === 'sportnizer') {
        throw new HttpsError(
          'permission-denied', 
          'This function is not available in production'
        );
      }
      
      // Validate authentication (optional: require admin)
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }
      
      const { targetType, clubId, groupId } = request.data;
      const db = admin.firestore();
      
      console.log(`🔧 DEV: Force cleanup requested for ${targetType}`);
      
      // Option 1: Cleanup specific group
      if (targetType === 'group' && clubId && groupId) {
        console.log(`Forcing deletion of group ${groupId} in club ${clubId}`);
        
        await permanentlyDeleteGroup(clubId, groupId);
        
        return {
          success: true,
          message: `Group ${groupId} permanently deleted`
        };
      }
      
      // Option 2: Cleanup specific club
      if (targetType === 'club' && clubId) {
        console.log(`Forcing deletion of club ${clubId}`);
        
        await permanentlyDeleteClub(clubId);
        
        return {
          success: true,
          message: `Club ${clubId} permanently deleted`
        };
      }
      
      // Option 3: Cleanup ALL soft-deleted entities (ignore timestamp)
      if (targetType === 'all') {
        console.log('Forcing cleanup of ALL soft-deleted entities');
        
        let groupsDeleted = 0;
        let clubsDeleted = 0;
        
        // Cleanup all inactive groups
        const expiredGroupsSnapshot = await db.collectionGroup('groups')
          .where('isActive', '==', false)
          .get();
        
        for (const groupDoc of expiredGroupsSnapshot.docs) {
          const clubIdFromRef = groupDoc.ref.parent.parent!.id;
          const groupIdFromRef = groupDoc.id;
          
          try {
            await permanentlyDeleteGroup(clubIdFromRef, groupIdFromRef);
            groupsDeleted++;
          } catch (error) {
            console.error(`Error deleting group ${groupIdFromRef}:`, error);
          }
        }
        
        // Cleanup all inactive clubs
        const expiredClubsSnapshot = await db.collection('clubs')
          .where('isActive', '==', false)
          .get();
        
        for (const clubDoc of expiredClubsSnapshot.docs) {
          const clubIdFromRef = clubDoc.id;
          
          try {
            await permanentlyDeleteClub(clubIdFromRef);
            clubsDeleted++;
          } catch (error) {
            console.error(`Error deleting club ${clubIdFromRef}:`, error);
          }
        }
        
        return {
          success: true,
          message: `Cleanup complete: ${groupsDeleted} groups, ${clubsDeleted} clubs`,
          deletedGroups: groupsDeleted,
          deletedClubs: clubsDeleted
        };
      }
      
      throw new HttpsError('invalid-argument', 'Invalid targetType. Use: "group", "club", or "all"');
      
    } catch (error) {
      console.error('Error in devForceCleanup:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to force cleanup');
    }
  }
);
