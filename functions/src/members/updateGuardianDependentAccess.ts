import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FunctionResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Updates the guardian's dependents array with the youth's current clubAccess
 * This allows guardians to see their dependents' group memberships without needing
 * read permission on the youth's document
 */
export const updateGuardianDependentAccess = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const { youthUid, guardianUid } = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['youthUid', 'guardianUid']);

      console.log(`Updating dependent access for youth ${youthUid} in guardian ${guardianUid}'s profile`);

      // Get youth's current clubAccess
      const youthRef = admin.firestore().collection('users').doc(youthUid);
      const youthDoc = await youthRef.get();

      if (!youthDoc.exists) {
        throw new HttpsError('not-found', 'Youth member document not found');
      }

      const youthData = youthDoc.data();
      const youthClubAccess = youthData?.clubAccess || [];

      // Get guardian's document
      const guardianRef = admin.firestore().collection('users').doc(guardianUid);
      const guardianDoc = await guardianRef.get();

      if (!guardianDoc.exists) {
        throw new HttpsError('not-found', 'Guardian document not found');
      }

      const guardianData = guardianDoc.data();
      const dependents = guardianData?.dependents || [];

      // Find the dependent entry for this youth
      const dependentIndex = dependents.findIndex((dep: any) => dep.uid === youthUid);

      if (dependentIndex === -1) {
        throw new HttpsError('not-found', 'Youth member not found in guardian\'s dependents array');
      }

      // Update the dependent's clubAccess
      dependents[dependentIndex] = {
        ...dependents[dependentIndex],
        clubAccess: youthClubAccess
      };

      // Update guardian document
      await guardianRef.update({
        dependents: dependents,
        version: admin.firestore.FieldValue.increment(1),
        lastModified: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Successfully updated dependent access for youth ${youthUid} in guardian ${guardianUid}'s profile`);

      return {
        success: true,
        message: `Guardian dependent access updated successfully`
      };

    } catch (error) {
      console.error('Error in updateGuardianDependentAccess:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to update guardian dependent access');
    }
  }
);
