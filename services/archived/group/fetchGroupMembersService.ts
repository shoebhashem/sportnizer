import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { AllMembersDocument, GroupMemberData } from '../types/group';

/**
 * Service to fetch group members from the single allMembers document
 */
export const fetchGroupMembers = async (
  clubId: string,
  groupId: string
): Promise<GroupMemberData[]> => {
  try {
    const db = getFirestore();
    
    // Fetch members from clubs/{clubId}/groups/{groupId}/allMembers/members (single document)
    const membersDoc = await getDoc(
      doc(db, 'clubs', clubId, 'groups', groupId, 'allMembers', 'members')
    );
    
    // Handle case where document doesn't exist
    if (!membersDoc.exists()) {
      console.log(`No allMembers document found for group ${groupId}`);
      return [];
    }
    
    const membersData = membersDoc.data() as AllMembersDocument;
    
    // Process all members with async operations to get up-to-date names
    const memberPromises = membersData.members.map(async (member) => {
      // Fetch the user's current profile to get up-to-date name
      let currentName = member.name || '';
      try {
        const userProfileDoc = await getDoc(doc(db, 'users', member.userId));
        if (userProfileDoc.exists()) {
          const userProfileData = userProfileDoc.data();
          // Prioritize displayName, then name, then fall back to stored name
          currentName = userProfileData.displayName || userProfileData.name || member.name || '';
        }
      } catch {
        console.log(`Could not fetch profile for user ${member.userId}, using stored name`);
        currentName = member.name || '';
      }
      
      // Return updated member data
      return {
        ...member,
        name: currentName
      };
    });

    const updatedMembers = await Promise.all(memberPromises);
    
    return updatedMembers;
  } catch (error) {
    console.error('Error fetching group members:', error);
    // Return empty array instead of throwing error to gracefully handle missing document
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
  role: "club-admin" | "admin" | "coach" | "player" | "guardian"
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
