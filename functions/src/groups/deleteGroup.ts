import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

const GRACE_PERIOD_DAYS = 30;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

export const deleteGroup = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, deletionScheduledAt?: number, gracePeriodDays?: number, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // 2. Extract and validate parameters
      const { clubId, groupId } = request.data;
      validateRequiredFields(request.data, ['clubId', 'groupId']);
      
      // 3. Get group and verify permissions
      const db = admin.firestore();
      const groupRef = db.collection('clubs').doc(clubId).collection('groups').doc(groupId);
      
      // Verify group exists and user has permission
      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Group not found');
      }
      
      const group = groupDoc.data();
      if (!group?.admins?.includes(request.auth.uid)) {
        throw new HttpsError('permission-denied', 'Only group admins can delete groups');
      }
      
      // Calculate deletion timestamp
      const deletionTimestamp = admin.firestore.Timestamp.fromMillis(
        Date.now() + GRACE_PERIOD_MS
      );
      
      // 4. Soft delete group - mark as inactive
      await groupRef.update({
        isActive: false,
        deletionScheduledAt: deletionTimestamp,
        deletedBy: request.auth.uid,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1)
      });
      
      // Decrement club's active group counter (subscription limit tracking)
      const clubRef = db.collection('clubs').doc(clubId);
      await clubRef.update({
        activeGroupCount: admin.firestore.FieldValue.increment(-1)
      });
      
      console.log(`Soft deleted group ${groupId}. Decremented club's activeGroupCount.`);
      
      // 5. Cascade soft delete to all subgroups
      const subgroupsSnapshot = await groupRef.collection('subgroups').get();
      if (!subgroupsSnapshot.empty) {
        const batch = db.batch();
        subgroupsSnapshot.docs.forEach((subgroupDoc) => {
          batch.update(subgroupDoc.ref, {
            isActive: false,
            deletionScheduledAt: deletionTimestamp,
            deletedBy: request.auth!.uid,
            deletedAt: admin.firestore.FieldValue.serverTimestamp(),
            deletionReason: 'parent-group-deletion'
          });
        });
        await batch.commit();
        console.log(`Soft deleted ${subgroupsSnapshot.size} subgroups in cascade`);
      }
      
      // 6. Return consistent response
      return {
        success: true,
        deletionScheduledAt: deletionTimestamp.toMillis(),
        gracePeriodDays: GRACE_PERIOD_DAYS
      };
      
    } catch (error) {
      console.error('Error in deleteGroup:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to delete group');
    }
  }
);
