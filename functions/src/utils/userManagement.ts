import * as admin from 'firebase-admin';
import { getDefaultProfilePictureUrl } from './config';

/**
 * User creation data interface
 */
export interface UserCreationData {
  name: string;
  email: string;
  emailVerified: boolean;
  profilePicture: string;
  groupAccess: { // Updated from groupsJoined
    groupId: string;
    groupName: string;
    clubId: string;
    roles: string[];
    joinedAt: Date;
    lastModifiedAt: Date;
  }[];
  clubAccess: { // Added new field
    clubId: string;
    clubName: string;
    role: string;
    joinedAt: Date;
    lastModifiedAt: Date;
  }[];
  eventsInvited: any[];
  createdAt: admin.firestore.FieldValue;
}

/**
 * Group membership interface (updated)
 */
export interface GroupMembership {
  groupId: string;
  groupName: string;
  clubId: string;
  roles: string[];
  joinedAt: Date;
  lastModifiedAt: Date;
}

/**
 * Create or update user in Firestore with group membership
 */
export const createOrUpdateUserWithGroup = async (
  userRecord: admin.auth.UserRecord,
  groupId: string,
  groupName: string,
  clubId: string,
  clubName: string,
  role: string = 'member',
  additionalData?: Partial<UserCreationData>
): Promise<void> => {
  const userRef = admin.firestore().collection('users').doc(userRecord.uid);
  const userDoc = await userRef.get();
  
  if (userDoc.exists) {
    // Update existing user
    const userData = userDoc.data();
    const currentGroupAccess = userData?.groupAccess || userData?.groupsJoined || [];
    const currentClubAccess = userData?.clubAccess || userData?.clubs || [];
    
    // Check if group already exists
    const existingMembership = currentGroupAccess.find(
      (membership: any) => membership.groupId === groupId
    );
    
    if (!existingMembership) {
      const newGroupMembership: GroupMembership = {
        groupId,
        groupName,
        clubId,
        roles: [role],
        joinedAt: new Date(),
        lastModifiedAt: new Date()
      };
      
      // Also add club access if not exists
      const existingClub = currentClubAccess.find(
        (club: any) => club.clubId === clubId
      );
      
      const updates: any = {
        groupAccess: admin.firestore.FieldValue.arrayUnion(newGroupMembership),
        ...additionalData,
      };
      
      if (!existingClub) {
        updates.clubAccess = admin.firestore.FieldValue.arrayUnion({
          clubId,
          clubName,
          role: 'member',
          joinedAt: new Date(),
          lastModifiedAt: new Date()
        });
      }
      
      await userRef.update(updates);
    }
  } else {
    // Create new user document
    const defaultUserData: UserCreationData = {
      name: userRecord.displayName || userRecord.email?.split('@')[0] || 'User',
      email: userRecord.email?.toLowerCase() || '',
      emailVerified: userRecord.emailVerified || false,
      profilePicture: getDefaultProfilePictureUrl(),
      clubAccess: [{
        clubId,
        clubName,
        role: 'member',
        joinedAt: new Date(),
        lastModifiedAt: new Date()
      }],
      groupAccess: [{
        groupId,
        groupName,
        clubId,
        roles: [role],
        joinedAt: new Date(),
        lastModifiedAt: new Date()
      }],
      eventsInvited: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await userRef.set({
      ...defaultUserData,
      ...additionalData,
    });
  }
};

/**
 * Find or create user by email
 */
export const findOrCreateUserByEmail = async (
  email: string,
  name?: string
): Promise<admin.auth.UserRecord> => {
  try {
    // Try to find existing user
    return await admin.auth().getUserByEmail(email);
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      // Create new user
      return await admin.auth().createUser({
        email: email.toLowerCase(),
        displayName: name,
      });
    }
    throw error;
  }
};

/**
 * Clean up expired tokens from a collection
 */
export const cleanupExpiredTokens = async (
  collectionName: string,
  uid: string,
  field: string = 'uid'
): Promise<void> => {
  const expiredTokensQuery = await admin.firestore()
    .collection(collectionName)
    .where(field, '==', uid)
    .where('verified', '==', false)
    .get();
  
  if (!expiredTokensQuery.empty) {
    const batch = admin.firestore().batch();
    expiredTokensQuery.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`Cleaned up ${expiredTokensQuery.docs.length} expired tokens for user:`, uid);
  }
};
