import {
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    query,
    where
} from 'firebase/firestore';
import { getCurrentUser } from './authService';

const db = getFirestore();

export interface ClubMembership {
  clubId: string;
  clubName: string;
  isAdmin: boolean;
  joinedAt: Date;
  status: 'active' | 'inactive';
}

export interface GroupMembership {
  groupId: string;
  groupName: string;
  clubId: string;
  roles: ('admin' | 'coach' | 'member' | 'guardian')[];
  joinedAt: Date;
  status: 'active' | 'inactive';
}

export interface GroupWithDetails {
  id: string;
  name: string;
  sportType: string;
  clubId: string;
  clubName: string;
  membersCount: number;
  userRoles: ('admin' | 'coach' | 'member' | 'guardian')[];
  createdBy: string;
  createdAt: Date;
  isActive: boolean;
}

export interface ClubWithGroups {
  id: string;
  name: string;
  isUserAdmin: boolean;
  groups: GroupWithDetails[];
  totalMembers: number;
  userJoinedAt: Date;
}

/**
 * Efficiently fetches clubs and groups that the user has access to
 * Uses UserContext data to minimize database queries
 * Respects Firestore security rules for permission-based access
 */
export const getUserAccessibleClubsAndGroups = async (): Promise<{
  success: boolean;
  data?: ClubWithGroups[];
  error?: string;
}> => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'No authenticated user' };
    }

    // Get user profile with clubs and groups joined
    const userRef = doc(db, 'users', currentUser.uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return { success: false, error: 'User profile not found' };
    }

    const userData = userDoc.data();
    // Handle backward compatibility: use 'clubsJoined' if available, otherwise 'clubs'
    const rawClubsData = userData.clubsJoined || userData.clubs || [];
    const clubsJoined: ClubMembership[] = rawClubsData.map((club: any) => ({
      clubId: club.clubId,
      clubName: '', // Will be populated from club document
      isAdmin: club.isAdmin || false,
      joinedAt: club.joinedAt?.toDate ? club.joinedAt.toDate() : new Date(club.joinedAt),
      status: club.status || 'active',
    }));
    
    const groupsJoined: GroupMembership[] = (userData.groupsJoined || []).map((group: any) => ({
      groupId: group.groupId,
      groupName: group.groupName,
      clubId: group.clubId,
      roles: group.roles || [],
      joinedAt: group.joinedAt?.toDate ? group.joinedAt.toDate() : new Date(group.joinedAt),
      status: group.status || 'active',
    }));

    if (clubsJoined.length === 0) {
      // User is not a member of any clubs
      return { success: true, data: [] };
    }

    const clubsWithGroups: ClubWithGroups[] = [];

    // Process each club the user is a member of
    for (const clubMembership of clubsJoined.filter(c => c.status === 'active')) {
      try {
        // Get club details
        const clubRef = doc(db, 'clubs', clubMembership.clubId);
        const clubDoc = await getDoc(clubRef);
        
        if (!clubDoc.exists()) {
          console.warn(`Club ${clubMembership.clubId} not found`);
          continue;
        }

        const clubData = clubDoc.data();
        const isUserClubAdmin = clubMembership.isAdmin;
        
        // Get club name from the club document (Firestore field is 'name', not 'clubName')
        const clubName = clubData.name || 'Unknown Club';

        let accessibleGroups: GroupWithDetails[] = [];

        if (isUserClubAdmin) {
          // Club admin can see ALL groups in the club
          const groupsQuery = query(
            collection(db, 'clubs', clubMembership.clubId, 'groups'),
            where('isActive', '==', true)
          );
          
          const groupsSnapshot = await getDocs(groupsQuery);
          
          for (const groupDocSnapshot of groupsSnapshot.docs) {
            const groupData = groupDocSnapshot.data();
            
            // Get member count for this group
            const membersSnapshot = await getDocs(
              collection(db, 'clubs', clubMembership.clubId, 'groups', groupDocSnapshot.id, 'members')
            );
            
            // Check if user has specific roles in this group
            const userGroupMembership = groupsJoined.find(g => g.groupId === groupDocSnapshot.id);
            const userRoles = userGroupMembership?.roles || [];

            accessibleGroups.push({
              id: groupDocSnapshot.id,
              name: groupData.name,
              sportType: groupData.sportType,
              clubId: clubMembership.clubId,
              clubName: clubName,
              membersCount: membersSnapshot.size,
              userRoles: userRoles,
              createdBy: groupData.createdBy,
              createdAt: groupData.createdAt?.toDate() || new Date(),
              isActive: groupData.isActive
            });
          }
        } else {
          // Non-admin users can only see groups they're members of
          const userGroupsInThisClub = groupsJoined.filter(g => 
            g.clubId === clubMembership.clubId && g.status === 'active'
          );

          for (const groupMembership of userGroupsInThisClub) {
            try {
              // Fetch only the groups the user is a member of
              const groupRef = doc(db, 'clubs', clubMembership.clubId, 'groups', groupMembership.groupId);
              const groupDoc = await getDoc(groupRef);
              
              if (groupDoc.exists()) {
                const groupData = groupDoc.data();
                
                // Get member count for this group
                const membersSnapshot = await getDocs(
                  collection(db, 'clubs', clubMembership.clubId, 'groups', groupMembership.groupId, 'members')
                );

                accessibleGroups.push({
                  id: groupMembership.groupId,
                  name: groupData.name,
                  sportType: groupData.sportType,
                  clubId: clubMembership.clubId,
                  clubName: clubName,
                  membersCount: membersSnapshot.size,
                  userRoles: groupMembership.roles,
                  createdBy: groupData.createdBy,
                  createdAt: groupData.createdAt?.toDate() || new Date(),
                  isActive: groupData.isActive
                });
              }
            } catch (error) {
              console.warn(`Error fetching group ${groupMembership.groupId}:`, error);
              // Continue with other groups - this might be a permission issue
            }
          }
        }

        // Calculate total members in the club (this might need optimization)
        let totalMembers = 0;
        try {
          // For now, use the adminIds and memberIds from club document
          totalMembers = (clubData.memberIds || []).length;
        } catch (error) {
          console.warn(`Error calculating total members for club ${clubMembership.clubId}:`, error);
        }

        clubsWithGroups.push({
          id: clubMembership.clubId,
          name: clubName,
          isUserAdmin: isUserClubAdmin,
          groups: accessibleGroups,
          totalMembers: totalMembers,
          userJoinedAt: clubMembership.joinedAt
        });

      } catch (error) {
        console.error(`Error processing club ${clubMembership.clubId}:`, error);
        // Continue with other clubs
      }
    }

    return { success: true, data: clubsWithGroups };

  } catch (error: any) {
    console.error('Error fetching user accessible clubs and groups:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to fetch clubs and groups' 
    };
  }
};

