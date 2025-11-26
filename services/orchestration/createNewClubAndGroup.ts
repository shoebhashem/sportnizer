// /services/orchestration/createNewClubAndGroup.ts
// Orchestrating service that coordinates multiple atomic Firebase Functions
// Creates club → creates group → adds creator as club member → updates user document
//
// IMPORTANT: This service interface is flexible and exactly matches the atomic Firebase Functions.
// clubData and groupData can contain any fields that the atomic functions support.
// Required fields: clubData.name, groupData.name. All other fields are optional.
// NOTE: sport field is at GROUP level (not club level) to support multi-sport clubs.

import { httpsCallable } from 'firebase/functions';
import { functions } from '../core/firebase';
import type { ClubAccess, GroupAccess } from '../types';

// Response type for atomic functions
interface AtomicFunctionResponse {
  success: boolean;
  error?: string;
  clubId?: string;
  groupId?: string;
}

// Atomic Firebase Function references  
const createClubFn = httpsCallable<any, AtomicFunctionResponse>(functions, 'createClub');
const createGroupFn = httpsCallable<any, AtomicFunctionResponse>(functions, 'createGroup');
const addMemberToClubFn = httpsCallable<any, AtomicFunctionResponse>(functions, 'addMemberToClub');
const updateUserClubInfoFn = httpsCallable<any, AtomicFunctionResponse>(functions, 'updateUserClubInfo');
const updateUserGroupInfoFn = httpsCallable<any, AtomicFunctionResponse>(functions, 'updateUserGroupInfo');

// Input interfaces - flexible and aligned with atomic Firebase Functions
export interface CreateNewClubAndGroupInput {
  // Club data - matches exactly what createClub atomic function expects
  clubData: {
    name: string;                    // Required by createClub
    description?: string;            // Optional
    location?: string;               // Optional
  };
  // Group data - matches exactly what createGroup atomic function expects  
  groupData: {
    name: string;                    // Required by createGroup
    description?: string;            // Optional
    sport?: string;                  // Optional - sport type for this group
    subGroups?: {                    // Optional subgroups
      id: string;
      name: string;
      description: string;
    }[];
  };
  // User information for membership creation
  userId: string;
  userDisplayName: string;
  userEmail: string;
  userPhotoURL?: string;
}

// Response interface
export interface CreateNewClubAndGroupResponse {
  success: boolean;
  clubId?: string;
  groupId?: string;
  error?: string;
}

/**
 * Orchestrating service to create a new club with initial group and add creator as admin
 * 
 * This service coordinates multiple atomic Firebase Functions:
 * 1. createClub - Creates the club document with flexible clubData
 * 2. createGroup - Creates the initial group within the club with flexible groupData  
 * 3. addMemberToClub - Adds creator as club member with admin role
 * 4. updateUserClubInfo - Updates user's clubAccess array
 * 5. updateUserGroupInfo - Updates user's groupAccess array within club
 * 
 * @param input - Flexible club data, group data, and user information (matches atomic function interfaces)
 * @returns Promise with success status and created IDs or error
 * 
 * @example
 * // Minimal usage (only required fields)
 * const result = await createNewClubAndGroup({
 *   clubData: { name: "Manchester FC" },
 *   groupData: { name: "Senior Team" },
 *   userId: "user123",
 *   userDisplayName: "John Smith",
 *   userEmail: "john@example.com"
 * });
 * 
 * @example  
 * // Full usage with optional fields
 * const result = await createNewClubAndGroup({
 *   clubData: {
 *     name: "Manchester FC",
 *     description: "Premier League football club",
 *     location: "Manchester, UK"
 *   },
 *   groupData: {
 *     name: "Senior Team", 
 *     description: "First team squad",
 *     sport: "Football",
 *     subGroups: [
 *       { id: "defenders", name: "Defense", description: "Defensive players" },
 *       { id: "midfield", name: "Midfield", description: "Midfield players" }
 *     ]
 *   },
 *   userId: "user123",
 *   userDisplayName: "John Smith",
 *   userEmail: "john@example.com",
 *   userPhotoURL: "https://example.com/photo.jpg"
 * });
 */
export const createNewClubAndGroup = async (
  input: CreateNewClubAndGroupInput
): Promise<CreateNewClubAndGroupResponse> => {
  const { clubData, groupData, userId, userDisplayName, userEmail, userPhotoURL } = input;

  try {
    console.log('🏗️ Starting createNewClubAndGroup orchestration...');

    // Step 1: Create club (atomic operation)
    console.log('1️⃣ Creating club...');
    const clubResult = await createClubFn({
      clubData // Pass clubData as expected by atomic function
    });

    if (!clubResult.data.success || !clubResult.data.clubId) {
      throw new Error(`Club creation failed: ${clubResult.data.error || 'No club ID returned'}`);
    }

    const clubId = clubResult.data.clubId;
    console.log(`✅ Club created with ID: ${clubId}`);

    // Step 2: Create group within club (atomic operation)
    console.log('2️⃣ Creating group within club...');
    const groupResult = await createGroupFn({
      clubId,
      groupData // Pass groupData as expected by atomic function
    });

    if (!groupResult.data.success || !groupResult.data.groupId) {
      throw new Error(`Group creation failed: ${groupResult.data.error || 'No group ID returned'}`);
    }

    const groupId = groupResult.data.groupId;
    console.log(`✅ Group created with ID: ${groupId}`);

    // Step 3: Add creator as club member (atomic operation)
    console.log('3️⃣ Adding creator as club member...');
    const memberResult = await addMemberToClubFn({
      clubId,
      memberData: {
        userId,
        roles: ['club-admin'],
        photoURL: userPhotoURL || '',
        name: userDisplayName,
        email: userEmail,
        addedBy: userId, // Self-added
        needsGuardian: false,
        guardiansContacts: []
      }
    });

    if (!memberResult.data.success) {
      throw new Error(`Club membership failed: ${memberResult.data.error}`);
    }

    console.log('✅ Creator added as club member');

    // Step 4: Update user's club access (atomic operation)
    console.log('4️⃣ Updating user club access...');
    const clubInfo: ClubAccess = {
      clubId,
      clubName: clubData.name,
      role: 'club-admin',
      joinedAt: new Date(),
      lastModifiedAt: new Date(),
      groupAccess: [], // Will be populated in next step
      eventAccess: [],
      pollAccess: [],
      announcementAccess: []
    };

    const userClubResult = await updateUserClubInfoFn({
      uid: userId,
      clubInfo,
      role: 'club-admin'
    });

    if (!userClubResult.data.success) {
      throw new Error(`User club info update failed: ${userClubResult.data.error}`);
    }

    console.log('✅ User club access updated');

    // Step 5: Update user's group access within club (atomic operation)
    console.log('5️⃣ Updating user group access...');
    const groupInfo: GroupAccess = {
      groupId,
      groupName: groupData.name,
      roles: ['admin'],
      joinedAt: new Date(),
      lastModifiedAt: new Date(),
      subGroups: []
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

    console.log('✅ User group access updated');

    console.log('🎉 createNewClubAndGroup orchestration completed successfully!');
    
    return {
      success: true,
      clubId,
      groupId
    };

  } catch (error: any) {
    console.error('❌ Error in createNewClubAndGroup orchestration:', error);

    // TODO: Implement rollback logic if needed
    // For now, we log the error and let atomic functions handle their own cleanup
    
    return {
      success: false,
      error: error.message || 'Failed to create club and group'
    };
  }
};

// Export as service object for consistency with other services
export const createNewClubAndGroupService = {
  execute: createNewClubAndGroup
};
