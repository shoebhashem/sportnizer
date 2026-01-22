import * as admin from 'firebase-admin';
import { getDefaultProfilePictureUrl } from './config';

/**
 * User creation data interface - matches ARCHITECTURE.md structure
 */
export interface UserCreationData {
  name: string;
  email: string;
  version: number;
  emailVerified: boolean;
  profilePicture: string;
  clubAccess: {
    clubId: string;
    clubName: string;
    role: string;
    joinedAt: Date;
    lastModifiedAt: Date;
    groupAccess: {
      groupId: string;
      groupName: string;
      roles: string[];
      joinedAt: Date;
      lastModifiedAt: Date;
    }[];
    eventAccess: {
      eventId: string;
      eventName: string;
      startDate: Date;
      startTime: string;
      location: string;
      response: 'pending' | 'accepted' | 'declined';
      targetScope: 'club' | 'group' | 'subgroup';
      targetId: string;
    }[];
    pollAccess: {
      pollId: string;
      pollName: string;
      response: 'pending' | 'submitted';
      targetScope: 'club' | 'group' | 'subgroup';
    }[];
    announcementAccess: {
      announcementId: string;
      announcementName: string;
      readAt?: Date;
      targetScope: 'club' | 'group' | 'subgroup';
    }[];
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
    // Update existing user - work with nested structure according to ARCHITECTURE.md
    const userData = userDoc.data();
    const currentClubAccess = userData?.clubAccess || [];
    
    // Find existing club
    const existingClub = currentClubAccess.find(
      (club: any) => club.clubId === clubId
    );
    
    if (existingClub) {
      // Club exists, check if group already exists within it
      const existingGroup = existingClub.groupAccess?.find(
        (group: any) => group.groupId === groupId
      );
      
      if (!existingGroup) {
        // Add group to existing club
        const newGroupMembership = {
          groupId,
          groupName,
          roles: [role],
          joinedAt: new Date(),
          lastModifiedAt: new Date()
        };
        
        const updates: any = {
          [`clubAccess.${currentClubAccess.indexOf(existingClub)}.groupAccess`]: 
            admin.firestore.FieldValue.arrayUnion(newGroupMembership),
          version: admin.firestore.FieldValue.increment(1),
          ...additionalData,
        };
        
        await userRef.update(updates);
      }
    } else {
      // Club doesn't exist, create new club with group
      const newClubAccess = {
        clubId,
        clubName,
        role: 'member',
        joinedAt: new Date(),
        lastModifiedAt: new Date(),
        groupAccess: [{
          groupId,
          groupName,
          roles: [role],
          joinedAt: new Date(),
          lastModifiedAt: new Date()
        }],
        eventAccess: [],
        pollAccess: [],
        announcementAccess: []
      };
      
      const updates: any = {
        clubAccess: admin.firestore.FieldValue.arrayUnion(newClubAccess),
        version: admin.firestore.FieldValue.increment(1),
        ...additionalData,
      };
      
      await userRef.update(updates);
    }
  } else {
    // Create new user document according to ARCHITECTURE.md structure
    const defaultUserData: UserCreationData = {
      name: userRecord.displayName || userRecord.email?.split('@')[0] || 'User',
      email: userRecord.email?.toLowerCase() || '',
      version: 1, // Start with version 1
      emailVerified: userRecord.emailVerified || false,
      profilePicture: getDefaultProfilePictureUrl(),
      clubAccess: [{
        clubId,
        clubName,
        role: 'member',
        joinedAt: new Date(),
        lastModifiedAt: new Date(),
        groupAccess: [{
          groupId,
          groupName,
          roles: [role],
          joinedAt: new Date(),
          lastModifiedAt: new Date()
        }],
        eventAccess: [],
        pollAccess: [],
        announcementAccess: []
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
