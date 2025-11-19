import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { CreateClubRequest, CreateClubResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const createNewClub = onCall(
  {
    region: config.region,
  },
  async (request): Promise<CreateClubResponse> => {
    try {
      const { clubName, uid }: CreateClubRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['clubName', 'uid']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Verify the authenticated user matches the uid in the request
      if (request.auth.uid !== uid) {
        throw new HttpsError('permission-denied', 'User can only create clubs for themselves');
      }

      const trimmedName = clubName.trim();
      
      if (!trimmedName) {
        throw new HttpsError('invalid-argument', 'Club name cannot be empty');
      }

      console.log(`Creating new club "${trimmedName}" for user ${uid}`);

      const db = admin.firestore();

      // Check if club with this name already exists (case-insensitive)
      const clubsRef = db.collection('clubs');
      const existingClubQuery = await clubsRef.where('name', '==', trimmedName).get();

      if (!existingClubQuery.empty) {
        throw new HttpsError('already-exists', `A club with the name "${trimmedName}" already exists.`);
      }

      // Generate a new club ID
      const clubId = clubsRef.doc().id;

      // Get user data for the club member document
      const userDoc = await db.collection('users').doc(uid).get();
      let userName = 'User';
      let userEmail = '';
      let userPhotoURL = '';

      if (userDoc.exists) {
        const userData = userDoc.data();
        userName = userData?.displayName || userData?.name || request.auth.token.name || request.auth.token.email?.split('@')[0] || 'User';
        userEmail = userData?.email || request.auth.token.email || '';
        userPhotoURL = userData?.photoURL || request.auth.token.picture || '';
      } else {
        // Fallback to auth token data
        userName = request.auth.token.name || request.auth.token.email?.split('@')[0] || 'User';
        userEmail = request.auth.token.email || '';
        userPhotoURL = request.auth.token.picture || '';
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const timestampNow = admin.firestore.Timestamp.now();

      // Build the club data
      const clubData = {
        name: trimmedName,
        description: '',
        location: '',
        website: '',
        logoUrl: '',
        createdBy: uid,
        createdAt: now,
        adminIds: [uid],
        totalCounts: 1,
        isActive: true,
        version: 1, // Initial version
        lastModified: now,
      };

      // Create club member data for the creator
      const memberData = {
        userId: uid,
        roles: ['club-admin'],
        photoURL: userPhotoURL,
        name: userName,
        email: userEmail,
        addedBy: uid, // Self-added
        joinedAt: timestampNow,
        lastModifiedAt: timestampNow,
        needsGuardian: false, // Creator is assumed to be adult
        guardiansContacts: []
      };

      // Create the allMembers document with the creator
      const allMembersDoc = {
        members: [memberData],
        lastUpdated: timestampNow,
        memberCount: 1,
        version: 1, // Initial version
        lastModified: timestampNow,
      };

      // Build ClubAccess for user document (new structure)
      const clubAccess = {
        clubId: clubId,
        clubName: trimmedName,
        role: 'club-admin', // Updated to role field
        joinedAt: timestampNow.toDate(),
        lastModifiedAt: timestampNow.toDate(),
      };

      // Use a batch for atomicity
      const batch = db.batch();

      // Add club document
      batch.set(clubsRef.doc(clubId), clubData);

      // Add allMembers document
      batch.set(
        db.collection('clubs').doc(clubId).collection('allMembers').doc('members'),
        allMembersDoc
      );

      // Update user document: add new club membership with new structure
      const userRef = db.collection('users').doc(uid);
      batch.update(userRef, {
        clubAccess: admin.firestore.FieldValue.arrayUnion(clubAccess)
      });

      // Commit all operations atomically
      await batch.commit();

      console.log(`Successfully created club ${clubId} for user ${uid}`);

      return {
        success: true,
        clubId: clubId,
        message: 'Club created successfully and added to your profile!'
      };

    } catch (error) {
      console.error('Error in createNewClub:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to create club. Please try again.');
    }
  }
);
