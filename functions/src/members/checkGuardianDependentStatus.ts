import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Check guardian/dependent status for a user
 * 
 * This function analyzes a user's relationship status to determine:
 * - If user is a youth member (player-underage)
 * - If user is a guardian with dependents
 * - Guardian and dependent details for removal validation
 * 
 * Used before member removal to:
 * - Block guardian removal if dependents exist in club
 * - Identify guardians to update when youth is removed
 * - Determine if user should be marked inactive after removal
 * 
 * @param userId - User ID to check
 * @param clubId - Club ID for context-specific checks
 * @returns GuardianDependentStatus object with relationship details
 */

export interface CheckGuardianDependentStatusRequest {
  userId: string;
  clubId: string;
}

export interface GuardianInfo {
  guardianUid: string;
  guardianName: string;
  guardianEmail: string;
  relationship: string;
}

export interface DependentInfo {
  uid: string;
  childName: string;
}

export interface GuardianDependentStatusResponse {
  success: boolean;
  isYouth: boolean;
  isGuardian: boolean;
  guardians?: GuardianInfo[];
  dependentCount?: number;
  dependentsInThisClub?: number;
  dependentIds?: DependentInfo[];
  hasOwnMembership?: boolean;
  hasOtherClubs: boolean;
  needsGuardianCleanup?: boolean;
  error?: string;
}

export const checkGuardianDependentStatus = onCall(
  {
    region: config.region,
  },
  async (request): Promise<GuardianDependentStatusResponse> => {
    try {
      const { userId, clubId }: CheckGuardianDependentStatusRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['userId', 'clubId']);

      console.log(`Checking guardian/dependent status for user ${userId} in club ${clubId}`);

      const db = admin.firestore();

      // Get user document
      const userDoc = await db.collection('users').doc(userId).get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();

      // Check if user is a youth member
      if (userData?.isYouth === true) {
        const guardians: GuardianInfo[] = userData.guardians || [];
        const clubAccess = userData.clubAccess || [];
        const hasOtherClubs = clubAccess.length > 1; // More than just this club

        console.log(`User ${userId} is a youth member with ${guardians.length} guardian(s)`);

        return {
          success: true,
          isYouth: true,
          isGuardian: false,
          guardians,
          hasOtherClubs,
          needsGuardianCleanup: true,
        };
      }

      // Check if user is a guardian (has dependents)
      const dependents = userData?.dependents || [];

      if (dependents.length > 0) {
        console.log(`User ${userId} is a guardian with ${dependents.length} dependent(s)`);

        // Find dependents who are members of this specific club
        const dependentsInThisClub: DependentInfo[] = [];

        for (const dependent of dependents) {
          const depClubAccess = dependent.clubAccess || [];
          const isInThisClub = depClubAccess.some((ca: any) => ca.clubId === clubId);

          if (isInThisClub) {
            dependentsInThisClub.push({
              uid: dependent.uid,
              childName: dependent.childName || 'Unknown',
            });
          }
        }

        // Check if guardian has own membership in this club
        const clubAccess = userData?.clubAccess || [];
        const hasOwnMembership = clubAccess.some((ca: any) => ca.clubId === clubId);

        // Check if user has other clubs (for inactivity logic)
        const hasOtherClubs = clubAccess.length > 1; // More than just this club

        console.log(
          `Guardian has ${dependentsInThisClub.length} dependents in this club, ` +
            `own membership: ${hasOwnMembership}, other clubs: ${hasOtherClubs}`
        );

        return {
          success: true,
          isYouth: false,
          isGuardian: true,
          dependentCount: dependents.length,
          dependentsInThisClub: dependentsInThisClub.length,
          dependentIds: dependentsInThisClub,
          hasOwnMembership,
          hasOtherClubs,
        };
      }

      // Regular user (not youth, not guardian)
      const clubAccess = userData?.clubAccess || [];
      const hasOtherClubs = clubAccess.length > 1; // More than just this club

      console.log(`User ${userId} is a regular user with ${clubAccess.length} club(s)`);

      return {
        success: true,
        isYouth: false,
        isGuardian: false,
        hasOtherClubs,
      };
    } catch (error) {
      console.error('Error in checkGuardianDependentStatus:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to check guardian/dependent status');
    }
  }
);
