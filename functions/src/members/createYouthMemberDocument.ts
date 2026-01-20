import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Creates a Firestore user document for a youth member (NO Firebase Auth account)
 * 
 * Youth members are minors who:
 * - Cannot sign in to the app (no Firebase Auth account)
 * - Are managed by guardians through guardian accounts
 * - Have full user documents with clubAccess structure
 * - Are linked bidirectionally to guardian documents
 * 
 * @param childName - Youth member's full name
 * @param dateOfBirth - ISO format date string (e.g., "2010-05-15")
 * @param guardianUid - Authenticated guardian's Firebase Auth UID
 * @param guardianEmail - Guardian's email address
 * @param guardianName - Guardian's display name
 * @param relationship - Relationship to youth ("parent", "guardian", "legal_guardian")
 * @param photoURL - Optional profile picture URL
 * 
 * @returns Promise with youth member UID on success
 * 
 * @throws HttpsError('unauthenticated') - Guardian not authenticated
 * @throws HttpsError('permission-denied') - UID mismatch
 * @throws HttpsError('invalid-argument') - Missing required fields
 */

export interface CreateYouthMemberDocumentRequest {
  childName: string;
  dateOfBirth: string;
  guardianUid: string;
  guardianEmail: string;
  guardianName: string;
  relationship: string;
  photoURL?: string;
}

export interface CreateYouthMemberDocumentResponse {
  success: boolean;
  youthUid?: string;
  message?: string;
  error?: string;
}

export const createYouthMemberDocument = onCall(
  {
    region: config.region,
  },
  async (request): Promise<CreateYouthMemberDocumentResponse> => {
    try {
      // 1. Verify guardian is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Guardian must be authenticated');
      }

      const {
        childName,
        dateOfBirth,
        guardianUid,
        guardianEmail,
        guardianName,
        relationship,
        photoURL,
      }: CreateYouthMemberDocumentRequest = request.data;

      // 2. Validate guardian UID matches authenticated user
      if (request.auth.uid !== guardianUid) {
        throw new HttpsError('permission-denied', 'Guardian UID mismatch');
      }

      // 3. Validate required fields
      validateRequiredFields(request.data, [
        'childName',
        'dateOfBirth',
        'guardianUid',
        'guardianEmail',
        'guardianName',
        'relationship',
      ]);

      console.log(`Creating youth member document for ${childName} with guardian ${guardianUid}`);

      const db = admin.firestore();

      // 4. Validate guardian document exists
      const guardianDoc = await db.collection('users').doc(guardianUid).get();
      if (!guardianDoc.exists) {
        throw new HttpsError('not-found', 'Guardian user document not found');
      }

      // 5. Create Firestore document for youth member (NO Firebase Auth account!)
      const DEFAULT_CHILD_PHOTO = 'https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fchild_profile_icon.png?alt=media';

      const youthDocRef = db.collection('users').doc(); // Auto-generate document ID

      const youthProfile = {
        uid: youthDocRef.id, // Document ID becomes the UID
        displayName: childName.trim(),
        dateOfBirth: dateOfBirth,
        photoURL: photoURL || DEFAULT_CHILD_PHOTO,
        phoneNumber: null,

        // Youth-specific fields
        isYouth: true,
        guardians: [
          {
            guardianUid,
            guardianName,
            guardianEmail,
            relationship,
            addedAt: new Date(),
            canManage: true,
          },
        ],

        // Standard user fields
        clubAccess: [], // Empty array - youth joins clubs later
        groupsCreated: 0,
        version: 1,

        // NO email field - youth members don't have email/auth
        // NO emailVerified - not applicable
        // NO verificationStatus - not applicable

        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      };

      await youthDocRef.set(youthProfile);

      console.log(`✅ Youth member document created: ${youthDocRef.id}`);

      // 6. Update guardian document with dependent reference
      await db
        .collection('users')
        .doc(guardianUid)
        .update({
          dependents: admin.firestore.FieldValue.arrayUnion({
            uid: youthDocRef.id,
            childName: childName.trim(),
            dateOfBirth,
            relationship,
            addedAt: new Date(),
            clubAccess: [], // Initialize empty - will be populated when youth joins clubs
          }),
          version: admin.firestore.FieldValue.increment(1),
        });

      console.log(`✅ Guardian ${guardianUid} updated with dependent ${youthDocRef.id}`);

      return {
        success: true,
        youthUid: youthDocRef.id,
        message: `Youth member ${childName} created successfully`,
      };
    } catch (error) {
      console.error('Error in createYouthMemberDocument:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', 'Failed to create youth member document');
    }
  }
);