/**
 * Get detailed information about a specific group
 * Respects user permissions - only returns data if user has access
 */
export const getGroupDetails = async (clubId: string, groupId: string): Promise<{
  success: boolean;
  data?: GroupWithDetails;
  error?: string;
}> => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'No authenticated user' };
    }

    // Check if user has access to this group
    const userRef = doc(db, 'users', currentUser.uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return { success: false, error: 'User profile not found' };
    }

    const userData = userDoc.data();
    const clubsJoined: ClubMembership[] = userData.clubsJoined || [];
    const groupsJoined: GroupMembership[] = userData.groupsJoined || [];

    // Check if user is admin of the club or member of the group
    const clubMembership = clubsJoined.find(c => c.clubId === clubId && c.status === 'active');
    const groupMembership = groupsJoined.find(g => g.groupId === groupId && g.status === 'active');

    if (!clubMembership && !groupMembership) {
      return { success: false, error: 'Access denied - not a member of club or group' };
    }

    const isClubAdmin = clubMembership?.isAdmin || false;
    
    // If not club admin, must be group member
    if (!isClubAdmin && !groupMembership) {
      return { success: false, error: 'Access denied - not authorized to view this group' };
    }

    // Fetch group details
    const groupRef = doc(db, 'clubs', clubId, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      return { success: false, error: 'Group not found' };
    }

    const groupData = groupDoc.data();
    
    // Get member count
    const membersSnapshot = await getDocs(
      collection(db, 'clubs', clubId, 'groups', groupId, 'members')
    );

    const userRoles = groupMembership?.roles || [];

    const groupDetails: GroupWithDetails = {
      id: groupId,
      name: groupData.name,
      sportType: groupData.sportType,
      clubId: clubId,
      clubName: clubMembership?.clubName || 'Unknown Club',
      membersCount: membersSnapshot.size,
      userRoles: userRoles,
      createdBy: groupData.createdBy,
      createdAt: groupData.createdAt?.toDate() || new Date(),
      isActive: groupData.isActive
    };

    return { success: true, data: groupDetails };

  } catch (error: any) {
    console.error('Error fetching group details:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to fetch group details' 
    };
  }
};
