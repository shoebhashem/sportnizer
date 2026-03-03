import * as admin from 'firebase-admin';
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FunctionResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Update guardian's dependent tracking when youth is removed from club
 * 
 * When a youth member is removed from a club, all their guardians' dependent
 * tracking must be updated to reflect this change. This allows guardians to
 * see accurate club access for their dependents.
 * 
 * @param guardianUid - Guardian's user ID
 * @param youthUid - Youth member's user ID
 * @param clubId - Club ID to remove from dependent's clubAccess
 * @returns Success result
 */

export interface UpdateGuardianDependentClubRemovalRequest {
  guardianUid: string;
  youthUid: string;
  clubId: string;
}

export const updateGuardianDependentClubRemoval = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const { guardianUid, youthUid, clubId }: UpdateGuardianDependentClubRemovalRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['guardianUid', 'youthUid', 'clubId']);

      console.log(
        `Removing club ${clubId} from dependent ${youthUid} in guardian ${guardianUid}'s profile`
      );

      const db = admin.firestore();
      const guardianRef = db.collection('users').doc(guardianUid);
      const guardianDoc = await guardianRef.get();

      if (!guardianDoc.exists) {
        throw new HttpsError('not-found', 'Guardian not found');
      }

      const guardianData = guardianDoc.data();
      const dependents = guardianData?.dependents || [];

      // Find and update the specific dependent
      const updatedDependents = dependents.map((dep: any) => {
        if (dep.uid === youthUid) {
          // Remove this specific club from dependent's clubAccess
          const depClubAccess = dep.clubAccess || [];
          const updatedClubAccess = depClubAccess.filter((ca: any) => ca.clubId !== clubId);

          return {
            ...dep,
            clubAccess: updatedClubAccess,
          };
        }
        return dep;
      });

      // Update guardian document
      await guardianRef.update({
        dependents: updatedDependents,
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp(),
      });

      console.log(
        `✅ Updated dependent ${youthUid} club access in guardian ${guardianUid}'s profile`
      );

      return {
        success: true,
        message: 'Guardian dependent tracking updated successfully',
      };
    } catch (error) {
      console.error('Error in updateGuardianDependentClubRemoval:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to update guardian dependent club removal');
    }
  }
);
