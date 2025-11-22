import { ClubMembershipRef, GroupMembershipRef } from '@/contexts/UserContext';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore
} from 'firebase/firestore';
import { getCurrentUser } from './authService';

const db = getFirestore();

// Interfaces for fetched data with complete information
export interface GroupWithDetails {
  id: string;
  name: string;
  sportType: string;
  clubId: string;
  clubName: string;
  createdBy: string;
  createdAt: Date;
  isActive: boolean;
  userRoles: string[];
  membersCount?: number;
}

export interface ClubWithGroups {
  id: string;
  name: string;
  description?: string;
  location?: string;
  isUserAdmin: boolean;
  userRole: 'admin' | 'member';
  userJoinedAt: Date;
  groups: GroupWithDetails[];
  totalMembers?: number;
}

/**
 * Fetches clubs and groups using the new ID-only user structure
 * This replaces the old caching approach with on-demand fetching
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

    // Get user profile with club and group memberships
    const userRef = doc(db, 'users', currentUser.uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return { success: false, error: 'User profile not found' };
    }

    const userData = userDoc.data();
    
    // Debug: Check what fields exist in user document
    console.log('🔍 User document fields:', Object.keys(userData));
    console.log('🔍 clubMemberships:', userData.clubMemberships);
    console.log('🔍 groupMemberships:', userData.groupMemberships);
    console.log('🔍 OLD clubs field:', userData.clubs);
    console.log('🔍 OLD groupsJoined field:', userData.groupsJoined);
    
    const clubMemberships: ClubMembershipRef[] = userData.clubMemberships || [];
    const groupMemberships: GroupMembershipRef[] = userData.groupMemberships || [];

    if (clubMemberships.length === 0) {
      console.log('📝 User has no club memberships');
      
      // Check if user has old format data
      if (userData.clubs && userData.clubs.length > 0) {
        console.log('⚠️ Found old format data! User has clubs in old format but new service expects new format');
        return { success: false, error: 'Data migration needed - old format detected' };
      }
      
      return { success: true, data: [] };
    }

    const clubsWithGroups: ClubWithGroups[] = [];

    // Process each club membership
    for (const clubMembership of clubMemberships.filter(c => c.status === 'active')) {
      try {
        // Fetch club details
        const clubRef = doc(db, 'clubs', clubMembership.clubId);
        const clubDoc = await getDoc(clubRef);
        
        if (!clubDoc.exists()) {
          console.warn(`Club ${clubMembership.clubId} not found`);
          continue;
        }

        const clubData = clubDoc.data();
        
        // Get user's group memberships for this club
        const userGroupsInClub = groupMemberships.filter(
          g => g.clubId === clubMembership.clubId && g.status === 'active'
        );

        const groups: GroupWithDetails[] = [];

        // If user is admin, fetch ALL groups in the club
        if (clubMembership.isAdmin) {
          const groupsSnapshot = await getDocs(
            collection(db, 'clubs', clubMembership.clubId, 'groups')
          );
          
          for (const groupDoc of groupsSnapshot.docs) {
            const groupData = groupDoc.data();
            
            // Find user's roles in this group (if any)
            const userGroupMembership = userGroupsInClub.find(g => g.groupId === groupDoc.id);
            const userRoles = userGroupMembership?.roles || [];

            groups.push({
              id: groupDoc.id,
              name: groupData.name,
              sportType: groupData.sportType,
              clubId: clubMembership.clubId,
              clubName: clubData.name,
              createdBy: groupData.createdBy,
              createdAt: groupData.createdAt?.toDate() || new Date(),
              isActive: groupData.isActive || true,
              userRoles: userRoles,
              membersCount: (groupData.memberIds || []).length,
            });
          }
        } else {
          // If not admin, only fetch groups user is a member of
          for (const userGroup of userGroupsInClub) {
            const groupRef = doc(db, 'clubs', clubMembership.clubId, 'groups', userGroup.groupId);
            const groupDoc = await getDoc(groupRef);
            
            if (groupDoc.exists()) {
              const groupData = groupDoc.data();
              
              groups.push({
                id: groupDoc.id,
                name: groupData.name,
                sportType: groupData.sportType,
                clubId: clubMembership.clubId,
                clubName: clubData.name,
                createdBy: groupData.createdBy,
                createdAt: groupData.createdAt?.toDate() || new Date(),
                isActive: groupData.isActive || true,
                userRoles: userGroup.roles,
                membersCount: (groupData.memberIds || []).length,
              });
            }
          }
        }

        clubsWithGroups.push({
          id: clubMembership.clubId,
          name: clubData.name,
          description: clubData.description,
          location: clubData.location,
          isUserAdmin: clubMembership.isAdmin,
          userRole: clubMembership.role,
          userJoinedAt: clubMembership.joinedAt,
          groups: groups.sort((a, b) => a.name.localeCompare(b.name)),
          totalMembers: (clubData.memberIds || []).length,
        });

        console.log(`✅ Loaded club ${clubData.name} with ${groups.length} groups`);

      } catch (error) {
        console.error(`❌ Error loading club ${clubMembership.clubId}:`, error);
        continue;
      }
    }

    console.log(`🎉 Successfully loaded ${clubsWithGroups.length} clubs with groups`);
    return { success: true, data: clubsWithGroups };

  } catch (error) {
    console.error('❌ Error in getUserAccessibleClubsAndGroups:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

/**
 * Get specific group details by clubId and groupId
 */
export const getGroupDetails = async (
  clubId: string, 
  groupId: string
): Promise<{
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
    const clubMemberships: ClubMembershipRef[] = userData.clubMemberships || [];
    const groupMemberships: GroupMembershipRef[] = userData.groupMemberships || [];

    // Check if user is admin of the club or member of the group
    const clubMembership = clubMemberships.find(c => c.clubId === clubId && c.status === 'active');
    const groupMembership = groupMemberships.find(g => g.groupId === groupId && g.status === 'active');

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
    
    // Fetch club name
    const clubRef = doc(db, 'clubs', clubId);
    const clubDoc = await getDoc(clubRef);
    const clubName = clubDoc.exists() ? clubDoc.data().name : 'Unknown Club';

    const userRoles = groupMembership?.roles || [];

    const groupDetails: GroupWithDetails = {
      id: groupId,
      name: groupData.name,
      sportType: groupData.sportType,
      clubId: clubId,
      clubName: clubName,
      createdBy: groupData.createdBy,
      createdAt: groupData.createdAt?.toDate() || new Date(),
      isActive: groupData.isActive || true,
      userRoles: userRoles,
      membersCount: (groupData.memberIds || []).length,
    };

    return { success: true, data: groupDetails };

  } catch (error) {
    console.error('❌ Error in getGroupDetails:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};
