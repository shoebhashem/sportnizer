import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Check if guardian should be marked inactive and update if needed
 * 
 * A guardian is marked inactive only if ALL conditions are met:
 * 1. Guardian has no own club memberships (clubAccess.length === 0)
 * 2. All dependents have no club memberships (dependents.every(d => d.clubAccess.length === 0))
 * 
 * This function is called after removing a youth member to check if their
 * guardian(s) should also be marked inactive.
 * 
 * @param guardianUid - Guardian's user ID to check
 * @returns Result indicating if guardian was marked inactive and why
 */

export interface CheckAndMarkGuardianInactiveRequest {
  guardianUid: string;
}

export interface CheckAndMarkGuardianInactiveResponse {
  success: boolean;
  markedInactive: boolean;
  reason: string;
  error?: string;
}

export const checkAndMarkGuardianInactive = onCall(
  {
    region: config.region,
  },
  async (request): Promise<CheckAndMarkGuardianInactiveResponse> => {
    try {
      const { guardianUid }: CheckAndMarkGuardianInactiveRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['guardianUid']);

      console.log(`Checking if guardian ${guardianUid} should be marked inactive`);

      const db = admin.firestore();
      const guardianRef = db.collection('users').doc(guardianUid);
      const guardianDoc = await guardianRef.get();

      if (!guardianDoc.exists) {
        throw new HttpsError('not-found', 'Guardian not found');
      }

      const guardianData = guardianDoc.data();

      // Check guardian's own club memberships
      const ownClubAccess = guardianData?.clubAccess || [];
      if (ownClubAccess.length > 0) {
        console.log(`Guardian ${guardianUid} has ${ownClubAccess.length} own club membership(s) - keeping active`);
        return {
          success: true,
          markedInactive: false,
          reason: 'Guardian has own club memberships',
        };
      }

      // Check if any dependents have active club memberships
      const dependents = guardianData?.dependents || [];
      const hasActiveDependents = dependents.some((dep: any) => {
        const depClubAccess = dep.clubAccess || [];
        return depClubAccess.length > 0;
      });

      if (hasActiveDependents) {
        console.log(`Guardian ${guardianUid} has dependents with active memberships - keeping active`);
        return {
          success: true,
          markedInactive: false,
          reason: 'Guardian has dependents with active memberships',
        };
      }

      // No own memberships, no active dependents - mark inactive
      console.log(`Guardian ${guardianUid} has no memberships or active dependents - marking inactive`);

      await guardianRef.update({
        isActive: false,
        inactiveSince: admin.firestore.FieldValue.serverTimestamp(),
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`✅ Marked guardian ${guardianUid} as inactive`);

      return {
        success: true,
        markedInactive: true,
        reason: 'No active memberships or dependents',
      };
    } catch (error) {
      console.error('Error in checkAndMarkGuardianInactive:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to check and mark guardian inactive');
    }
  }
);
