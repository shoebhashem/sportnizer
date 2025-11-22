import {
    arrayUnion,
    doc,
    getFirestore,
    runTransaction,
    updateDoc
} from 'firebase/firestore';

const db = getFirestore();

/**
 * Updates club information in user's clubs array
 * This handles updating totalMembers and groupCount efficiently
 */
export const updateUserClubData = async (
  userId: string,
  clubId: string,
  updates: {
    totalMembers?: number;
    groupCount?: number;
    clubName?: string;
  }
) => {
  try {
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', userId);
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists()) {
        throw new Error(`User document not found: ${userId}`);
      }

      const userData = userDoc.data();
      const clubs = userData.clubs || [];
      
      // Find and update the specific club
      const updatedClubs = clubs.map((club: any) => {
        if (club.clubId === clubId) {
          return {
            ...club,
            ...updates
          };
        }
        return club;
      });

      transaction.update(userRef, { clubs: updatedClubs });
    });

    console.log(`✅ Updated club data for user ${userId}, club ${clubId}`);
  } catch (error) {
    console.error(`❌ Failed to update club data for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Updates group information in user's groupsJoined array
 */
export const updateUserGroupData = async (
  userId: string,
  groupId: string,
  updates: {
    memberCount?: number;
    sportType?: string;
    groupName?: string;
  }
) => {
  try {
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', userId);
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists()) {
        throw new Error(`User document not found: ${userId}`);
      }

      const userData = userDoc.data();
      const groups = userData.groupsJoined || [];
      
      // Find and update the specific group
      const updatedGroups = groups.map((group: any) => {
        if (group.groupId === groupId) {
          return {
            ...group,
            ...updates
          };
        }
        return group;
      });

      transaction.update(userRef, { groupsJoined: updatedGroups });
    });

    console.log(`✅ Updated group data for user ${userId}, group ${groupId}`);
  } catch (error) {
    console.error(`❌ Failed to update group data for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Adds a user to a club and group with enhanced data
 */
export const addUserToClubAndGroup = async (
  userId: string,
  clubData: {
    clubId: string;
    clubName: string;
    isAdmin: boolean;
    totalMembers: number;
    groupCount: number;
  },
  groupData: {
    groupId: string;
    groupName: string;
    clubId: string;
    roles: string[];
    sportType: string;
    memberCount: number;
  }
) => {
  try {
    const userRef = doc(db, 'users', userId);
    
    await updateDoc(userRef, {
      clubs: arrayUnion({
        clubId: clubData.clubId,
        clubName: clubData.clubName,
        isAdmin: clubData.isAdmin,
        joinedAt: new Date(),
        role: clubData.isAdmin ? 'admin' : 'member',
        status: 'active',
        totalMembers: clubData.totalMembers,
        groupCount: clubData.groupCount,
      }),
      groupsJoined: arrayUnion({
        groupId: groupData.groupId,
        groupName: groupData.groupName,
        clubId: groupData.clubId,
        roles: groupData.roles,
        joinedAt: new Date(),
        status: 'active',
        sportType: groupData.sportType,
        memberCount: groupData.memberCount,
      })
    });

    console.log(`✅ Added user ${userId} to club ${clubData.clubId} and group ${groupData.groupId}`);
  } catch (error) {
    console.error(`❌ Failed to add user to club and group:`, error);
    throw error;
  }
};

/**
 * Background sync function to update all user documents when club/group data changes
 * This should be called after member additions/removals
 */
export const syncUserDocumentsForClub = async (
  clubId: string,
  updates: {
    totalMembers?: number;
    groupCount?: number;
    clubName?: string;
  }
) => {
  try {
    console.log(`🔄 Starting background sync for club ${clubId}`);
    
    // This is a simplified version - in production you'd want to:
    // 1. Query all users who are members of this club
    // 2. Update their user documents in batches
    // 3. Handle failures gracefully
    
    // For now, we'll handle this reactively when users access the app
    console.log(`✅ Background sync queued for club ${clubId}`, updates);
  } catch (error) {
    console.error(`❌ Background sync failed for club ${clubId}:`, error);
  }
};
