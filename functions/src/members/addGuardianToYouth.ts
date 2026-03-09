import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Add a guardian to an existing youth member
 *
 * This Cloud Function handles adding a NEW guardian link to an existing youth player.
 * It is used when an admin wants to add a guardian to a youth who is already in the club.
 *
 * The guardian MUST already have a Clubnizer account (existing user).
 * For new-user guardians, use the invitation flow with invitationType "guardian".
 *
 * Operations performed atomically:
 * 1. Add guardian to youth's `guardiansContacts[]` in club member doc
 * 2. Add guardian to youth's `guardiansContacts[]` in group member doc
 * 3. Add guardian to youth's `guardiansContacts[]` in all subgroup member docs (cascade)
 * 4. Add guardian entry to youth's `guardians[]` in user doc (`users/{youthUid}`)
 * 5. Add youth as dependent in guardian's `dependents[]` in user doc (`users/{guardianUid}`)
 * 6. Add guardian to club member list (if not already a member) with role "guardian"
 * 7. If guardian already in club, accumulate "guardian" role
 * 8. Sync guardian's dependent access with youth's current clubAccess
 *
 * @param clubId - Club where the youth is a member
 * @param groupId - Group where the youth is a member
 * @param youthUid - Youth member's UID (Firestore doc ID, not Firebase Auth)
 * @param guardianUid - Guardian's Firebase Auth UID
 * @param guardianName - Guardian's display name
 * @param guardianEmail - Guardian's email address
 * @param relationship - Relationship to youth ("parent" | "guardian" | "legal_guardian")
 *
 * If the guardian is already linked to this youth (in a different group),
 * the function skips steps that are already done and only performs the
 * group-specific additions (guardiansContacts in group member doc,
 * surgical addGroup on guardian's dependents, etc.).
 *
 * @throws HttpsError('unauthenticated') - Caller not authenticated
 * @throws HttpsError('invalid-argument') - Missing required fields
 * @throws HttpsError('not-found') - Youth or guardian doc not found
 */

export interface AddGuardianToYouthRequest {
  clubId: string;
  groupId: string;
  youthUid: string;
  guardianUid: string;
  guardianName: string;
  guardianEmail: string;
  relationship: string;
}

export interface AddGuardianToYouthResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export const addGuardianToYouth = onCall(
  {
    region: config.region,
  },
  async (request): Promise<AddGuardianToYouthResponse> => {
    try {
      // 1. Verify caller is authenticated
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Must be authenticated to add a guardian",
        );
      }

      const {
        clubId,
        groupId,
        youthUid,
        guardianUid,
        guardianName,
        guardianEmail,
        relationship,
      }: AddGuardianToYouthRequest = request.data;

      // 2. Validate required fields
      validateRequiredFields(request.data, [
        "clubId",
        "groupId",
        "youthUid",
        "guardianUid",
        "guardianName",
        "guardianEmail",
        "relationship",
      ]);

      console.log(
        `Adding guardian ${guardianUid} (${guardianName}) to youth ${youthUid} in club ${clubId}, group ${groupId}`,
      );

      const db = admin.firestore();

      // 3. Validate youth user document exists
      const youthRef = db.collection("users").doc(youthUid);
      const youthDoc = await youthRef.get();
      if (!youthDoc.exists) {
        throw new HttpsError("not-found", "Youth member document not found");
      }
      const youthData = youthDoc.data()!;

      // 4. Validate guardian user document exists
      const guardianRef = db.collection("users").doc(guardianUid);
      const guardianDoc = await guardianRef.get();
      if (!guardianDoc.exists) {
        throw new HttpsError("not-found", "Guardian user document not found");
      }

      // 5. Check if guardian is already linked to this youth
      const existingGuardians = youthData.guardians || [];
      const guardianAlreadyLinked = existingGuardians.some(
        (g: any) => g.guardianUid === guardianUid,
      );
      if (guardianAlreadyLinked) {
        console.log(
          `ℹ️ Guardian ${guardianName} already linked to youth — extending access to group ${groupId}`,
        );
      }

      // 6. Build guardian contact entry (for member docs)
      const guardianContact = {
        guardianUid,
        guardianName,
        guardianEmail,
        relationship,
      };

      // 7. Build guardian entry (for youth user doc - richer structure)
      const guardianEntry = {
        guardianUid,
        guardianName,
        guardianEmail,
        relationship,
        addedAt: new Date(),
        canManage: true,
      };

      // ===== UPDATE YOUTH'S DOCUMENTS =====

      // 8. Update youth's user doc: add to guardians[] (skip if already linked)
      if (!guardianAlreadyLinked) {
        await youthRef.update({
          guardians: FieldValue.arrayUnion(guardianEntry),
          version: FieldValue.increment(1),
          lastModified: FieldValue.serverTimestamp(),
        });
        console.log(`✅ Updated youth user doc: added guardian to guardians[]`);
      } else {
        console.log(
          `ℹ️ Skipping youth user doc update — guardian already in guardians[]`,
        );
      }

      // 9. Update youth's club member entry: add to guardiansContacts[]
      const clubMembersRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("allMembers")
        .doc("members");
      const clubMembersDoc = await clubMembersRef.get();

      // Hoist members array so step 12 reuses the same (updated) data
      let members: any[] = clubMembersDoc.exists
        ? clubMembersDoc.data()?.members || []
        : [];

      if (clubMembersDoc.exists) {
        const youthIndex = members.findIndex((m: any) => m.userId === youthUid);

        if (youthIndex !== -1) {
          const currentContacts = members[youthIndex].guardiansContacts || [];
          const alreadyInClubContacts = currentContacts.some(
            (c: any) => c.guardianUid === guardianUid,
          );

          if (!alreadyInClubContacts) {
            currentContacts.push(guardianContact);
            members[youthIndex].guardiansContacts = currentContacts;
            members[youthIndex].lastModifiedAt = new Date();

            await clubMembersRef.update({
              members,
              memberCount: members.filter((m: any) => m.isActive !== false)
                .length,
            });
            console.log(
              `✅ Updated club member doc: added guardian to guardiansContacts[]`,
            );
          } else {
            console.log(
              `ℹ️ Guardian already in club-level guardiansContacts[] — skipping`,
            );
          }
        } else {
          console.warn(`⚠️ Youth ${youthUid} not found in club member list`);
        }
      }

      // 10. Update youth's group member entry: add to guardiansContacts[]
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
          const alreadyInGroupContacts = currentGroupContacts.some(
            (c: any) => c.guardianUid === guardianUid,
          );

          if (!alreadyInGroupContacts) {
            currentGroupContacts.push(guardianContact);
            groupMembers[youthGroupIndex].guardiansContacts =
              currentGroupContacts;
            groupMembers[youthGroupIndex].lastModifiedAt = new Date();

            await groupMembersRef.update({
              members: groupMembers,
              memberCount: groupMembers.filter((m: any) => m.isActive !== false)
                .length,
            });
            console.log(
              `✅ Updated group member doc: added guardian to guardiansContacts[]`,
            );
          } else {
            console.log(
              `ℹ️ Guardian already in group-level guardiansContacts[] — skipping`,
            );
          }
        } else {
          console.warn(`⚠️ Youth ${youthUid} not found in group member list`);
        }
      }

      // 10b. Update youth's subgroup member entries: add to guardiansContacts[]
      const groupRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId);
      const subgroupsSnapshot = await groupRef.collection("subgroups").get();

      if (!subgroupsSnapshot.empty) {
        let subgroupsUpdated = 0;
        for (const subgroupDoc of subgroupsSnapshot.docs) {
          const subgroupMemberRef = subgroupDoc.ref
            .collection("allMembers")
            .doc("members");
          const subgroupMembersDoc = await subgroupMemberRef.get();

          if (subgroupMembersDoc.exists) {
            const subgroupMembers = subgroupMembersDoc.data()?.members || [];
            const youthSubgroupIndex = subgroupMembers.findIndex(
              (m: any) => m.userId === youthUid,
            );

            if (youthSubgroupIndex !== -1) {
              const currentSubgroupContacts =
                subgroupMembers[youthSubgroupIndex].guardiansContacts || [];
              const alreadyInSubgroupContacts = currentSubgroupContacts.some(
                (c: any) => c.guardianUid === guardianUid,
              );

              if (!alreadyInSubgroupContacts) {
                currentSubgroupContacts.push(guardianContact);
                subgroupMembers[youthSubgroupIndex].guardiansContacts =
                  currentSubgroupContacts;
                subgroupMembers[youthSubgroupIndex].lastModifiedAt = new Date();

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
        }
        console.log(
          `✅ Updated ${subgroupsUpdated} subgroup(s) with new guardian contact`,
        );
      }

      // ===== UPDATE GUARDIAN'S DOCUMENTS =====

      // 11. Add youth as dependent in guardian's user doc
      const guardianData = guardianDoc.data()!;
      const existingDependents = guardianData.dependents || [];
      const alreadyDependent = existingDependents.some(
        (d: any) => d.uid === youthUid,
      );

      if (!alreadyDependent) {
        // Build filtered clubAccess: only the club+group relevant to this guardian
        const fullClubAccess = youthData.clubAccess || [];
        const relevantClub = fullClubAccess.find(
          (ca: any) => ca.clubId === clubId,
        );
        let filteredClubAccess: any[] = [];
        if (relevantClub) {
          const relevantGroup = (relevantClub.groupAccess || []).find(
            (g: any) => g.groupId === groupId,
          );
          filteredClubAccess = [
            {
              ...relevantClub,
              groupAccess: relevantGroup ? [relevantGroup] : [],
            },
          ];
        }

        const dependentEntry = {
          uid: youthUid,
          childName: youthData.displayName || "Unknown",
          dateOfBirth: youthData.dateOfBirth || "",
          relationship,
          addedAt: new Date(),
          clubAccess: filteredClubAccess, // Only the relevant club+group for this guardian
        };

        await guardianRef.update({
          dependents: FieldValue.arrayUnion(dependentEntry),
          version: FieldValue.increment(1),
          lastModified: FieldValue.serverTimestamp(),
        });
        console.log(
          `✅ Updated guardian user doc: added youth to dependents[]`,
        );
      } else {
        // Youth already in dependents — surgically add this group to existing entry
        console.log(
          `ℹ️ Youth ${youthUid} already in guardian's dependents[] — surgically adding group ${groupId}`,
        );

        // Perform surgical addGroup inline (same Firestore access, no need to call separate CF)
        const depIndex = existingDependents.findIndex(
          (d: any) => d.uid === youthUid,
        );
        const depClubAccess = existingDependents[depIndex].clubAccess || [];

        // Read the target group from youth's clubAccess
        const youthClubAccess = youthData.clubAccess || [];
        const targetClub = youthClubAccess.find(
          (ca: any) => ca.clubId === clubId,
        );
        const targetGroup = targetClub
          ? (targetClub.groupAccess || []).find(
              (g: any) => g.groupId === groupId,
            )
          : null;

        if (targetClub && targetGroup) {
          // Find or create the club entry in the guardian's dependent
          let depClubIndex = depClubAccess.findIndex(
            (ca: any) => ca.clubId === clubId,
          );
          if (depClubIndex === -1) {
            depClubAccess.push({
              clubId: targetClub.clubId,
              clubName: targetClub.clubName,
              role: targetClub.role || "member",
              isActive: targetClub.isActive !== false,
              joinedAt: targetClub.joinedAt,
              lastModifiedAt: targetClub.lastModifiedAt || new Date(),
              groupAccess: [],
            });
            depClubIndex = depClubAccess.length - 1;
          }

          // Find or add the group entry
          const depGroupAccess = depClubAccess[depClubIndex].groupAccess || [];
          const depGroupIndex = depGroupAccess.findIndex(
            (g: any) => g.groupId === groupId,
          );
          if (depGroupIndex === -1) {
            depGroupAccess.push(targetGroup);
          } else {
            depGroupAccess[depGroupIndex] = targetGroup;
          }
          depClubAccess[depClubIndex].groupAccess = depGroupAccess;

          // Write updated dependents back
          existingDependents[depIndex].clubAccess = depClubAccess;
          await guardianRef.update({
            dependents: existingDependents,
            version: FieldValue.increment(1),
            lastModified: FieldValue.serverTimestamp(),
          });
          console.log(
            `✅ Surgically added group ${groupId} to guardian's dependent entry for youth ${youthUid}`,
          );
        } else {
          console.warn(
            `⚠️ Could not find group ${groupId} in youth's clubAccess — skipping dependent update`,
          );
        }
      }

      // 12. Handle guardian's club membership (reuses `members` from step 9)
      const guardianClubEntry = members.find(
        (m: any) => m.userId === guardianUid,
      );

      if (guardianClubEntry && guardianClubEntry.isActive !== false) {
        // Guardian already in club — accumulate "guardian" role only if not already present
        const hasGuardianRole = (guardianClubEntry.roles || []).includes(
          "guardian",
        );
        if (!hasGuardianRole) {
          console.log(
            `ℹ️ Guardian already in club, accumulating guardian role...`,
          );
          guardianClubEntry.roles.push("guardian");
          guardianClubEntry.lastModifiedAt = new Date();

          await clubMembersRef.update({
            members,
            memberCount: members.filter((m: any) => m.isActive !== false)
              .length,
          });
          console.log(`✅ Accumulated guardian role in club member list`);
        } else {
          console.log(
            `ℹ️ Guardian already has 'guardian' role in club — skipping accumulation`,
          );
        }
      } else if (!guardianClubEntry) {
        // Guardian not in club — add as new member with guardian role
        console.log(`📞 Adding guardian as new club member...`);

        const DEFAULT_ADULT_PHOTO =
          "https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media";

        const guardianMemberEntry = {
          userId: guardianUid,
          name: guardianName,
          email: guardianEmail,
          roles: ["guardian"],
          joinedAt: new Date(),
          photoURL: guardianData.photoURL || DEFAULT_ADULT_PHOTO,
          addedBy: request.auth.uid,
          needsGuardian: false,
          guardiansContacts: [],
          isActive: true,
          lastModifiedAt: new Date(),
        };

        members.push(guardianMemberEntry);
        await clubMembersRef.update({
          members,
          memberCount: members.filter((m: any) => m.isActive !== false).length,
        });
        console.log(`✅ Added guardian as new club member`);

        // Update guardian's user doc with club access
        const youthClubEntry = (youthData.clubAccess || []).find(
          (ca: any) => ca.clubId === clubId,
        );

        if (youthClubEntry) {
          const guardianClubInfo = {
            clubId,
            clubName: youthClubEntry.clubName || "",
            role: "member", // Permission-level role (not "guardian")
            joinedAt: new Date(),
            lastModifiedAt: new Date(),
            groupAccess: [],
          };

          await guardianRef.update({
            clubAccess: FieldValue.arrayUnion(guardianClubInfo),
            version: FieldValue.increment(1),
            lastModified: FieldValue.serverTimestamp(),
          });
          console.log(`✅ Updated guardian's clubAccess with new club entry`);
        }
      } else {
        // Guardian exists but is inactive — reactivate with guardian role
        console.log(`ℹ️ Guardian is inactive in club, reactivating...`);
        guardianClubEntry.isActive = true;
        guardianClubEntry.roles = ["guardian"];
        guardianClubEntry.inactiveSince = null;
        guardianClubEntry.scheduledForDeletion = null;
        guardianClubEntry.lastModifiedAt = new Date();

        await clubMembersRef.update({
          members,
          memberCount: members.filter((m: any) => m.isActive !== false).length,
        });
        console.log(`✅ Reactivated guardian in club with guardian role`);

        // Also restore guardian's clubAccess entry on user doc
        const guardianClubAccess = guardianData.clubAccess || [];
        const existingClubAccessEntry = guardianClubAccess.find(
          (ca: any) => ca.clubId === clubId,
        );

        if (existingClubAccessEntry) {
          // Reactivate the inactive clubAccess entry
          existingClubAccessEntry.isActive = true;
          existingClubAccessEntry.inactiveSince = null;
          existingClubAccessEntry.scheduledForDeletion = null;
          existingClubAccessEntry.lastModifiedAt = new Date();

          await guardianRef.update({
            clubAccess: guardianClubAccess,
            version: FieldValue.increment(1),
            lastModified: FieldValue.serverTimestamp(),
          });
          console.log(`✅ Reactivated guardian's clubAccess entry`);
        } else {
          // Defensive fallback: entry missing entirely — create a fresh one
          const youthClubEntry = (youthData.clubAccess || []).find(
            (ca: any) => ca.clubId === clubId,
          );
          const guardianClubInfo = {
            clubId,
            clubName: youthClubEntry?.clubName || "",
            role: "member",
            joinedAt: new Date(),
            lastModifiedAt: new Date(),
            groupAccess: [],
          };

          await guardianRef.update({
            clubAccess: FieldValue.arrayUnion(guardianClubInfo),
            version: FieldValue.increment(1),
            lastModified: FieldValue.serverTimestamp(),
          });
          console.log(
            `✅ Created fresh clubAccess entry for guardian (fallback)`,
          );
        }
      }

      const actionDesc = guardianAlreadyLinked
        ? `Guardian ${guardianName} access extended to group ${groupId}`
        : `Guardian ${guardianName} successfully linked to youth member`;
      console.log(`✅ ${actionDesc}`);

      return {
        success: true,
        message: actionDesc,
      };
    } catch (error) {
      console.error("Error in addGuardianToYouth:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to add guardian to youth member",
      );
    }
  },
);
