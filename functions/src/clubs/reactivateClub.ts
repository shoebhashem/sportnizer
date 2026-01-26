import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Reactivates a soft-deleted club (undo deletion within grace period)
 * Also reactivates all groups and subgroups that were cascade-deleted
 */
export const reactivateClub = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, reactivatedGroups?: number, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubId } = request.data;
      validateRequiredFields(request.data, ['clubId']);
      
      // Note: verificationToken validation will be implemented when support system is ready
      // TODO: Verify JWT token when email verification system is in place
      // const verificationToken = request.data.verificationToken; // Optional for now
      
      // 3. Get club and verify permissions
      const db = admin.firestore();
      const clubRef = db.collection('clubs').doc(clubId);
      
      const clubDoc = await clubRef.get();
      if (!clubDoc.exists) {
        throw new HttpsError('not-found', 'Club not found');
      }
      
      const club = clubDoc.data()!;
      
      // Check if user is club admin
      const clubMembersDoc = await clubRef.collection('allMembers').doc('members').get();
      const clubMembersData = clubMembersDoc.data();
      const userMembership = clubMembersData?.members?.find((m: any) => m.userId === request.auth!.uid);
      
      if (!userMembership?.roles?.includes('club-admin')) {
        throw new HttpsError('permission-denied', 'Only club admins can reactivate clubs');
      }
      
      // Check if club is actually soft deleted
      if (club.isActive !== false) {
        throw new HttpsError('failed-precondition', 'Club is not deleted');
      }
      
      // Check if still within grace period
      if (club.deletionScheduledAt) {
        const now = Date.now();
        const scheduledTime = club.deletionScheduledAt.toMillis();
        
        if (scheduledTime < now) {
          throw new HttpsError(
            'failed-precondition', 
            'Grace period has expired. Club has been permanently deleted or scheduled for immediate deletion.'
          );
        }
      }
      
      // 4. Reactivate club
      await clubRef.update({
        isActive: true,
        deletionScheduledAt: admin.firestore.FieldValue.delete(),
        reactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        reactivatedBy: request.auth.uid,
        verificationToken: admin.firestore.FieldValue.delete(),
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1)
      });
      
      // 5. Reactivate all groups and subgroups (cascade)
      const groupsSnapshot = await clubRef.collection('groups')
        .where('isActive', '==', false)
        .get();
      
      let reactivatedGroupCount = 0;
      
      if (!groupsSnapshot.empty) {
        const batch = db.batch();
        
        for (const groupDoc of groupsSnapshot.docs) {
          // Reactivate group
          batch.update(groupDoc.ref, {
            isActive: true,
            deletionScheduledAt: admin.firestore.FieldValue.delete(),
            reactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
            deletionReason: admin.firestore.FieldValue.delete()
          });
          reactivatedGroupCount++;
          
          // Reactivate all subgroups in this group
          const subgroupsSnapshot = await groupDoc.ref.collection('subgroups')
            .where('isActive', '==', false)
            .get();
          
          if (!subgroupsSnapshot.empty) {
            subgroupsSnapshot.docs.forEach((subgroupDoc) => {
              batch.update(subgroupDoc.ref, {
                isActive: true,
                deletionScheduledAt: admin.firestore.FieldValue.delete(),
                reactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
                deletionReason: admin.firestore.FieldValue.delete()
              });
            });
          }
        }
        
        await batch.commit();
        console.log(`Reactivated ${reactivatedGroupCount} groups and their subgroups in cascade`);
      }
      
      console.log(`Successfully reactivated club ${clubId}`);
      
      return {
        success: true,
        reactivatedGroups: reactivatedGroupCount
      };
      
    } catch (error) {
      console.error('Error in reactivateClub:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to reactivate club');
    }
  }
);
