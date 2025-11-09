import { ClubMemberData, GroupMemberData, UserClubMembership, UserGroupMembership } from '../types/interfaces';

/**
 * Helper functions to convert invitation data to the new modular format
 */

export const createClubMemberData = (
  uid: string,
  userData: any,
  invitationData: any,
  roles: string[] = ['player']
): ClubMemberData => {
  const currentDate = new Date();
  
  return {
    userId: uid,
    roles: roles,
    photoURL: userData?.photoURL || '',
    name: userData?.displayName || userData?.email?.split('@')[0] || 'Unknown',
    email: userData?.email || '',
    addedBy: invitationData.inviterUid,
    joinedAt: currentDate,
    lastModifiedAt: currentDate,
    needsGuardian: userData?.needsGuardian || false,
    guardiansContacts: userData?.guardiansContacts || [],
  };
};

export const createGroupMemberData = (
  uid: string,
  userData: any,
  roles: string[] = ['player']
): GroupMemberData => {
  const currentDate = new Date();
  
  return {
    userId: uid,
    roles: roles,
    joinedAt: currentDate,
    photoURL: userData?.photoURL || '',
    name: userData?.displayName || userData?.email?.split('@')[0] || 'Unknown',
    email: userData?.email || '',
    needsGuardian: userData?.needsGuardian || false,
    belongsToSubGroups: userData?.belongsToSubGroups || [],
    guardiansContacts: userData?.guardiansContacts || [],
  };
};

export const createUserClubMembership = (
  invitationData: any,
  isAdmin: boolean = false
): UserClubMembership => {
  const currentDate = new Date();
  
  return {
    clubId: invitationData.clubId,
    clubName: invitationData.clubName,
    isAdmin: isAdmin,
    joinedAt: currentDate,
    lastModifiedAt: currentDate,
  };
};

export const createUserGroupMembership = (
  invitationData: any,
  roles: string[] = ['player']
): UserGroupMembership => {
  const currentDate = new Date();
  
  return {
    groupId: invitationData.groupId,
    groupName: invitationData.groupName,
    clubId: invitationData.clubId,
    roles: roles,
    joinedAt: currentDate,
    lastModifiedAt: currentDate,
  };
};
