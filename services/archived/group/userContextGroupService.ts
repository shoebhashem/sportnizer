import { ClubMembership, GroupMembership } from '../contexts/UserContext';

export interface ClubWithGroupsFromContext {
  id: string;
  name: string;
  isUserAdmin: boolean;
  groups: GroupWithDetailsFromContext[];
  totalMembers: number;
  userJoinedAt: Date;
}

export interface GroupWithDetailsFromContext {
  id: string;
  name: string;
  sportType: string;
  clubId: string;
  clubName: string;
  membersCount: number;
  userRoles: string[];
  joinedAt: Date;
  status: string;
}

/**
 * Efficiently gets clubs and groups data from UserContext
 * This replaces the Firestore-heavy userGroupService for better performance
 */
export const getUserClubsAndGroupsFromContext = (
  clubsJoined: ClubMembership[],
  groupsJoined: GroupMembership[]
): ClubWithGroupsFromContext[] => {
  console.log('🔍 getUserClubsAndGroupsFromContext called with:', {
    clubsJoined: clubsJoined?.length || 0,
    groupsJoined: groupsJoined?.length || 0,
    clubsData: clubsJoined,
    groupsData: groupsJoined
  });

  if (!clubsJoined || clubsJoined.length === 0) {
    console.log('❌ No clubs joined, returning empty array');
    return [];
  }

  const clubsWithGroups: ClubWithGroupsFromContext[] = [];

  // Process each club the user is a member of
  for (const clubMembership of clubsJoined.filter(c => c.status === 'active')) {
    console.log('🏢 Processing club:', clubMembership);
    
    // Get all groups for this club from user's group memberships
    const clubGroups = groupsJoined
      .filter(g => g.clubId === clubMembership.clubId && g.status === 'active')
      .map(groupMembership => {
        console.log('🎯 Processing group:', groupMembership);
        return {
          id: groupMembership.groupId,
          name: groupMembership.groupName || 'Unknown Group',
          sportType: groupMembership.sportType || 'Unknown Sport',
          clubId: clubMembership.clubId,
          clubName: clubMembership.clubName,
          membersCount: groupMembership.memberCount || 0,
          userRoles: groupMembership.roles,
          joinedAt: groupMembership.joinedAt,
          status: groupMembership.status,
        };
      });

    console.log('🎯 Club groups found:', clubGroups.length, clubGroups);

    const clubResult = {
      id: clubMembership.clubId,
      name: clubMembership.clubName,
      isUserAdmin: clubMembership.isAdmin,
      groups: clubGroups,
      totalMembers: clubMembership.totalMembers || 0,
      userJoinedAt: clubMembership.joinedAt,
    };

    console.log('🏢 Final club result:', clubResult);
    clubsWithGroups.push(clubResult);
  }

  console.log('✅ Final clubs with groups:', clubsWithGroups);
  return clubsWithGroups;
};

/**
 * Helper function to get user's admin clubs for create group modal
 */
export const getUserAdminClubsFromContext = (
  clubsJoined: ClubMembership[]
): { id: string; name: string; isAdmin: boolean }[] => {
  return clubsJoined
    .filter(club => club.status === 'active' && club.isAdmin)
    .map(club => ({
      id: club.clubId,
      name: club.clubName,
      isAdmin: true,
    }));
};
