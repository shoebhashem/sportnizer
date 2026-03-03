import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

const GRACE_PERIOD_DAYS = 30;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

export const deleteClub = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, deletionScheduledAt?: number, gracePeriodDays?: number, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubId, verificationToken } = request.data;
      validateRequiredFields(request.data, ['clubId']);
      
      // Note: verificationToken is optional for now
      // In production, this should be required and validated with JWT
      // TODO: Implement JWT verification when support email system is ready
      
      // 3. Get club and verify permissions
      const db = admin.firestore();
      const clubRef = db.collection('clubs').doc(clubId);
      
      // Verify club exists and user has permission
      const clubDoc = await clubRef.get();
      if (!clubDoc.exists) {
        throw new HttpsError('not-found', 'Club not found');
      }
      
      // Check if user is club admin
      const clubMembersDoc = await clubRef.collection('allMembers').doc('members').get();
      const clubMembersData = clubMembersDoc.data();
      const userMembership = clubMembersData?.members?.find((m: any) => m.userId === request.auth!.uid);
      
      if (!userMembership?.roles?.includes('club-admin')) {
        throw new HttpsError('permission-denied', 'Only club admins can delete clubs');
      }
      
      // Calculate deletion timestamp
      const deletionTimestamp = Timestamp.fromMillis(
        Date.now() + GRACE_PERIOD_MS
      );
      
      // 4. Soft delete club
      await clubRef.update({
        isActive: false,
        deletionScheduledAt: deletionTimestamp,
        deletedBy: request.auth.uid,
        deletedAt: FieldValue.serverTimestamp(),
        verificationToken: verificationToken || null,
        lastModifiedAt: FieldValue.serverTimestamp(),
        version: FieldValue.increment(1)
      });
      
      // Decrement user's active clubs counter (subscription limit tracking)
      const userRef = db.collection('users').doc(request.auth.uid);
      await userRef.update({
        activeClubsAsAdmin: FieldValue.increment(-1)
      });
      
      console.log(`Soft deleted club ${clubId}. Decremented user's activeClubsAsAdmin.`);
      
      // 5. Cascade soft delete to all groups (which will cascade to subgroups)
      const groupsSnapshot = await clubRef.collection('groups').get();
      if (!groupsSnapshot.empty) {
        const batch = db.batch();
        
        for (const groupDoc of groupsSnapshot.docs) {
          // Soft delete group
          batch.update(groupDoc.ref, {
            isActive: false,
            deletionScheduledAt: deletionTimestamp,
            deletedBy: request.auth!.uid,
            deletedAt: FieldValue.serverTimestamp(),
            deletionReason: 'club-deletion'
          });
          
          // Soft delete all subgroups in this group
          const subgroupsSnapshot = await groupDoc.ref.collection('subgroups').get();
          if (!subgroupsSnapshot.empty) {
            subgroupsSnapshot.docs.forEach((subgroupDoc) => {
              batch.update(subgroupDoc.ref, {
                isActive: false,
                deletionScheduledAt: deletionTimestamp,
                deletedBy: request.auth!.uid,
                deletedAt: FieldValue.serverTimestamp(),
                deletionReason: 'club-deletion'
              });
            });
          }
        }
        
        await batch.commit();
        console.log(`Soft deleted ${groupsSnapshot.size} groups and their subgroups in cascade`);
      }
      
      console.log(`Club ${clubId} scheduled for deletion on ${deletionTimestamp.toDate()}`);
      
      // 6. Return consistent response
      return {
        success: true,
        deletionScheduledAt: deletionTimestamp.toMillis(),
        gracePeriodDays: GRACE_PERIOD_DAYS
      };
      
    } catch (error) {
      console.error('Error in deleteClub:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to delete club');
    }
  }
);

