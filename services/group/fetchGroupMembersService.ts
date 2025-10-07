import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore';
import { GroupMemberData } from '../types/group';

/**
 * Service to fetch group members from the allMembers subcollection
 */
export const fetchGroupMembers = async (
  clubId: string,
  groupId: string
): Promise<GroupMemberData[]> => {
  try {
    const db = getFirestore();
    
    // Fetch members from clubs/{clubId}/groups/{groupId}/allMembers
    const membersSnapshot = await getDocs(
      collection(db, 'clubs', clubId, 'groups', groupId, 'allMembers')
    );
    
    // Handle case where subcollection doesn't exist (empty snapshot)
    if (membersSnapshot.empty) {
      console.log(`No members found in allMembers subcollection for group ${groupId}`);
      return [];
    }
    
    // Process all members with async operations
    const memberPromises = membersSnapshot.docs.map(async (memberDoc) => {
      const data = memberDoc.data();
      
      // Fetch the user's current profile to get up-to-date name
      let currentName = data.name || '';
      try {
        const userProfileDoc = await getDoc(doc(db, 'users', memberDoc.id));
        if (userProfileDoc.exists()) {
          const userProfileData = userProfileDoc.data();
          // Prioritize displayName, then name, then fall back to stored name
          currentName = userProfileData.displayName || userProfileData.name || data.displayName || data.name || '';
        }
      } catch {
        console.log(`Could not fetch profile for user ${memberDoc.id}, using stored name`);
        currentName = data.name || '';
      }
      
      const member: GroupMemberData = {
        userId: memberDoc.id,
        roles: data.roles || ['member'],
        joinedAt: data.joinedAt,
        photoURL: data.photoURL || '',
        name: currentName,
        email: data.email || '',
        needsGuardian: data.needsGuardian || false,
        belongtoSubGroups: data.belongtoSubGroups || []
      };
      
      return member;
    });

    const membersData = await Promise.all(memberPromises);
    
    return membersData;
  } catch (error) {
    console.error('Error fetching group members:', error);
    // Return empty array instead of throwing error to gracefully handle missing subcollection
    return [];
  }
};

/**
 * Get member count for a group
 */
export const getGroupMemberCount = async (
  clubId: string,
  groupId: string
): Promise<number> => {
  try {
    const members = await fetchGroupMembers(clubId, groupId);
    return members.length;
  } catch (error) {
    console.error('Error getting member count:', error);
    return 0;
  }
};

/**
 * Check if user has specific role in the group
 */
export const checkUserRoleInGroup = async (
  clubId: string,
  groupId: string,
  userId: string,
  role: string
): Promise<boolean> => {
  try {
    const members = await fetchGroupMembers(clubId, groupId);
    const member = members.find(m => m.userId === userId);
    return member ? member.roles.includes(role) : false;
  } catch (error) {
    console.error('Error checking user role:', error);
    return false;
  }
};
