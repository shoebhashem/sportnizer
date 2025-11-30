import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config, getDefaultProfilePictureUrl } from './config';

/**
 * Fix empty user documents by populating them with required fields
 * This function handles cases where user documents exist but are empty
 */
export const fixEmptyUserDocument = onCall(
  { region: config.region },
  async (request): Promise<{success: boolean, message?: string, error?: string}> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { uid } = request.data;
      const targetUserId = uid || request.auth.uid; // Fix own document if no uid provided

      console.log(`Fixing empty user document for userId: ${targetUserId}`);

      // 2. Get user document
      const db = admin.firestore();
      const userRef = db.collection('users').doc(targetUserId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User document does not exist');
      }

      const userData = userDoc.data();
      
      // 3. Check if document is empty or missing required fields
      const hasRequiredFields = userData && 
        userData.email && 
        userData.uid && 
        userData.hasOwnProperty('clubAccess');

      if (hasRequiredFields) {
        return {
          success: true,
          message: 'User document already has required fields'
        };
      }

      // 4. Get user info from Firebase Auth
      const authUser = await admin.auth().getUser(targetUserId);

      // 5. Populate document with required fields
      const updatedData = {
        uid: targetUserId,
        email: authUser.email?.toLowerCase() || '',
        displayName: authUser.displayName || authUser.email?.split('@')[0] || 'User',
        emailVerified: authUser.emailVerified || true, // Assume verified if they're logged in
        verificationStatus: 'verified',
        profilePicture: authUser.photoURL || getDefaultProfilePictureUrl(),
        clubAccess: userData?.clubAccess || [], // Preserve existing clubAccess if any
        version: userData?.version || 1,
        createdAt: userData?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
        // Preserve any existing data
        ...userData
      };

      // 6. Update the document
      await userRef.set(updatedData, { merge: true });

      console.log(`✅ Successfully fixed empty user document for ${targetUserId}`);

      return {
        success: true,
        message: 'User document populated with required fields'
      };

    } catch (error) {
      console.error('Error fixing empty user document:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to fix user document');
    }
  }
);
