/**
 * Helper functions for membership operations
 * These can be called directly from other backend functions without HTTP overhead
 */

import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

interface MemberData {
  userId: string;
  name: string;
  email: string;
  roles: string[];
  addedBy: string;
  joinedAt: admin.firestore.FieldValue;
  profilePictureUrl?: string;
}

interface ClubInfo {
  clubId: string;
  clubName: string;
  joinedAt: admin.firestore.FieldValue;
  role: string;
}

interface GroupInfo {
  groupId: string;
  groupName: string;
  joinedAt: admin.firestore.FieldValue;
}

/**
 * Add a member to a club's allMembers document
 */
export async function addMemberToClubHelper(
  clubId: string,
  memberData: MemberData
): Promise<void> {
  console.log(`[Helper] Adding member ${memberData.userId} to club ${clubId}`);

  const clubMemberRef = admin.firestore()
    .collection('clubs')
    .doc(clubId)
    .collection('allMembers')
    .doc('members');

  const clubDoc = await clubMemberRef.get();

  if (!clubDoc.exists) {
    // Create new document with the member
    await clubMemberRef.set({
      members: {
        [memberData.userId]: memberData
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } else {
    // Add member to existing members object
    await clubMemberRef.update({
      [`members.${memberData.userId}`]: memberData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  console.log(`[Helper] ✅ Member ${memberData.userId} added to club ${clubId}`);
}

/**
 * Add a member to a group's allMembers document
 */
export async function addMemberToGroupHelper(
  clubId: string,
  groupId: string,
  memberData: MemberData
): Promise<void> {
  console.log(`[Helper] Adding member ${memberData.userId} to group ${groupId} in club ${clubId}`);

  const groupMemberRef = admin.firestore()
    .collection('clubs')
    .doc(clubId)
    .collection('groups')
    .doc(groupId)
    .collection('allMembers')
    .doc('members');

  const groupDoc = await groupMemberRef.get();

  if (!groupDoc.exists) {
    // Create new document with the member
    await groupMemberRef.set({
      members: {
        [memberData.userId]: memberData
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } else {
    // Add member to existing members object
    await groupMemberRef.update({
      [`members.${memberData.userId}`]: memberData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  console.log(`[Helper] ✅ Member ${memberData.userId} added to group ${groupId}`);
}

/**
 * Update user's clubAccess array with new club membership
 */
export async function updateUserClubInfoHelper(
  userId: string,
  clubInfo: ClubInfo,
  role: string
): Promise<void> {
  console.log(`[Helper] Updating user ${userId} club info for club ${clubInfo.clubId}`);

  const userRef = admin.firestore().collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User not found');
  }

  const userData = userDoc.data();
  const clubAccess = userData?.clubAccess || [];

  // Check if user already has access to this club
  const existingClubIndex = clubAccess.findIndex((club: any) => club.clubId === clubInfo.clubId);

  if (existingClubIndex >= 0) {
    // Update existing club access
    clubAccess[existingClubIndex] = {
      ...clubAccess[existingClubIndex],
      ...clubInfo,
      role
    };
  } else {
    // Add new club access
    clubAccess.push({
      ...clubInfo,
      role,
      groupAccess: []
    });
  }

  await userRef.update({
    clubAccess,
    version: admin.firestore.FieldValue.increment(1),
    lastActive: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`[Helper] ✅ User ${userId} club info updated for club ${clubInfo.clubId}`);
}

/**
 * Update user's groupAccess within their clubAccess array
 */
export async function updateUserGroupInfoHelper(
  userId: string,
  clubId: string,
  groupInfo: GroupInfo,
  roles: string[]
): Promise<void> {
  console.log(`[Helper] Updating user ${userId} group info for group ${groupInfo.groupId}`);

  const userRef = admin.firestore().collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User not found');
  }

  const userData = userDoc.data();
  const clubAccess = userData?.clubAccess || [];

  // Find the club in clubAccess
  const clubIndex = clubAccess.findIndex((club: any) => club.clubId === clubId);

  if (clubIndex < 0) {
    throw new HttpsError('not-found', 'Club not found in user access');
  }

  // Get or initialize groupAccess array
  const groupAccess = clubAccess[clubIndex].groupAccess || [];

  // Check if group already exists
  const groupIndex = groupAccess.findIndex((group: any) => group.groupId === groupInfo.groupId);

  if (groupIndex >= 0) {
    // Update existing group
    groupAccess[groupIndex] = {
      ...groupAccess[groupIndex],
      ...groupInfo,
      roles
    };
  } else {
    // Add new group
    groupAccess.push({
      ...groupInfo,
      roles
    });
  }

  // Update clubAccess with modified groupAccess
  clubAccess[clubIndex].groupAccess = groupAccess;

  await userRef.update({
    clubAccess,
    version: admin.firestore.FieldValue.increment(1),
    lastActive: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`[Helper] ✅ User ${userId} group info updated for group ${groupInfo.groupId}`);
}
