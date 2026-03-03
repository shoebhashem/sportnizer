import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  RemoveMemberFromGroupRequest,
  RemoveMemberFromGroupResponse,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

export const removeMemberFromGroup = onCall(
  {
    region: config.region,
  },
  async (request): Promise<RemoveMemberFromGroupResponse> => {
    try {
      const {
        clubId,
        groupId,
        userId,
        roleToRemove,
      }: RemoveMemberFromGroupRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ["clubId", "groupId", "userId"]);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const callingUserId = request.auth.uid;

      console.log(
        `User ${callingUserId} attempting to remove user ${userId} from group ${groupId} in club ${clubId}`,
      );

      // Validate permissions: Check if calling user has admin/coach/club-admin role
      const callingUserDoc = await admin
        .firestore()
        .collection("users")
        .doc(callingUserId)
        .get();

      if (!callingUserDoc.exists) {
        throw new HttpsError("not-found", "Calling user profile not found");
      }

      const callingUserData = callingUserDoc.data();
      const clubAccess = callingUserData?.clubAccess || [];
      const userClubAccess = clubAccess.find((c: any) => c.clubId === clubId);

      if (!userClubAccess) {
        throw new HttpsError(
          "permission-denied",
          "You do not have access to this club",
        );
      }

      // Check if user is club-admin OR has admin role in this specific group
      // Permission rules:
      // - club-admin: Can remove any member type (player, youth, coach, admin)
      // - admin (in group): Can remove players and youth players only
      // - coach: Cannot remove members
      const isClubAdmin = userClubAccess.role === "club-admin";
      const groupAccess = userClubAccess.groupAccess || [];
      const userGroupAccess = groupAccess.find(
        (g: any) => g.groupId === groupId,
      );
      const isGroupAdmin =
        userGroupAccess && userGroupAccess.roles.includes("admin");

      // First, get the member being removed to check their roles
      const groupMemberRefForCheck = admin
        .firestore()
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId)
        .collection("allMembers")
        .doc("members");

      const groupMembersDocForCheck = await groupMemberRefForCheck.get();
      if (!groupMembersDocForCheck.exists) {
        throw new HttpsError("not-found", "Group members document not found");
      }

      const membersDataForCheck = groupMembersDocForCheck.data()?.members || [];
      const memberToRemove = membersDataForCheck.find(
        (m: any) => m.userId === userId,
      );

      if (!memberToRemove) {
        throw new HttpsError("not-found", "Member not found in this group");
      }

      const memberRolesBeingRemoved = memberToRemove.roles || [];
      const isRemovingStaffRole = memberRolesBeingRemoved.some((role: string) =>
        ["admin", "coach"].includes(role),
      );

      // Permission check based on what's being removed
      if (
        isRemovingStaffRole ||
        roleToRemove === "admin" ||
        roleToRemove === "coach"
      ) {
        // Removing coach or admin - requires club-admin
        if (!isClubAdmin) {
          throw new HttpsError(
            "permission-denied",
            "Only club administrators can remove coaches and admins from groups.",
          );
        }
      } else {
        // Removing player or player-underage - requires club-admin or group admin
        if (!isClubAdmin && !isGroupAdmin) {
          throw new HttpsError(
            "permission-denied",
            "Insufficient permissions. Only club administrators and group admins can remove members from groups.",
          );
        }
      }

      console.log(
        `Permission validated for user ${callingUserId} (${isClubAdmin ? "club-admin" : "group admin"})`,
      );
      console.log(
        `Removing user ${userId} from group ${groupId} in club ${clubId}`,
      );

      // Verify group exists
      const groupRef = admin
        .firestore()
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId);

      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) {
        throw new HttpsError("not-found", "Group not found");
      }

      // Get current group allMembers document
      const groupMemberRef = admin
        .firestore()
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId)
        .collection("allMembers")
        .doc("members");

      const groupMembersDoc = await groupMemberRef.get();
      if (!groupMembersDoc.exists) {
        throw new HttpsError("not-found", "Group members document not found");
      }

      const groupMembersData = groupMembersDoc.data();
      const currentMembers = groupMembersData?.members || [];

      // Find the specific member by userId
      const memberIndex = currentMembers.findIndex(
        (member: any) => member.userId === userId,
      );
      if (memberIndex === -1) {
        return {
          success: false,
          error: "User is not a member of this group",
        };
      }

      // Get the member's data
      const member = currentMembers[memberIndex];
      const memberRoles = member.roles || [];
      const memberGuardiansContacts = member.guardiansContacts || [];

      // Determine which role(s) to remove
      let rolesToRemove: string[] = [];

      if (roleToRemove) {
        // Role-specific removal (de-accumulation pattern)
        console.log(
          `🎯 Role-specific removal: Removing '${roleToRemove}' from member ${userId}`,
        );

        // Check if member has this role
        if (!memberRoles.includes(roleToRemove)) {
          return {
            success: false,
            error: `User does not have the role '${roleToRemove}' in this group`,
          };
        }

        rolesToRemove = [roleToRemove];

        // Remove ONE instance of the specified role
        const roleIndex = memberRoles.indexOf(roleToRemove);
        member.roles = [
          ...memberRoles.slice(0, roleIndex),
          ...memberRoles.slice(roleIndex + 1),
        ];
      } else {
        // Remove ALL roles (legacy behavior for backward compatibility)
        console.log(
          `🗑️ Removing ALL roles from member ${userId} (no specific role specified)`,
        );
        rolesToRemove = [...memberRoles];
        member.roles = [];
      }

      const isRemovingYouthPlayer = rolesToRemove.includes("player-underage");
      member.lastModifiedAt = new Date();

      // Check if member should be marked inactive
      if (member.roles.length === 0) {
        member.isActive = false;
        member.inactiveSince = new Date();
        member.scheduledForDeletion = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ); // 30 days
        console.log(
          `⚠️ Member ${userId} has no roles left in group - marked as inactive`,
        );
      }

      // Update the member in the array
      currentMembers[memberIndex] = member;

      // Update the members document
      await groupMemberRef.update({
        members: currentMembers,
        lastUpdated: FieldValue.serverTimestamp(),
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp(),
      });

      console.log(
        `✅ Removed roles [${rolesToRemove.join(", ")}] from user ${userId} in group ${groupId}`,
      );

      // 🆕 CASCADE: Update member roles in all subgroups
      console.log(`Checking for subgroups to cascade removal...`);

      const subgroupsSnapshot = await groupRef.collection("subgroups").get();

      if (!subgroupsSnapshot.empty) {
        console.log(
          `Found ${subgroupsSnapshot.size} subgroups - cascading role removal`,
        );

        for (const subgroupDoc of subgroupsSnapshot.docs) {
          const subgroupId = subgroupDoc.id;
          const subgroupMemberRef = subgroupDoc.ref
            .collection("allMembers")
            .doc("members");

          const subgroupMembersDoc = await subgroupMemberRef.get();

          if (subgroupMembersDoc.exists) {
            const subgroupMembers = subgroupMembersDoc.data()?.members || [];
            const subMemberIndex = subgroupMembers.findIndex(
              (m: any) => m.userId === userId,
            );

            if (subMemberIndex >= 0) {
              if (roleToRemove) {
                // Role-specific removal: remove one instance from subgroup
                const subMemberRoles =
                  subgroupMembers[subMemberIndex].roles || [];
                const subRoleIndex = subMemberRoles.indexOf(roleToRemove);

                if (subRoleIndex > -1) {
                  subgroupMembers[subMemberIndex].roles = [
                    ...subMemberRoles.slice(0, subRoleIndex),
                    ...subMemberRoles.slice(subRoleIndex + 1),
                  ];

                  // Check if roles array is now empty
                  if (subgroupMembers[subMemberIndex].roles.length === 0) {
                    subgroupMembers[subMemberIndex].isActive = false;
                    subgroupMembers[subMemberIndex].inactiveSince = new Date();
                    subgroupMembers[subMemberIndex].scheduledForDeletion =
                      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                    console.log(
                      `  ✅ Removed role and marked inactive in subgroup ${subgroupId} (no roles left)`,
                    );
                  } else {
                    console.log(
                      `  ✅ Removed role '${roleToRemove}' in subgroup ${subgroupId}`,
                    );
                  }

                  await subgroupMemberRef.update({
                    members: subgroupMembers,
                    version: FieldValue.increment(1),
                    lastModified: FieldValue.serverTimestamp(),
                  });
                }
              } else {
                // Remove all roles and mark inactive in subgroup
                subgroupMembers[subMemberIndex].roles = [];
                subgroupMembers[subMemberIndex].isActive = false;
                subgroupMembers[subMemberIndex].inactiveSince = new Date();
                subgroupMembers[subMemberIndex].scheduledForDeletion = new Date(
                  Date.now() + 30 * 24 * 60 * 60 * 1000,
                );

                await subgroupMemberRef.update({
                  members: subgroupMembers,
                  version: FieldValue.increment(1),
                  lastModified: FieldValue.serverTimestamp(),
                });

                console.log(
                  `  ✅ Marked member inactive in subgroup ${subgroupId}`,
                );
              }
            }
          }
        }
      }

      console.log(
        `Successfully removed roles from ${userId} in group ${groupId} and all subgroups`,
      );

      // 🆕 GUARDIAN CASCADE: If removing youth player role, remove guardian roles from ALL guardians
      if (isRemovingYouthPlayer && memberGuardiansContacts.length > 0) {
        console.log(
          `👨‍👩‍👧 Youth player role removed - processing ${memberGuardiansContacts.length} guardian(s)...`,
        );

        const clubMembersRef = admin
          .firestore()
          .collection("clubs")
          .doc(clubId)
          .collection("allMembers")
          .doc("members");

        for (const guardianContact of memberGuardiansContacts) {
          try {
            const guardianUid = guardianContact.guardianUid;
            const guardianName = guardianContact.guardianName || guardianUid;

            console.log(`  → Processing guardian: ${guardianName}`);

            const clubMembersDoc = await clubMembersRef.get();

            if (clubMembersDoc.exists) {
              const clubMembers = clubMembersDoc.data()?.members || [];
              const guardianIndex = clubMembers.findIndex(
                (m: any) => m.userId === guardianUid,
              );

              if (guardianIndex >= 0) {
                let guardianRoles = clubMembers[guardianIndex].roles || [];
                const guardianRoleIndex = guardianRoles.indexOf("guardian");

                if (guardianRoleIndex > -1) {
                  // Remove ONE instance of 'guardian'
                  guardianRoles = [
                    ...guardianRoles.slice(0, guardianRoleIndex),
                    ...guardianRoles.slice(guardianRoleIndex + 1),
                  ];
                  clubMembers[guardianIndex].roles = guardianRoles;
                  clubMembers[guardianIndex].lastModifiedAt = new Date();

                  console.log(
                    `    ✅ Removed 'guardian' role from ${guardianName}`,
                  );

                  // Check if guardian now has empty roles → mark inactive
                  if (guardianRoles.length === 0) {
                    clubMembers[guardianIndex].isActive = false;
                    clubMembers[guardianIndex].inactiveSince = new Date();
                    clubMembers[guardianIndex].scheduledForDeletion = new Date(
                      Date.now() + 30 * 24 * 60 * 60 * 1000,
                    ); // 30 days
                    console.log(
                      `    ⚠️ Guardian ${guardianName} has no roles left - marked as inactive`,
                    );

                    // Also update guardian's user document
                    try {
                      const guardianUserRef = admin
                        .firestore()
                        .collection("users")
                        .doc(guardianUid);
                      const guardianUserDoc = await guardianUserRef.get();

                      if (guardianUserDoc.exists) {
                        const guardianData = guardianUserDoc.data();
                        const guardianClubAccess =
                          guardianData?.clubAccess || [];
                        const guardianClubIndex = guardianClubAccess.findIndex(
                          (c: any) => c.clubId === clubId,
                        );

                        if (guardianClubIndex >= 0) {
                          guardianClubAccess[guardianClubIndex].isActive =
                            false;
                          guardianClubAccess[guardianClubIndex].inactiveSince =
                            new Date();

                          await guardianUserRef.update({
                            clubAccess: guardianClubAccess,
                            lastModifiedAt:
                              FieldValue.serverTimestamp(),
                          });

                          console.log(
                            `    ✅ Guardian user document updated - marked inactive in club`,
                          );
                        }
                      }
                    } catch (guardianUserError) {
                      console.warn(
                        `    ⚠️ Failed to update guardian user document:`,
                        guardianUserError,
                      );
                    }
                  }

                  // Update club members document
                  await clubMembersRef.update({
                    members: clubMembers,
                    version: FieldValue.increment(1),
                    lastModified: FieldValue.serverTimestamp(),
                  });
                }
              }
            }
          } catch (guardianError) {
            console.error(
              `  ❌ Error processing guardian ${guardianContact.guardianName}:`,
              guardianError,
            );
            // Don't fail entire operation if one guardian update fails
          }
        }
      }

      // 🆕 UPDATE: Update user document
      try {
        const userRef = admin.firestore().collection("users").doc(userId);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
          const userData = userDoc.data();
          const clubAccess = userData?.clubAccess || [];
          const clubIndex = clubAccess.findIndex(
            (c: any) => c.clubId === clubId,
          );

          if (clubIndex >= 0) {
            const groupAccess = clubAccess[clubIndex].groupAccess || [];
            const groupAccessIndex = groupAccess.findIndex(
              (g: any) => g.groupId === groupId,
            );

            if (groupAccessIndex >= 0) {
              // Update roles in user's groupAccess
              if (roleToRemove) {
                // Role-specific removal: remove one instance from user's groupAccess roles
                const userGroupRoles =
                  groupAccess[groupAccessIndex].roles || [];
                const userRoleIndex = userGroupRoles.indexOf(roleToRemove);

                if (userRoleIndex > -1) {
                  groupAccess[groupAccessIndex].roles = [
                    ...userGroupRoles.slice(0, userRoleIndex),
                    ...userGroupRoles.slice(userRoleIndex + 1),
                  ];

                  // If no roles left, remove the group entry and mark inactive
                  if (groupAccess[groupAccessIndex].roles.length === 0) {
                    clubAccess[clubIndex].groupAccess = groupAccess.filter(
                      (g: any) => g.groupId !== groupId,
                    );
                    console.log(
                      `✅ Removed group from user's groupAccess (no roles remaining)`,
                    );
                  } else {
                    clubAccess[clubIndex].groupAccess = groupAccess;
                    console.log(
                      `✅ Removed role '${roleToRemove}' from user's groupAccess`,
                    );
                  }
                }
              } else {
                // Remove ALL roles: remove group from clubAccess[].groupAccess[]
                clubAccess[clubIndex].groupAccess = groupAccess.filter(
                  (g: any) => g.groupId !== groupId,
                );
                console.log(
                  `✅ Removed group from user's clubAccess[].groupAccess[]`,
                );
              }

              await userRef.update({
                clubAccess,
                lastModifiedAt: FieldValue.serverTimestamp(),
              });
            }

            // 🆕 GUARDIAN DEPENDENT SYNC: Update guardian's dependents array if youth member
            const youthGuardians = userData?.guardians || [];
            if (youthGuardians.length > 0) {
              console.log(
                `👨‍👩‍👧 Youth member detected - syncing clubAccess with ${youthGuardians.length} guardian(s)...`,
              );

              // Get youth's current clubAccess (freshly updated)
              const updatedUserDoc = await userRef.get();
              const updatedClubAccess = updatedUserDoc.exists
                ? updatedUserDoc.data()?.clubAccess || []
                : [];

              for (const guardian of youthGuardians) {
                try {
                  const guardianUid = guardian.guardianUid || guardian.uid;
                  const guardianName =
                    guardian.guardianName || guardian.name || guardianUid;

                  console.log(`  → Syncing with guardian: ${guardianName}`);

                  const guardianRef = admin
                    .firestore()
                    .collection("users")
                    .doc(guardianUid);
                  const guardianDoc = await guardianRef.get();

                  if (guardianDoc.exists) {
                    const guardianData = guardianDoc.data();
                    const dependents = guardianData?.dependents || [];

                    // Find this youth in guardian's dependents array
                    const dependentIndex = dependents.findIndex(
                      (dep: any) => dep.uid === userId,
                    );

                    if (dependentIndex >= 0) {
                      // Update the dependent's clubAccess with youth's current clubAccess
                      dependents[dependentIndex] = {
                        ...dependents[dependentIndex],
                        clubAccess: updatedClubAccess,
                      };

                      await guardianRef.update({
                        dependents: dependents,
                        version: FieldValue.increment(1),
                        lastModified:
                          FieldValue.serverTimestamp(),
                      });

                      console.log(
                        `    ✅ Synced dependent clubAccess for guardian ${guardianName}`,
                      );
                    } else {
                      console.log(
                        `    ⚠️ Youth ${userId} not found in guardian ${guardianName}'s dependents array`,
                      );
                    }
                  } else {
                    console.log(
                      `    ⚠️ Guardian document not found: ${guardianUid}`,
                    );
                  }
                } catch (guardianSyncError) {
                  console.error(
                    `    ❌ Error syncing with guardian ${guardian.guardianName}:`,
                    guardianSyncError,
                  );
                  // Don't fail entire operation if one guardian sync fails
                }
              }
            }

            // Update club member list roles (remove ONE instance of each removed role)
            const clubMembersRef = admin
              .firestore()
              .collection("clubs")
              .doc(clubId)
              .collection("allMembers")
              .doc("members");

            const clubMembersDoc = await clubMembersRef.get();

            if (clubMembersDoc.exists) {
              const clubMembers = clubMembersDoc.data()?.members || [];
              const clubMemberIndex = clubMembers.findIndex(
                (m: any) => m.userId === userId,
              );

              if (clubMemberIndex >= 0 && rolesToRemove.length > 0) {
                let currentRoles = clubMembers[clubMemberIndex].roles || [];

                // Remove ONE instance of each role from club member list
                for (const role of rolesToRemove) {
                  const roleIndex = currentRoles.indexOf(role);
                  if (roleIndex > -1) {
                    currentRoles = [
                      ...currentRoles.slice(0, roleIndex),
                      ...currentRoles.slice(roleIndex + 1),
                    ];
                  }
                }

                clubMembers[clubMemberIndex].roles = currentRoles;
                clubMembers[clubMemberIndex].lastModifiedAt = new Date();

                // 🆕 INACTIVITY CHECK: If roles array is empty, mark member as inactive
                if (currentRoles.length === 0) {
                  clubMembers[clubMemberIndex].isActive = false;
                  clubMembers[clubMemberIndex].inactiveSince = new Date();
                  clubMembers[clubMemberIndex].scheduledForDeletion = new Date(
                    Date.now() + 30 * 24 * 60 * 60 * 1000,
                  ); // 30 days
                  console.log(
                    `⚠️ Member ${userId} has no roles left - marked as inactive in club member list`,
                  );

                  // Also mark inactive in user document (per-club)
                  if (clubIndex >= 0) {
                    clubAccess[clubIndex].isActive = false;
                    clubAccess[clubIndex].inactiveSince = new Date();

                    await userRef.update({
                      clubAccess,
                      lastModifiedAt:
                        FieldValue.serverTimestamp(),
                    });

                    console.log(
                      `⚠️ Member ${userId} marked as inactive in user document for club ${clubId}`,
                    );
                  }
                }

                await clubMembersRef.update({
                  members: clubMembers,
                  version: FieldValue.increment(1),
                  lastModified: FieldValue.serverTimestamp(),
                });

                console.log(
                  `✅ Removed roles [${memberRoles.join(", ")}] from club member list`,
                );
              }
            }
          }
        }
      } catch (userUpdateError) {
        console.warn(
          "⚠️ Failed to update user document or club member list:",
          userUpdateError,
        );
        // Don't fail the entire operation if user update fails
      }

      return {
        success: true,
        message: `Member removed from group and all subgroups successfully`,
      };
    } catch (error) {
      console.error("Error in removeMemberFromGroup:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to remove member from group");
    }
  },
);
