import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { UpdateSubGroupRequest, UpdateSubGroupResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Update subgroup details (name, description, color)
 * 
 * Architecture: Updates /clubs/{clubId}/groups/{groupId}/subgroups/{subgroupId}
 * Permissions: admin, coach, group creator, or club admin
 * 
 * Benefits over old approach:
 * - Renaming doesn't require updating all member documents
 * - Can update metadata without touching member data
 */
export const updateSubGroup = onCall(
  {
    region: config.region,
  },
  async (request): Promise<UpdateSubGroupResponse> => {
    try {
      const { uid, clubId, groupId, subGroupId, name, description, color } = request.data as UpdateSubGroupRequest;

      // Validate required fields
      validateRequiredFields(request.data, ['uid', 'clubId', 'groupId', 'subGroupId']);

      // Verify user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Must have at least one field to update
      if (!name && description === undefined && color === undefined) {
        return {
          success: false,
          error: 'At least one field must be provided to update'
        };
      }

      const db = admin.firestore();

      // Verify subgroup exists
      const subgroupRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId)
        .collection('subgroups')
        .doc(subGroupId);

      const subgroupDoc = await subgroupRef.get();
      
      if (!subgroupDoc.exists) {
        throw new HttpsError('not-found', 'Subgroup not found');
      }

      // Verify group exists and check permissions
      const groupRef = db.collection('clubs').doc(clubId).collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();
      
      if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Group not found');
      }

      const groupData = groupDoc.data();

      // Check user permissions
      const groupMembersDoc = await db
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId)
        .collection('allMembers')
        .doc('members')
        .get();

      const clubMembersDoc = await db
        .collection('clubs')
        .doc(clubId)
        .collection('allMembers')
        .doc('members')
        .get();

      const isGroupCreator = groupData?.createdBy === uid;
      
      // Check group membership and roles
      let isGroupAdminOrCoach = false;
      if (groupMembersDoc.exists) {
        const groupMembers = groupMembersDoc.data()?.members || [];
        const userGroupMembership = groupMembers.find((member: any) => member.userId === uid);
        const userRoles = userGroupMembership?.roles || [];
        isGroupAdminOrCoach = userRoles.includes('admin') || userRoles.includes('coach');
      }

      // Check club admin
      let isClubAdmin = false;
      if (clubMembersDoc.exists) {
        const clubMembers = clubMembersDoc.data()?.members || [];
        const userClubMembership = clubMembers.find((member: any) => member.userId === uid);
        isClubAdmin = userClubMembership?.roles?.includes('club-admin') || false;
      }

      if (!isGroupCreator && !isGroupAdminOrCoach && !isClubAdmin) {
        throw new HttpsError(
          'permission-denied',
          'You do not have permission to update subgroups in this group'
        );
      }

      // If updating name, check for duplicates
      if (name) {
        const trimmedName = name.trim();
        
        if (trimmedName.length < 2) {
          return {
            success: false,
            error: 'Subgroup name must be at least 2 characters long'
          };
        }

        if (trimmedName.length > 50) {
          return {
            success: false,
            error: 'Subgroup name cannot exceed 50 characters'
          };
        }

        // Check if another subgroup has this name
        const existingSubgroupsQuery = await db
          .collection('clubs')
          .doc(clubId)
          .collection('groups')
          .doc(groupId)
          .collection('subgroups')
          .get();

        const nameExists = existingSubgroupsQuery.docs.some(doc => 
          doc.id !== subGroupId && // Exclude current subgroup
          doc.data().name.toLowerCase() === trimmedName.toLowerCase()
        );

        if (nameExists) {
          return {
            success: false,
            error: 'A subgroup with this name already exists'
          };
        }
      }

      // Build update object
      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (name) {
        updateData.name = name.trim();
      }
      
      if (description !== undefined) {
        updateData.description = description;
      }
      
      if (color !== undefined) {
        updateData.color = color;
      }

      // Update subgroup document
      await subgroupRef.update(updateData);

      // If name was updated, update the group's subGroups array
      if (name) {
        const oldSubgroupData = subgroupDoc.data();
        const oldName = oldSubgroupData?.name;
        
        if (oldName && oldName !== name.trim()) {
          // Remove old entry and add new one in a batch
          const batch = db.batch();
          
          batch.update(groupRef, {
            subGroups: admin.firestore.FieldValue.arrayRemove({
              id: subGroupId,
              name: oldName
            })
          });
          
          batch.update(groupRef, {
            subGroups: admin.firestore.FieldValue.arrayUnion({
              id: subGroupId,
              name: name.trim()
            }),
            lastModifiedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          await batch.commit();
        }
      }

      console.log(`✅ Subgroup updated: ${subGroupId} in group ${groupId}`);

      return {
        success: true,
        message: 'Subgroup updated successfully'
      };

    } catch (error) {
      console.error('❌ Error updating subgroup:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        `Failed to update subgroup: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);
