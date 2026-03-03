import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { permanentlyDeleteClub } from "../clubs/permanentlyDeleteClub";
import { permanentlyDeleteGroup } from "../groups/permanentlyDeleteGroup";

/**
 * Scheduled function that runs weekly to cleanup expired soft-deleted entities
 * Runs every Sunday at 3 AM UTC to avoid peak usage times
 * Cleans up groups, clubs, members, and user accounts that have passed their grace periods
 * Grace periods: 30 days for members, 60 days for user accounts
 * Note: Cloud Scheduler requires supported regions (us-central1, europe-west1, etc.)
 */
export const cleanupDeletedEntities = onSchedule(
  {
    schedule: "0 3 * * 0", // Every Sunday at 3 AM UTC
    timeZone: "UTC",
    region: "europe-west1", // Cloud Scheduler supported region
  },
  async () => {
    const db = admin.firestore();
    const now = Timestamp.now();

    console.log(`🗑️ Starting cleanup of deleted entities at ${now.toDate()}`);

    let groupsDeleted = 0;
    let clubsDeleted = 0;
    let groupMembersDeleted = 0;
    let clubMembersDeleted = 0;
    let usersDeleted = 0;
    let usersUpdated = 0;
    const errors: string[] = [];

    try {
      // 1. Cleanup expired groups
      console.log("🔍 Searching for expired groups...");
      const expiredGroupsSnapshot = await db
        .collectionGroup("groups")
        .where("isActive", "==", false)
        .where("deletionScheduledAt", "<=", now)
        .get();

      console.log(`Found ${expiredGroupsSnapshot.size} expired groups`);

      for (const groupDoc of expiredGroupsSnapshot.docs) {
        try {
          const clubId = groupDoc.ref.parent.parent!.id;
          const groupId = groupDoc.id;

          console.log(`Deleting group ${groupId} from club ${clubId}`);

          // Get all members before deletion
          const membersDoc = await groupDoc.ref
            .collection("allMembers")
            .doc("members")
            .get();
          const membersData = membersDoc.data();
          const memberIds =
            membersData?.members?.map((m: any) => m.userId) || [];

          // Permanently delete the group
          await permanentlyDeleteGroup(clubId, groupId);
          groupsDeleted++;

          // Update all user documents to remove the group from their groupAccess
          for (const userId of memberIds) {
            try {
              const userRef = db.collection("users").doc(userId);
              const userDoc = await userRef.get();

              if (userDoc.exists) {
                const userData = userDoc.data();

                // Remove the group from user's clubAccess[].groupAccess[]
                const updatedClubAccess = userData?.clubAccess?.map(
                  (club: any) => {
                    if (club.clubId === clubId) {
                      return {
                        ...club,
                        groupAccess:
                          club.groupAccess?.filter(
                            (g: any) => g.groupId !== groupId,
                          ) || [],
                      };
                    }
                    return club;
                  },
                );

                // Check if user should be marked inactive
                const hasActiveGroups = updatedClubAccess?.some(
                  (club: any) =>
                    club.groupAccess && club.groupAccess.length > 0,
                );

                const updateData: any = {
                  clubAccess: updatedClubAccess,
                  version: FieldValue.increment(1),
                };

                if (!hasActiveGroups && userData?.isActive !== false) {
                  updateData.isActive = false;
                  updateData.inactiveSince =
                    FieldValue.serverTimestamp();
                  console.log(
                    `Marking user ${userId} as inactive (no active groups)`,
                  );
                }

                await userRef.update(updateData);
                usersUpdated++;
              }
            } catch (userError) {
              console.error(`Error updating user ${userId}:`, userError);
              errors.push(`User update failed: ${userId}`);
            }
          }
        } catch (groupError) {
          console.error(`Error deleting group ${groupDoc.id}:`, groupError);
          errors.push(`Group deletion failed: ${groupDoc.id}`);
        }
      }

      // 2. Cleanup expired clubs
      console.log("🔍 Searching for expired clubs...");
      const expiredClubsSnapshot = await db
        .collection("clubs")
        .where("isActive", "==", false)
        .where("deletionScheduledAt", "<=", now)
        .get();

      console.log(`Found ${expiredClubsSnapshot.size} expired clubs`);

      for (const clubDoc of expiredClubsSnapshot.docs) {
        try {
          const clubId = clubDoc.id;
          console.log(`Deleting club ${clubId}`);

          // Get all club members before deletion
          const clubMembersDoc = await clubDoc.ref
            .collection("allMembers")
            .doc("members")
            .get();
          const clubMembersData = clubMembersDoc.data();
          const memberIds =
            clubMembersData?.members?.map((m: any) => m.userId) || [];

          // Permanently delete the club (cascades to all groups and subgroups)
          await permanentlyDeleteClub(clubId);
          clubsDeleted++;

          // Update all user documents to remove the club from their clubAccess
          for (const userId of memberIds) {
            try {
              const userRef = db.collection("users").doc(userId);
              const userDoc = await userRef.get();

              if (userDoc.exists) {
                const userData = userDoc.data();

                // Remove the club from user's clubAccess[]
                const updatedClubAccess =
                  userData?.clubAccess?.filter(
                    (club: any) => club.clubId !== clubId,
                  ) || [];

                const updateData: any = {
                  clubAccess: updatedClubAccess,
                  version: FieldValue.increment(1),
                };

                // Mark user inactive if no clubs remain
                if (
                  updatedClubAccess.length === 0 &&
                  userData?.isActive !== false
                ) {
                  updateData.isActive = false;
                  updateData.inactiveSince =
                    FieldValue.serverTimestamp();
                  console.log(`Marking user ${userId} as inactive (no clubs)`);
                }

                await userRef.update(updateData);
                usersUpdated++;
              }
            } catch (userError) {
              console.error(`Error updating user ${userId}:`, userError);
              errors.push(`User update failed: ${userId}`);
            }
          }
        } catch (clubError) {
          console.error(`Error deleting club ${clubDoc.id}:`, clubError);
          errors.push(`Club deletion failed: ${clubDoc.id}`);
        }
      }

      // 3. Cleanup expired group members
      console.log("🔍 Cleaning up expired group members...");
      const allClubsSnapshot = await db.collection("clubs").get();

      for (const clubDoc of allClubsSnapshot.docs) {
        const groupsSnapshot = await clubDoc.ref.collection("groups").get();

        for (const groupDoc of groupsSnapshot.docs) {
          try {
            const groupId = groupDoc.id;
            const membersDoc = await groupDoc.ref
              .collection("allMembers")
              .doc("members")
              .get();

            if (membersDoc.exists) {
              const membersData = membersDoc.data();
              const members = membersData?.members || [];

              // Find expired inactive members
              const expiredMembers = members.filter((member: any) => {
                if (!member.scheduledForDeletion || member.isActive !== false) {
                  return false;
                }

                const scheduledDate = member.scheduledForDeletion.toDate
                  ? member.scheduledForDeletion.toDate()
                  : new Date(member.scheduledForDeletion);

                return scheduledDate <= now.toDate();
              });

              if (expiredMembers.length > 0) {
                // Remove expired members from array
                const remainingMembers = members.filter(
                  (m: any) =>
                    !expiredMembers.find(
                      (expired: any) => expired.userId === m.userId,
                    ),
                );

                await membersDoc.ref.update({
                  members: remainingMembers,
                  memberCount: remainingMembers.length,
                  version: FieldValue.increment(1),
                  lastModified: FieldValue.serverTimestamp(),
                });

                groupMembersDeleted += expiredMembers.length;
                console.log(
                  `Removed ${expiredMembers.length} expired members from group ${groupId}`,
                );
              }
            }
          } catch (groupError) {
            console.error(
              `Error cleaning group ${groupDoc.id} members:`,
              groupError,
            );
            errors.push(`Group member cleanup failed: ${groupDoc.id}`);
          }
        }
      }

      // 4. Cleanup expired club members
      console.log("🔍 Cleaning up expired club members...");

      for (const clubDoc of allClubsSnapshot.docs) {
        try {
          const clubId = clubDoc.id;
          const membersDoc = await clubDoc.ref
            .collection("allMembers")
            .doc("members")
            .get();

          if (membersDoc.exists) {
            const membersData = membersDoc.data();
            const members = membersData?.members || [];

            // Find expired inactive members
            const expiredMembers = members.filter((member: any) => {
              if (!member.scheduledForDeletion || member.isActive !== false) {
                return false;
              }

              const scheduledDate = member.scheduledForDeletion.toDate
                ? member.scheduledForDeletion.toDate()
                : new Date(member.scheduledForDeletion);

              return scheduledDate <= now.toDate();
            });

            if (expiredMembers.length > 0) {
              // Remove expired members from array
              const remainingMembers = members.filter(
                (m: any) =>
                  !expiredMembers.find(
                    (expired: any) => expired.userId === m.userId,
                  ),
              );

              await membersDoc.ref.update({
                members: remainingMembers,
                memberCount: remainingMembers.length,
                version: FieldValue.increment(1),
                lastModified: FieldValue.serverTimestamp(),
              });

              clubMembersDeleted += expiredMembers.length;
              console.log(
                `Removed ${expiredMembers.length} expired members from club ${clubId}`,
              );

              // Update user documents - remove club from clubAccess[]
              for (const expiredMember of expiredMembers) {
                try {
                  const userId = expiredMember.userId;
                  const userRef = db.collection("users").doc(userId);
                  const userDoc = await userRef.get();

                  if (userDoc.exists) {
                    const userData = userDoc.data();

                    // Remove club from clubAccess
                    const updatedClubAccess =
                      userData?.clubAccess?.filter(
                        (club: any) => club.clubId !== clubId,
                      ) || [];

                    const updateData: any = {
                      clubAccess: updatedClubAccess,
                      version: FieldValue.increment(1),
                    };

                    // Check if user should be marked globally inactive
                    if (updatedClubAccess.length === 0) {
                      // Check for active dependents (guardian edge case)
                      const dependents = userData?.dependents || [];
                      const hasActiveDependents = dependents.some(
                        (dep: any) => {
                          const depClubAccess = dep.clubAccess || [];
                          return depClubAccess.length > 0;
                        },
                      );

                      // Mark inactive if no active dependents and not already inactive
                      if (
                        !hasActiveDependents &&
                        userData?.isActive !== false
                      ) {
                        updateData.isActive = false;
                        updateData.inactiveSince =
                          FieldValue.serverTimestamp();
                        updateData.scheduledForDeletion = new Date(
                          Date.now() + 60 * 24 * 60 * 60 * 1000,
                        ); // 60 days
                        console.log(
                          `Marking user ${userId} as globally inactive (no clubs, no active dependents)`,
                        );
                      }
                    }

                    await userRef.update(updateData);
                    usersUpdated++;
                  }
                } catch (userError) {
                  console.error(
                    `Error updating user ${expiredMember.userId}:`,
                    userError,
                  );
                  errors.push(`User update failed: ${expiredMember.userId}`);
                }
              }
            }
          }
        } catch (clubError) {
          console.error(
            `Error cleaning club ${clubDoc.id} members:`,
            clubError,
          );
          errors.push(`Club member cleanup failed: ${clubDoc.id}`);
        }
      }

      // 5. Cleanup expired user accounts (60-day grace period)
      console.log("🔍 Cleaning up expired user accounts...");
      const expiredUsersSnapshot = await db
        .collection("users")
        .where("isActive", "==", false)
        .get();

      for (const userDoc of expiredUsersSnapshot.docs) {
        try {
          const userId = userDoc.id;
          const userData = userDoc.data();

          // Check if scheduled for deletion and grace period passed
          if (userData?.scheduledForDeletion) {
            const scheduledDate = userData.scheduledForDeletion.toDate
              ? userData.scheduledForDeletion.toDate()
              : new Date(userData.scheduledForDeletion);

            if (scheduledDate <= now.toDate()) {
              // Verify no club memberships and no active dependents
              const clubAccess = userData?.clubAccess || [];
              const dependents = userData?.dependents || [];
              const hasActiveDependents = dependents.some((dep: any) => {
                const depClubAccess = dep.clubAccess || [];
                return depClubAccess.length > 0;
              });

              if (clubAccess.length === 0 && !hasActiveDependents) {
                console.log(
                  `Deleting user account ${userId} - inactive for 60+ days`,
                );

                // Delete from Firebase Auth
                try {
                  await admin.auth().deleteUser(userId);
                  console.log(`  ✅ Deleted from Firebase Auth`);
                } catch (authError: any) {
                  // User might not exist in Auth (youth member, already deleted, etc.)
                  if (authError.code !== "auth/user-not-found") {
                    console.error(
                      `  ⚠️ Failed to delete from Auth:`,
                      authError,
                    );
                  }
                }

                // Delete Firestore document
                await userDoc.ref.delete();
                console.log(`  ✅ Deleted user document`);

                usersDeleted++;
              } else {
                console.log(
                  `  ⏭️ Skipping user ${userId} - has active memberships or dependents`,
                );
              }
            }
          }
        } catch (userDeleteError) {
          console.error(`Error deleting user ${userDoc.id}:`, userDeleteError);
          errors.push(`User deletion failed: ${userDoc.id}`);
        }
      }

      // 6. Log summary
      console.log(`✅ Cleanup complete:
        - Groups deleted: ${groupsDeleted}
        - Clubs deleted: ${clubsDeleted}
        - Group members removed: ${groupMembersDeleted}
        - Club members removed: ${clubMembersDeleted}
        - User accounts deleted: ${usersDeleted}
        - Users updated: ${usersUpdated}
        - Errors: ${errors.length}
      `);

      if (errors.length > 0) {
        console.error("❌ Errors encountered:", errors);
      }
    } catch (error) {
      console.error("❌ Fatal error in cleanup job:", error);
      throw error;
    }
  },
);
