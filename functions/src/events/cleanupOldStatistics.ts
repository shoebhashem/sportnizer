import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

/**
 * Scheduled function to cleanup old statistics documents
 *
 * Runs: Monthly (1st day of each month at 2 AM UTC)
 * Target: Statistics documents older than 3 years
 * Action: Archives or deletes old statistics to save storage costs
 *
 * Example: In Jan 2026, archives statistics from 2022 and earlier
 *
 * Cost Savings:
 * - Reduces document count and storage costs
 * - Improves query performance
 * - Estimated savings: ~$0.50/year per group
 */
export const cleanupOldStatistics = onSchedule(
  {
    schedule: "0 2 1 * *", // Run at 2 AM UTC on the 1st of every month
    timeZone: "UTC",
    region: "europe-west1", // Cloud Scheduler doesn't support europe-north1, using europe-west1 instead
    memory: "256MiB",
    timeoutSeconds: 540, // 9 minutes
  },
  async (event) => {
    const db = admin.firestore();

    console.log("🧹 Starting cleanup of old statistics documents...");

    try {
      // Calculate cutoff year (3 years ago)
      const currentYear = new Date().getFullYear();
      const cutoffYear = currentYear - 3;

      console.log(
        `📅 Current year: ${currentYear}, Cutoff year: ${cutoffYear}`,
      );

      // Query all clubs
      const clubsSnapshot = await db.collection("clubs").get();

      let totalDeleted = 0;
      let totalErrors = 0;

      // Process each club
      for (const clubDoc of clubsSnapshot.docs) {
        const clubId = clubDoc.id;
        console.log(`  🏛️ Processing club: ${clubId}`);

        // Query all groups in this club
        const groupsSnapshot = await db
          .collection("clubs")
          .doc(clubId)
          .collection("groups")
          .get();

        // Process each group
        for (const groupDoc of groupsSnapshot.docs) {
          const groupId = groupDoc.id;
          console.log(`    👥 Processing group: ${groupId}`);

          // Query statistics subcollection
          const statisticsSnapshot = await db
            .collection("clubs")
            .doc(clubId)
            .collection("groups")
            .doc(groupId)
            .collection("statistics")
            .get();

          // Delete old statistics documents
          for (const statsDoc of statisticsSnapshot.docs) {
            const year = parseInt(statsDoc.id, 10);

            if (year <= cutoffYear) {
              try {
                await statsDoc.ref.delete();
                totalDeleted++;
                console.log(`      🗑️ Deleted statistics for year ${year}`);
              } catch (error: any) {
                totalErrors++;
                console.error(
                  `      ❌ Error deleting statistics for year ${year}:`,
                  error.message,
                );
              }
            }
          }
        }
      }

      console.log(
        `✅ Cleanup complete: ${totalDeleted} documents deleted, ${totalErrors} errors`,
      );
    } catch (error: any) {
      console.error("❌ Error in cleanupOldStatistics:", error);
    }
  },
);
