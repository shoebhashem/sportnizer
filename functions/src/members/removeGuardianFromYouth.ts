import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Remove a guardian from an existing youth member
 *
 * This Cloud Function handles unlinking a guardian from a youth player.
 * It is the reverse of addGuardianToYouth.
 *
 * Operations performed:
 * 1. Remove guardian from youth's `guardiansContacts[]` in club member doc
 * 2. Remove guardian from youth's `guardiansContacts[]` in group member doc
 * 3. Remove guardian from youth's `guardiansContacts[]` in all subgroup member docs (cascade)
 * 4. Remove guardian entry from youth's `guardians[]` in user doc
 * 5. Remove youth from guardian's `dependents[]` in user doc
 * 6. Remove ONE "guardian" role from guardian's club member roles[]
 * 7. If guardian roles[] becomes empty → mark guardian isActive: false
 *
 * @param clubId - Club where the youth is a member
 * @param groupId - Group where the youth is a member
 * @param youthUid - Youth member's UID
 * @param guardianUid - Guardian's Firebase Auth UID
 *
 * @throws HttpsError('unauthenticated') - Caller not authenticated
 * @throws HttpsError('invalid-argument') - Missing required fields
 * @throws HttpsError('not-found') - Youth or guardian doc not found, or link doesn't exist
 */

export interface RemoveGuardianFromYouthRequest {
  clubId: string;
  groupId: string;
  youthUid: string;
  guardianUid: string;
}

export interface RemoveGuardianFromYouthResponse {
  success: boolean;
  guardianMarkedInactive?: boolean;
  message?: string;
  error?: string;
}

