import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';
import { CreateSubGroupRequest, CreateSubGroupResponse } from '../types/interfaces';

export const createSubGroup = onCall({
  region: 'europe-north1',
}, async (request): Promise<CreateSubGroupResponse> => {
  try {
    const { uid, clubId, groupId, subGroupName } = request.data as CreateSubGroupRequest;

    // Input validation
    if (!uid || !clubId || !groupId || !subGroupName) {
      return {
        success: false,
        error: 'Missing required parameters: uid, clubId, groupId, or subGroupName'
      };
    }

    if (typeof subGroupName !== 'string' || subGroupName.trim().length === 0) {
      return {
        success: false,
        error: 'Subgroup name must be a non-empty string'
      };
    }

    const trimmedSubGroupName = subGroupName.trim();
    
    if (trimmedSubGroupName.length < 2) {
      return {
        success: false,
        error: 'Subgroup name must be at least 2 characters long'
      };
    }

    if (trimmedSubGroupName.length > 50) {
      return {
        success: false,
        error: 'Subgroup name cannot exceed 50 characters'
      };
    }

    const db = admin.firestore();

    // Verify the group exists (groups are stored as subcollections under clubs)
    const groupDoc = await db.collection('clubs').doc(clubId).collection('groups').doc(groupId).get();
    if (!groupDoc.exists) {
      return {
        success: false,
        error: 'Group not found'
      };
    }

    const groupData = groupDoc.data();
    if (!groupData) {
      return {
        success: false,
        error: 'Group data not found'
      };
    }

    // Verify the club exists
    const clubDoc = await db.collection('clubs').doc(clubId).get();
    if (!clubDoc.exists) {
      return {
        success: false,
        error: 'Club not found'
      };
    }

    // Check user permissions
    // Check if user is club member and their role
    const clubMembersDoc = await db
      .collection('clubs')
      .doc(clubId)
      .collection('allMembers')
      .doc('members')
      .get();

    // Check if user is group member and their role  
    const groupMembersDoc = await db
      .collection('clubs')
      .doc(clubId)
      .collection('groups')
      .doc(groupId)
      .collection('allMembers')
      .doc('members')
      .get();

    const isClubCreator = groupData.createdBy === uid;
    
    // Check club membership
    let isClubAdmin = false;
    if (clubMembersDoc.exists) {
      const clubMembers = clubMembersDoc.data()?.members || [];
      const userClubMembership = clubMembers.find((member: any) => member.userId === uid);
      isClubAdmin = userClubMembership?.roles?.includes('club-admin') || false;
    }
    
    const isGroupCreator = groupData.createdBy === uid;
    
    // Check group membership  
    let isGroupAdminOrCoach = false;
    if (groupMembersDoc.exists) {
      const groupMembers = groupMembersDoc.data()?.members || [];
      const userGroupMembership = groupMembers.find((member: any) => member.userId === uid);
      isGroupAdminOrCoach = userGroupMembership?.roles?.some((role: string) => ['admin', 'coach'].includes(role)) || false;
    }

    if (!isClubCreator && !isClubAdmin && !isGroupCreator && !isGroupAdminOrCoach) {
      return {
        success: false,
        error: 'You do not have permission to create subgroups in this group'
      };
    }

    // Check if subgroup name already exists
    const currentSubGroups = groupData.subGroups || [];
    const subGroupExists = currentSubGroups.some((sg: string) => 
      sg.toLowerCase() === trimmedSubGroupName.toLowerCase()
    );

    if (subGroupExists) {
      return {
        success: false,
        error: 'A subgroup with this name already exists'
      };
    }

    // Add the new subgroup to the array
    const updatedSubGroups = [...currentSubGroups, trimmedSubGroupName];

    // Update the group document
    await db.collection('clubs').doc(clubId).collection('groups').doc(groupId).update({
      subGroups: updatedSubGroups,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: 'Subgroup created successfully',
      subGroupName: trimmedSubGroupName
    };

  } catch (error) {
    console.error('Error creating subgroup:', error);
    return {
      success: false,
      error: 'Failed to create subgroup'
    };
  }
});
