// /services/orchestration/createNewGroupInExistingClub.ts
// Orchestrating service that coordinates multiple atomic Firebase Functions
// Creates group in existing club → adds creator as group member → updates user document
//
// IMPORTANT: This service interface is flexible and exactly matches the atomic Firebase Functions.
// groupData can contain any fields that the atomic function supports.
// Required fields: clubId, groupData.name. All other fields are optional.
// NOTE: sport field is at GROUP level to support multi-sport clubs.

import { httpsCallable } from 'firebase/functions';
import { functions } from '../core/firebase';
import { isUserClubAdmin } from '../fetchUserAccess';
import type { GroupAccess } from '../types';

// Response type for atomic functions
interface AtomicFunctionResponse {
  success: boolean;
  error?: string;
  groupId?: string;
}

// Atomic Firebase Function references  
const createGroupFn = httpsCallable<any, AtomicFunctionResponse>(functions, 'createGroup');
const addMemberToGroupFn = httpsCallable<any, AtomicFunctionResponse>(functions, 'addMemberToGroup');
const updateUserGroupInfoFn = httpsCallable<any, AtomicFunctionResponse>(functions, 'updateUserGroupInfo');

// Input interfaces - flexible and aligned with atomic Firebase Functions
export interface CreateNewGroupInExistingClubInput {
  // Club ID (existing club)
  clubId: string;
  // Group data - matches exactly what createGroup atomic function expects  
  groupData: {
    name: string;                    // Required by createGroup
    description?: string;            // Optional
    sport?: string;                  // Optional - sport type for this group
  };
  // User information for membership creation
  userId: string;
  userDisplayName: string;
  userEmail: string;
  userPhotoURL?: string;
}

// Response interface
export interface CreateNewGroupInExistingClubResponse {
  success: boolean;
  groupId?: string;
  error?: string;
}

/**
 * Orchestrating service to create a new group in an existing club and add creator as admin
 * 
 * This service coordinates multiple atomic Firebase Functions:
 * 1. Permission check - Verify user is club admin using fetchUserAccess
 * 2. createGroup - Creates the group document within existing club with flexible groupData
 * 3. addMemberToGroup - Adds creator as group member with admin role
 * 4. updateUserGroupInfo - Updates user's groupAccess array within existing club access
 * 
 * @param input - Club ID, flexible group data, and user information (matches atomic function interfaces)
 * @returns Promise with success status and created group ID or error
 * 
 * @example
 * // Minimal usage (only required fields)
 * const result = await createNewGroupInExistingClub({
 *   clubId: "club123",
 *   groupData: { name: "Under 18 Team" },
 *   userId: "user123",
 *   userDisplayName: "John Smith",
 *   userEmail: "john@example.com"
 * });
 * 
 * @example  
 * // Full usage with optional fields
 * const result = await createNewGroupInExistingClub({
 *   clubId: "club123",
 *   groupData: {
 *     name: "Under 18 Team", 
 *     description: "Youth development squad",
 *     sport: "Football"
 *   },
 *   userId: "user123",
 *   userDisplayName: "John Smith",
 *   userEmail: "john@example.com",
 *   userPhotoURL: "https://example.com/photo.jpg"
 * });
 */
export const createNewGroupInExistingClub = async (
  input: CreateNewGroupInExistingClubInput
): Promise<CreateNewGroupInExistingClubResponse> => {
  const { clubId, groupData, userId, userDisplayName, userEmail, userPhotoURL } = input;

  try {
    console.log('🏗️ Starting createNewGroupInExistingClub orchestration...');
    console.log(`📍 Club ID: ${clubId}, Group: ${groupData.name}, User: ${userId}`);

    // Step 1: Permission check - Verify user is club admin
    console.log('1️⃣ Checking user permissions...');
    const hasAdminAccess = await isUserClubAdmin(userId, clubId);
    
    if (!hasAdminAccess) {
      throw new Error('Permission denied: Only club admins can create groups');
    }

    console.log('✅ User has club admin permissions');

    // Step 2: Create group within existing club (atomic operation)
    console.log('2️⃣ Creating group within existing club...');
    const groupResult = await createGroupFn({
      clubId,
      groupData // Pass groupData as expected by atomic function
    });

    if (!groupResult.data.success || !groupResult.data.groupId) {
      throw new Error(`Group creation failed: ${groupResult.data.error || 'No group ID returned'}`);
    }

    const groupId = groupResult.data.groupId;
    console.log(`✅ Group created with ID: ${groupId}`);

    // Step 3: Add creator as group member with admin role (atomic operation)
    console.log('3️⃣ Adding creator as group admin...');
    const memberResult = await addMemberToGroupFn({
      clubId,
      groupId,
      memberData: {
        userId,
        roles: ['admin'],
        photoURL: userPhotoURL || '',
        name: userDisplayName,
        email: userEmail,
        addedBy: userId, // Self-added
        needsGuardian: false,
        guardiansContacts: []
      }
    });

    if (!memberResult.data.success) {
      throw new Error(`Group membership failed: ${memberResult.data.error}`);
    }

    console.log('✅ Creator added as group admin');

    // Step 4: Update user's group access within existing club access (atomic operation)
    console.log('4️⃣ Updating user group access within club...');
    const groupInfo: GroupAccess = {
      groupId,
      groupName: groupData.name,
      roles: ['admin'],
      joinedAt: new Date(),
      lastModifiedAt: new Date()
    };

    const userGroupResult = await updateUserGroupInfoFn({
      uid: userId,
      clubId,
      groupInfo,
      roles: ['admin'],
      operation: 'add'
    });

    if (!userGroupResult.data.success) {
      throw new Error(`User group info update failed: ${userGroupResult.data.error}`);
    }

    console.log('✅ User group access updated within existing club');

    console.log('🎉 createNewGroupInExistingClub orchestration completed successfully!');
    
    return {
      success: true,
      groupId
    };

  } catch (error: any) {
    console.error('❌ Error in createNewGroupInExistingClub orchestration:', error);

    // TODO: Implement rollback logic if needed
    // For now, we log the error and let atomic functions handle their own cleanup
    
    return {
      success: false,
      error: error.message || 'Failed to create group in existing club'
    };
  }
};

// Export as service object for consistency with other services
export const createNewGroupInExistingClubService = {
  execute: createNewGroupInExistingClub
};