export const removeGuardianFromYouth = onCall(
  {
    region: config.region,
  },
  async (request): Promise<RemoveGuardianFromYouthResponse> => {
    try {
      // 1. Verify caller is authenticated
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Must be authenticated to remove a guardian",
        );
      }

      const {
        clubId,
        groupId,
        youthUid,
        guardianUid,
      }: RemoveGuardianFromYouthRequest = request.data;

      // 2. Validate required fields
      validateRequiredFields(request.data, [
        "clubId",
        "groupId",
        "youthUid",
        "guardianUid",
      ]);

      console.log(
        `Removing guardian ${guardianUid} from youth ${youthUid} in club ${clubId}, group ${groupId}`,
      );

      const db = admin.firestore();

      // 3. Validate youth user document exists and has this guardian
      const youthRef = db.collection("users").doc(youthUid);
      const youthDoc = await youthRef.get();
      if (!youthDoc.exists) {
        throw new HttpsError("not-found", "Youth member document not found");
      }
      const youthData = youthDoc.data()!;

      const existingGuardians = youthData.guardians || [];
      const guardianIndex = existingGuardians.findIndex(
        (g: any) => g.guardianUid === guardianUid,
      );
      if (guardianIndex === -1) {
        throw new HttpsError(
          "not-found",
          "Guardian is not linked to this youth member",
        );
      }

      // 4. Validate guardian user document exists
      const guardianRef = db.collection("users").doc(guardianUid);
      const guardianDoc = await guardianRef.get();
      if (!guardianDoc.exists) {
        throw new HttpsError("not-found", "Guardian user document not found");
      }

      // ===== UPDATE YOUTH'S DOCUMENTS =====

      // 5. Remove guardian from youth's user doc guardians[]
      const updatedGuardians = existingGuardians.filter(
        (g: any) => g.guardianUid !== guardianUid,
      );
      await youthRef.update({
        guardians: updatedGuardians,
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp(),
      });
      console.log(`✅ Removed guardian from youth user doc guardians[]`);

      // 6. Remove guardian from youth's club member guardiansContacts[]
      const clubMembersRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("allMembers")
        .doc("members");
      const clubMembersDoc = await clubMembersRef.get();

      if (clubMembersDoc.exists) {
        const clubMembersData = clubMembersDoc.data();
        const members = clubMembersData?.members || [];
        const youthClubIndex = members.findIndex(
          (m: any) => m.userId === youthUid,
        );

        if (youthClubIndex !== -1) {
          const currentContacts =
            members[youthClubIndex].guardiansContacts || [];
          members[youthClubIndex].guardiansContacts = currentContacts.filter(
            (gc: any) => gc.guardianUid !== guardianUid,
          );
          members[youthClubIndex].lastModifiedAt = new Date();

          // Also update guardian's club member roles
          const guardianClubIndex = members.findIndex(
            (m: any) => m.userId === guardianUid,
          );

          let guardianMarkedInactive = false;

          if (guardianClubIndex !== -1) {
            const guardianRoles = members[guardianClubIndex].roles || [];
            // Remove ONE instance of "guardian" (de-accumulation)
            const guardianRoleIndex = guardianRoles.indexOf("guardian");
            if (guardianRoleIndex !== -1) {
              guardianRoles.splice(guardianRoleIndex, 1);
              members[guardianClubIndex].roles = guardianRoles;
              members[guardianClubIndex].lastModifiedAt = new Date();

              // If roles[] is now empty → mark inactive
              if (guardianRoles.length === 0) {
                members[guardianClubIndex].isActive = false;
                members[guardianClubIndex].inactiveSince = new Date();
                members[guardianClubIndex].scheduledForDeletion = new Date(
                  Date.now() + 30 * 24 * 60 * 60 * 1000,
                ); // 30 days
                guardianMarkedInactive = true;
                console.log(
                  `ℹ️ Guardian roles[] empty, marked inactive in club member list`,
                );
              }
            }
          }

          await clubMembersRef.update({
            members,
            memberCount: members.filter((m: any) => m.isActive !== false)
              .length,
          });
          console.log(
            `✅ Updated club member doc: removed guardian from guardiansContacts[] and de-accumulated role`,
          );

          // 7. Remove guardian from youth's group member guardiansContacts[]
          const groupMembersRef = db
            .collection("clubs")
            .doc(clubId)
            .collection("groups")
            .doc(groupId)
            .collection("allMembers")
            .doc("members");
          const groupMembersDoc = await groupMembersRef.get();

          if (groupMembersDoc.exists) {
            const groupMembersData = groupMembersDoc.data();
            const groupMembers = groupMembersData?.members || [];
            const youthGroupIndex = groupMembers.findIndex(
              (m: any) => m.userId === youthUid,
            );

            if (youthGroupIndex !== -1) {
              const currentGroupContacts =
                groupMembers[youthGroupIndex].guardiansContacts || [];
              groupMembers[youthGroupIndex].guardiansContacts =
                currentGroupContacts.filter(
                  (gc: any) => gc.guardianUid !== guardianUid,
                );
              groupMembers[youthGroupIndex].lastModifiedAt = new Date();

              await groupMembersRef.update({
                members: groupMembers,
                memberCount: groupMembers.filter(
                  (m: any) => m.isActive !== false,
                ).length,
              });
              console.log(
                `✅ Updated group member doc: removed guardian from guardiansContacts[]`,
              );
            }
          }

          // 7b. Remove guardian from youth's subgroup member guardiansContacts[]
          const groupRef = db
            .collection("clubs")
            .doc(clubId)
            .collection("groups")
            .doc(groupId);
          const subgroupsSnapshot = await groupRef
            .collection("subgroups")
            .get();

          if (!subgroupsSnapshot.empty) {
            let subgroupsUpdated = 0;
            for (const subgroupDoc of subgroupsSnapshot.docs) {
              const subgroupMemberRef = subgroupDoc.ref
                .collection("allMembers")
                .doc("members");
              const subgroupMembersDoc = await subgroupMemberRef.get();

              if (subgroupMembersDoc.exists) {
                const subgroupMembers =
                  subgroupMembersDoc.data()?.members || [];
                const youthSubgroupIndex = subgroupMembers.findIndex(
                  (m: any) => m.userId === youthUid,
                );

                if (youthSubgroupIndex !== -1) {
                  const currentSubgroupContacts =
                    subgroupMembers[youthSubgroupIndex].guardiansContacts || [];
                  subgroupMembers[youthSubgroupIndex].guardiansContacts =
                    currentSubgroupContacts.filter(
                      (gc: any) => gc.guardianUid !== guardianUid,
                    );
                  subgroupMembers[youthSubgroupIndex].lastModifiedAt =
                    new Date();

                  await subgroupMemberRef.update({
                    members: subgroupMembers,
                    memberCount: subgroupMembers.filter(
                      (m: any) => m.isActive !== false,
                    ).length,
                  });
                  subgroupsUpdated++;
                }
              }
            }
            console.log(
              `✅ Removed guardian from ${subgroupsUpdated} subgroup(s) guardiansContacts[]`,
            );
          }

          // ===== UPDATE GUARDIAN'S DOCUMENTS =====

          // 8. Remove youth from guardian's dependents[]
          const guardianData = guardianDoc.data()!;
          const existingDependents = guardianData.dependents || [];
          const updatedDependents = existingDependents.filter(
            (d: any) => d.uid !== youthUid,
          );

          await guardianRef.update({
            dependents: updatedDependents,
            version: FieldValue.increment(1),
            lastModified: FieldValue.serverTimestamp(),
          });
          console.log(`✅ Removed youth from guardian's dependents[]`);

          // 9. If guardian was marked inactive in club, also update user doc
          if (guardianMarkedInactive) {
            // Remove the club from guardian's clubAccess
            const guardianClubAccess = guardianData.clubAccess || [];
            const updatedClubAccess = guardianClubAccess.filter(
              (ca: any) => ca.clubId !== clubId,
            );

            await guardianRef.update({
              clubAccess: updatedClubAccess,
              version: FieldValue.increment(1),
              lastModified: FieldValue.serverTimestamp(),
            });
            console.log(
              `✅ Removed club from guardian's clubAccess (no more roles)`,
            );
          }

          console.log(
            `✅ Successfully unlinked guardian ${guardianUid} from youth ${youthUid}`,
          );

          return {
            success: true,
            guardianMarkedInactive,
            message: `Guardian successfully removed from youth member`,
          };
        }
      }

      // Fallback if club members doc doesn't exist (shouldn't happen)
      return {
        success: false,
        error: "Club members document not found",
      };
    } catch (error) {
      console.error("Error in removeGuardianFromYouth:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to remove guardian from youth member",
      );
    }
  },
);
