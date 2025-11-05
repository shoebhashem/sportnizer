import * as admin from 'firebase-admin';
import { MembershipOperationRequest, MembershipOperationResponse } from '../types/interfaces';

/**
 * Internal function to execute membership operations
 * This is shared between respondToInvitation and orchestrateMembershipOperation
 * to avoid code duplication
 */
export async function executeOrchestratorOperations(
  membershipRequest: MembershipOperationRequest
): Promise<MembershipOperationResponse> {
  const { operations, clubId, groupId, uid, clubMemberData, groupMemberData, userClubInfo, userGroupInfo } = membershipRequest;

  console.log(`Executing membership operations for user ${uid}:`, operations);

  const completedOperations: string[] = [];
  const failedOperations: string[] = [];
  const errors: string[] = [];

  // Use a batch for atomicity
  const batch = admin.firestore().batch();

  for (const operation of operations) {
    try {
      switch (operation) {
        case 'addToClub':
          if (!clubId || !clubMemberData) {
            throw new Error('clubId and clubMemberData required for addToClub operation');
          }
          
          // Get club members document
          const clubMemberRef = admin.firestore()
            .collection('clubs')
            .doc(clubId)
            .collection('allMembers')
            .doc('members');

          const clubDoc = await clubMemberRef.get();
          if (!clubDoc.exists) {
            throw new Error('Club members document not found');
          }

          const clubData = clubDoc.data();
          const existingClubMember = clubData?.members?.find((m: any) => m.userId === uid);
          if (existingClubMember) {
            console.log(`User ${uid} already member of club ${clubId}, skipping addToClub`);
          } else {
            batch.update(clubMemberRef, {
              members: admin.firestore.FieldValue.arrayUnion(clubMemberData),
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
              memberCount: admin.firestore.FieldValue.increment(1)
            });

            batch.update(admin.firestore().collection('clubs').doc(clubId), {
              totalCounts: admin.firestore.FieldValue.increment(1)
            });
          }
          
          completedOperations.push('addToClub');
          break;

        case 'addToGroup':
          if (!clubId || !groupId || !groupMemberData) {
            throw new Error('clubId, groupId and groupMemberData required for addToGroup operation');
          }

          // Get group members document
          const groupMemberRef = admin.firestore()
            .collection('clubs')
            .doc(clubId)
            .collection('groups')
            .doc(groupId)
            .collection('allMembers')
            .doc('members');

          const groupDoc = await groupMemberRef.get();
          if (!groupDoc.exists) {
            throw new Error('Group members document not found');
          }

          const groupData = groupDoc.data();
          const existingGroupMember = groupData?.members?.find((m: any) => m.userId === uid);
          if (existingGroupMember) {
            throw new Error(`User ${uid} is already a member of group ${groupId}`);
          }

          batch.update(groupMemberRef, {
            members: admin.firestore.FieldValue.arrayUnion(groupMemberData),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            memberCount: admin.firestore.FieldValue.increment(1)
          });

          batch.update(admin.firestore()
            .collection('clubs')
            .doc(clubId)
            .collection('groups')
            .doc(groupId), {
            membersCount: admin.firestore.FieldValue.increment(1)
          });

          completedOperations.push('addToGroup');
          break;

        case 'updateUserClub':
          if (!userClubInfo) {
            throw new Error('userClubInfo required for updateUserClub operation');
          }

          const userRefClub = admin.firestore().collection('users').doc(uid);
          const userDocClub = await userRefClub.get();
          
          if (!userDocClub.exists) {
            throw new Error('User document not found');
          }

          const userDataClub = userDocClub.data();
          let clubs = userDataClub?.clubs || [];
          
          const existingClubIndex = clubs.findIndex((club: any) => club.clubId === userClubInfo.clubId);
          if (existingClubIndex === -1) {
            clubs.push(userClubInfo);
            batch.update(userRefClub, { clubs });
          }

          completedOperations.push('updateUserClub');
          break;

        case 'updateUserGroup':
          if (!userGroupInfo) {
            throw new Error('userGroupInfo required for updateUserGroup operation');
          }

          const userRefGroup = admin.firestore().collection('users').doc(uid);
          const userDocGroup = await userRefGroup.get();
          
          if (!userDocGroup.exists) {
            throw new Error('User document not found');
          }

          const userDataGroup = userDocGroup.data();
          let groupsJoined = userDataGroup?.groupsJoined || [];
          
          const existingGroupIndex = groupsJoined.findIndex((group: any) => group.groupId === userGroupInfo.groupId);
          if (existingGroupIndex === -1) {
            groupsJoined.push(userGroupInfo);
            batch.update(userRefGroup, { groupsJoined });
          }

          completedOperations.push('updateUserGroup');
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (operationError: any) {
      console.error(`Error in operation ${operation}:`, operationError);
      failedOperations.push(operation);
      errors.push(`${operation}: ${operationError.message}`);
    }
  }

  // If any operations failed, don't commit the batch
  if (failedOperations.length > 0) {
    return {
      success: false,
      completedOperations: [],
      failedOperations,
      error: `Operations failed: ${errors.join(', ')}`
    };
  }

  // Commit all operations atomically
  await batch.commit();

  console.log(`Successfully completed all operations for user ${uid}:`, completedOperations);

  return {
    success: true,
    completedOperations,
    failedOperations: [],
    message: `All membership operations completed successfully`
  };
}
