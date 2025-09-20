import {
    arrayUnion,
    collection,
    doc,
    getFirestore,
    runTransaction,
    serverTimestamp
} from 'firebase/firestore';
import { getCurrentUser } from './authService';

export interface ClubData {
  name: string;
  description?: string;
  location?: string;
  website?: string;
  logoUrl?: string;
  createdBy: string;
  createdAt: any;
  adminIds: string[];
  memberIds: string[];
  isActive: boolean;
}

export interface GroupData {
  name: string;
  sportType: string;
  description?: string;
  clubId: string;
  createdBy: string;
  createdAt: any;
  adminIds: string[];
  memberIds: string[];
  isActive: boolean;
  maxMembers?: number;
}

export interface CreateClubAndGroupRequest {
  clubName: string;
  groupName: string;
  sportType: string;
  description?: string;
  location?: string;
}

/**
 * Creates a new club and its first group, then updates user's clubs array
 */
export const createClubAndGroup = async (data: CreateClubAndGroupRequest) => {
  const user = getCurrentUser();
  if (!user) {
    return { 
      success: false, 
      error: { code: 'auth/no-user', message: 'You must be signed in to create a club.' }
    };
  }

  const db = getFirestore();

  try {
    const result = await runTransaction(db, async (transaction) => {
      // Generate IDs
      const clubId = doc(collection(db, 'clubs')).id;
      const groupId = doc(collection(db, 'clubs', clubId, 'groups')).id;
      
      // Create club document
      const clubData: ClubData = {
        name: data.clubName.trim(),
        description: data.description?.trim() || '',
        location: data.location?.trim() || '',
        website: '',
        logoUrl: '',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        adminIds: [user.uid],
        memberIds: [user.uid],
        isActive: true,
      };

      // Create group document as subcollection under club
      const groupData: GroupData = {
        name: data.groupName.trim(),
        sportType: data.sportType,
        description: '',
        clubId: clubId,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        adminIds: [user.uid],
        memberIds: [user.uid],
        isActive: true,
      };

      // Set documents
      transaction.set(doc(db, 'clubs', clubId), clubData);
      transaction.set(doc(db, 'clubs', clubId, 'groups', groupId), groupData);

      // Update user's clubs array
      transaction.update(doc(db, 'users', user.uid), {
        clubs: arrayUnion({
          clubId: clubId,
          isAdmin: true,
          joinedAt: new Date(),
          role: 'admin'
        }),
        groupsCreated: 1 // Increment groups created
      });

      return { clubId, groupId };
    });

    return { 
      success: true, 
      clubId: result.clubId,
      groupId: result.groupId,
      message: 'Club and group created successfully!'
    };

  } catch (error: any) {
    console.error('Error creating club and group:', error);
    return { 
      success: false, 
      error: { 
        code: error.code || 'unknown',
        message: error.message || 'Failed to create club and group. Please try again.'
      }
    };
  }
};

/**
 * Creates a new group under an existing club
 */
export const createGroupInClub = async (clubId: string, groupName: string, sportType: string) => {
  const user = getCurrentUser();
  if (!user) {
    return { 
      success: false, 
      error: { code: 'auth/no-user', message: 'You must be signed in to create a group.' }
    };
  }

  const db = getFirestore();

  try {
    const result = await runTransaction(db, async (transaction) => {
      // Generate group ID
      const groupId = doc(collection(db, 'clubs', clubId, 'groups')).id;
      
      // Create group document as subcollection under club
      const groupData: GroupData = {
        name: groupName.trim(),
        sportType: sportType,
        description: '',
        clubId: clubId,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        adminIds: [user.uid],
        memberIds: [user.uid],
        isActive: true,
      };

      // Set group document
      transaction.set(doc(db, 'clubs', clubId, 'groups', groupId), groupData);

      // Update user's groupsCreated count
      transaction.update(doc(db, 'users', user.uid), {
        groupsCreated: 1 // You might want to increment this instead
      });

      return { groupId };
    });

    return { 
      success: true, 
      groupId: result.groupId,
      message: 'Group created successfully!'
    };

  } catch (error: any) {
    console.error('Error creating group in club:', error);
    return { 
      success: false, 
      error: { 
        code: error.code || 'unknown',
        message: error.message || 'Failed to create group. Please try again.'
      }
    };
  }
};

/**
 * Fetches clubs where user is admin
 */
export const getUserAdminClubs = async (clubs: any[]) => {
  if (!clubs || clubs.length === 0) return [];
  
  const adminClubs = clubs.filter(club => club.isAdmin === true);
  
  try {
    // Return simplified admin clubs list
    // Note: In a real implementation, you'd fetch actual club documents
    // to get names, logos, etc. For now, return basic info
    return adminClubs.map(club => ({
      id: club.clubId,
      name: `Club ${club.clubId}`, // Placeholder - fetch actual name from Firestore
      isAdmin: club.isAdmin,
      joinedAt: club.joinedAt
    }));
  } catch (error) {
    console.error('Error fetching admin clubs:', error);
    return [];
  }
};

export const SPORT_TYPES = [
  'Football/Soccer',
  'Basketball',
  'Baseball',
  'Tennis',
  'Volleyball',
  'Swimming',
  'Track & Field',
  'Golf',
  'Hockey',
  'Rugby',
  'Cricket',
  'Badminton',
  'Table Tennis',
  'Martial Arts',
  'Gymnastics',
  'Wrestling',
  'Boxing',
  'Cycling',
  'Running',
  'Other'
];
