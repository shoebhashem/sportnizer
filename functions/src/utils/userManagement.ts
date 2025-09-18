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
  groupsJoined: {
    groupId: string;
    roles: string[];
    joinedAt: Date;
    status: string;
  }[];
  eventsInvited: any[];
  createdAt: admin.firestore.FieldValue;
}

/**
 * Group membership interface
 */
export interface GroupMembership {
  groupId: string;
  roles: string[];
  joinedAt: Date;
  status: string;
}

/**
 * Create or update user in Firestore with group membership
 */
export const createOrUpdateUserWithGroup = async (
  userRecord: admin.auth.UserRecord,
  groupId: string,
  role: string = 'member',
  additionalData?: Partial<UserCreationData>
): Promise<void> => {
  const userRef = admin.firestore().collection('users').doc(userRecord.uid);
  const userDoc = await userRef.get();
  
  if (userDoc.exists) {
    // Update existing user
    const userData = userDoc.data();
    const currentGroupsJoined = userData?.groupsJoined || [];
    
    // Check if group already exists
    const existingMembership = currentGroupsJoined.find(
      (membership: any) => membership.groupId === groupId
    );
    
    if (!existingMembership) {
      const newMembership: GroupMembership = {
        groupId,
        roles: [role],
        joinedAt: new Date(),
        status: 'active'
      };
      
      await userRef.update({
        groupsJoined: admin.firestore.FieldValue.arrayUnion(newMembership),
        ...additionalData,
      });
    }
  } else {
    // Create new user document
    const defaultUserData: UserCreationData = {
      name: userRecord.displayName || userRecord.email?.split('@')[0] || 'User',
      email: userRecord.email?.toLowerCase() || '',
      emailVerified: userRecord.emailVerified || false,
      profilePicture: getDefaultProfilePictureUrl(),
      groupsJoined: [{
        groupId,
        roles: [role],
        joinedAt: new Date(),
        status: 'active'
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
