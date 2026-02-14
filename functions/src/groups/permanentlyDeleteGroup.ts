import * as admin from "firebase-admin";
import { deductRolesFromClubMemberList } from "../members/helpers/deductRolesFromClubMemberList";
import { markUserInactiveInClub } from "../members/helpers/markUserInactiveInClub";

/**
 * Permanently deletes a group and all its data
 * This is a helper function called by the scheduled cleanup function
 * NOT exposed as a callable function
 */
export async function permanentlyDeleteGroup(
  clubId: string,
  groupId: string,
): Promise<{
  success: boolean;
  deletedSubgroups: number;
  deletedMembers: number;
}> {
  const db = admin.firestore();
  const groupRef = db
    .collection("clubs")
    .doc(clubId)
    .collection("groups")
    .doc(groupId);

  let deletedSubgroups = 0;
  let deletedMembers = 0;

  try {
    // 1. Delete all subgroups
    const subgroupsSnapshot = await groupRef.collection("subgroups").get();
    if (!subgroupsSnapshot.empty) {
      const batch = db.batch();
      subgroupsSnapshot.docs.forEach((subgroupDoc) => {
        batch.delete(subgroupDoc.ref);
        deletedSubgroups++;
      });
      await batch.commit();
      console.log(
        `Deleted ${deletedSubgroups} subgroups from group ${groupId}`,
      );
    }

    // 2. Get member IDs and process role deductions
    const membersDoc = await groupRef
      .collection("allMembers")
      .doc("members")
      .get();
    const members = membersDoc.exists ? membersDoc.data()?.members || [] : [];
    const memberIds = members.map((m: any) => m.userId);

    // 2a. Process each member to deduct their roles from club member list
    console.log(
      `🔄 Processing role deduction for ${members.length} members...`,
    );

    for (const member of members) {
      try {
        const userId = member.userId;
        const memberRoles = member.roles || [];
        const guardiansContacts = member.guardiansContacts || [];
        const isYouthPlayer = memberRoles.includes("player-underage");

        console.log(
          `  → Processing member ${userId}: roles [${memberRoles.join(", ")}]`,
        );

        // Deduct member's roles from club member list
        if (memberRoles.length > 0) {
          const deductResult = await deductRolesFromClubMemberList({
            clubId,
            userId,
            rolesToDeduct: memberRoles,
          });

          console.log(
            `    ✅ Deducted roles. Inactive: ${deductResult.isNowInactive}`,
          );

          // If member is now inactive, update user document
          if (deductResult.isNowInactive) {
            await markUserInactiveInClub({ userId, clubId });
            console.log(`    ✅ Marked user inactive in club`);
          }
        }

        // Guardian cascade - if youth player, process guardians
        if (isYouthPlayer && guardiansContacts.length > 0) {
          console.log(
            `    👨‍👩‍👧 Processing ${guardiansContacts.length} guardian(s)...`,
          );

          for (const guardianContact of guardiansContacts) {
            try {
              const guardianUid = guardianContact.guardianUid;
              const guardianName = guardianContact.guardianName || guardianUid;

              console.log(`      → Guardian: ${guardianName}`);

              // Deduct ONE 'guardian' role from guardian's club member list
              const guardianResult = await deductRolesFromClubMemberList({
                clubId,
                userId: guardianUid,
                rolesToDeduct: ["guardian"],
              });

              console.log(
                `        ✅ Deducted guardian role. Inactive: ${guardianResult.isNowInactive}`,
              );

              // If guardian now inactive, update their user document
              if (guardianResult.isNowInactive) {
                await markUserInactiveInClub({ userId: guardianUid, clubId });
                console.log(`        ✅ Marked guardian inactive in club`);
              }
            } catch (guardianError) {
              console.error(
                `      ❌ Error processing guardian ${guardianContact.guardianName}:`,
                guardianError,
              );
              // Continue processing other guardians
            }
          }
        }
      } catch (memberError) {
        console.error(
          `  ❌ Error processing member ${member.userId}:`,
          memberError,
        );
        // Continue processing other members
      }
    }

    console.log(`✅ Completed role deduction for all members`);

    // 3. Update user documents to remove group from clubAccess
    if (memberIds.length > 0) {
      console.log(
        `Removing group ${groupId} from ${memberIds.length} user documents`,
      );

      // Update each user's clubAccess to remove this group
      for (const userId of memberIds) {
        try {
          const userRef = db.collection("users").doc(userId);
          const userDoc = await userRef.get();

          if (userDoc.exists) {
            const clubAccess = userDoc.data()?.clubAccess || [];
            const updatedClubAccess = clubAccess.map((club: any) => {
              if (club.clubId === clubId) {
                return {
                  ...club,
                  groupAccess: club.groupAccess.filter(
                    (g: any) => g.groupId !== groupId,
                  ),
                };
              }
              return club;
            });

            await userRef.update({ clubAccess: updatedClubAccess });
            console.log(`✓ Removed group from user ${userId}`);
          }
        } catch (error) {
          console.error(`Error updating user ${userId}:`, error);
        }
      }
    }
    4;
    // 3. Delete allMembers collection
    const membersSnapshot = await groupRef.collection("allMembers").get();
    if (!membersSnapshot.empty) {
      const batch = db.batch();
      membersSnapshot.docs.forEach((memberDoc) => {
        batch.delete(memberDoc.ref);
        deletedMembers++;
      });
      await batch.commit();
      console.log(
        `Deleted ${deletedMembers} member documents from group ${groupId}`,
      );
    }

    // 5. Delete group document
    await groupRef.delete();
    console.log(`Permanently deleted group ${groupId} from club ${clubId}`);

    return {
      success: true,
      deletedSubgroups,
      deletedMembers,
    };
  } catch (error) {
    console.error(`Error permanently deleting group ${groupId}:`, error);
    throw error;
  }
}
