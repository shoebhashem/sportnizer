import {
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    query,
    where
} from 'firebase/firestore';
import { getCurrentUser } from '../auth/authService';
import { ClubMembership, GroupMembership } from '../types';

const db = getFirestore();

// Extended interfaces for service-specific needs
export interface UserClubMembership extends ClubMembership {
  clubName?: string;
  status?: 'active' | 'inactive';
}

export interface UserGroupMembership extends GroupMembership {
  groupName?: string;
  clubId: string;
  status?: 'active' | 'inactive';
}

export interface ServiceGroupWithDetails {
  id: string;
  name: string;
  sportType: string;
  clubId: string;
  clubName: string;
  memberCount: number;
  userRoles: string[];
  createdBy: string;
  createdAt: Date;
  isActive: boolean;
}

export interface ServiceClubWithGroups {
  id: string;
  name: string;
  isUserAdmin: boolean;
  groups: ServiceGroupWithDetails[];
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
  data?: ServiceClubWithGroups[];
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
    const clubsJoined: UserClubMembership[] = userData.clubsJoined || [];
    const groupsJoined: UserGroupMembership[] = userData.groupsJoined || [];

    if (clubsJoined.length === 0) {
      // User is not a member of any clubs
      return { success: true, data: [] };
    }

    const clubsWithGroups: ServiceClubWithGroups[] = [];

    // Process each club the user is a member of
    for (const clubMembership of clubsJoined.filter(c => c.status !== 'inactive')) {
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

        // Update club name in case it's missing from user profile
        const clubName = clubData.name || clubMembership.clubName || 'Unknown Club';

        let accessibleGroups: ServiceGroupWithDetails[] = [];

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
              memberCount: membersSnapshot.size,
              userRoles: userRoles,
              createdBy: groupData.createdBy,
              createdAt: groupData.createdAt?.toDate() || new Date(),
              isActive: groupData.isActive
            });
          }
        } else {
          // Regular member - can only see groups they're specifically added to
          for (const groupMembership of groupsJoined.filter(g => 
            g.clubId === clubMembership.clubId && g.status !== 'inactive'
          )) {
            try {
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
                  memberCount: membersSnapshot.size,
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
  data?: ServiceGroupWithDetails;
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
    const clubsJoined: UserClubMembership[] = userData.clubsJoined || [];
    const groupsJoined: UserGroupMembership[] = userData.groupsJoined || [];

    // Check if user is admin of the club or member of the group
    const clubMembership = clubsJoined.find(c => c.clubId === clubId && c.status !== 'inactive');
    const groupMembership = groupsJoined.find(g => g.groupId === groupId && g.status !== 'inactive');

    if (!clubMembership && !groupMembership) {
      return { success: false, error: 'Access denied - user is not a member of this club or group' };
    }

    // If user is club admin, they have access to all groups
    // If user is group member, they have access to that specific group
    const hasAccess = clubMembership?.isAdmin || groupMembership;

    if (!hasAccess) {
      return { success: false, error: 'Access denied - insufficient permissions' };
    }

    // Get group details
    const groupRef = doc(db, 'clubs', clubId, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      return { success: false, error: 'Group not found' };
    }

    const groupData = groupDoc.data();

    // Get club name
    const clubRef = doc(db, 'clubs', clubId);
    const clubDoc = await getDoc(clubRef);
    const clubName = clubDoc.exists() ? clubDoc.data().name : 'Unknown Club';

    // Get member count
    const membersSnapshot = await getDocs(
      collection(db, 'clubs', clubId, 'groups', groupId, 'members')
    );

    // Get user's roles in this group
    const userRoles = groupMembership?.roles || [];

    const groupDetails: ServiceGroupWithDetails = {
      id: groupId,
      name: groupData.name,
      sportType: groupData.sportType,
      clubId: clubId,
      clubName: clubName,
      memberCount: membersSnapshot.size,
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


