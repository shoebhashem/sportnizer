import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

/**
 * Scheduled function that runs monthly to:
 * 1. Delete club events older than 6 months
 * 2. Delete Stripe webhook event records older than 7 days
 * 3. Delete dismissed notifications older than 30 days
 * 4. Delete read notifications older than 90 days
 * 5. Delete any notifications older than 6 months (catch-all)
 * Runs on the 1st of every month at 4 AM UTC.
 */
export const cleanupOldEvents = onSchedule(
  {
    schedule: "0 4 1 * *", // 1st of every month at 4 AM UTC
    timeZone: "UTC",
    region: "europe-west1", // Cloud Scheduler supported region
  },
  async () => {
    const db = admin.firestore();
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(sixMonthsAgo);

    console.log(
      `🗑️ Starting cleanup of events older than ${sixMonthsAgo.toISOString()}`,
    );

    let totalEventsDeleted = 0;
    let clubsProcessed = 0;
    const errors: string[] = [];

    try {
      const clubsSnapshot = await db.collection("clubs").get();
      console.log(`📋 Found ${clubsSnapshot.size} clubs to process`);

      for (const clubDoc of clubsSnapshot.docs) {
        const clubId = clubDoc.id;

        try {
          const oldEventsSnapshot = await db
            .collection("clubs")
            .doc(clubId)
            .collection("events")
            .where("startDate", "<", cutoffTimestamp)
            .get();

          if (oldEventsSnapshot.empty) {
            clubsProcessed++;
            continue;
          }

          // Batch delete (Firestore supports up to 500 per batch)
          const batches: admin.firestore.WriteBatch[] = [];
          let currentBatch = db.batch();
          let operationCount = 0;

          for (const eventDoc of oldEventsSnapshot.docs) {
            currentBatch.delete(eventDoc.ref);
            operationCount++;

            if (operationCount === 500) {
              batches.push(currentBatch);
              currentBatch = db.batch();
              operationCount = 0;
            }
          }

          if (operationCount > 0) {
            batches.push(currentBatch);
          }

          for (const batch of batches) {
            await batch.commit();
          }

          totalEventsDeleted += oldEventsSnapshot.size;
          clubsProcessed++;
          console.log(
            `✅ Deleted ${oldEventsSnapshot.size} old events from club ${clubId}`,
          );
        } catch (clubError) {
          console.error(
            `❌ Error cleaning events for club ${clubId}:`,
            clubError,
          );
          errors.push(`Club ${clubId}: ${clubError}`);
        }
      }

      console.log(`✅ Event cleanup complete:
        - Clubs processed: ${clubsProcessed}
        - Events deleted: ${totalEventsDeleted}
        - Errors: ${errors.length}
      `);

      if (errors.length > 0) {
        console.error("❌ Errors encountered:", errors);
      }

      // 2. Cleanup old Stripe webhook event records (older than 7 days)
      console.log("🔍 Cleaning up old Stripe event records...");
      let stripeEventsDeleted = 0;

      try {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const stripeCutoff = admin.firestore.Timestamp.fromDate(sevenDaysAgo);

        const oldStripeEventsSnapshot = await db
          .collection("stripeEvents")
          .where("processedAt", "<", stripeCutoff)
          .get();

        if (!oldStripeEventsSnapshot.empty) {
          const batches: admin.firestore.WriteBatch[] = [];
          let currentBatch = db.batch();
          let operationCount = 0;

          for (const doc of oldStripeEventsSnapshot.docs) {
            currentBatch.delete(doc.ref);
            operationCount++;

            if (operationCount === 500) {
              batches.push(currentBatch);
              currentBatch = db.batch();
              operationCount = 0;
            }
          }

          if (operationCount > 0) {
            batches.push(currentBatch);
          }

          for (const batch of batches) {
            await batch.commit();
          }

          stripeEventsDeleted = oldStripeEventsSnapshot.size;
        }

        console.log(
          `✅ Deleted ${stripeEventsDeleted} old Stripe event records`,
        );
      } catch (stripeError) {
        console.error("❌ Error cleaning Stripe events:", stripeError);
        errors.push(`Stripe events: ${stripeError}`);
      }

      // 3. Cleanup old notifications across all users
      console.log("🔔 Cleaning up old notifications...");
      let notificationsDeleted = 0;

      try {
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDayCutoff =
          admin.firestore.Timestamp.fromDate(thirtyDaysAgo);

        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const ninetyDayCutoff =
          admin.firestore.Timestamp.fromDate(ninetyDaysAgo);

        // Reuse sixMonthsAgo cutoff from event cleanup above

        // Helper: batch-delete docs from a snapshot
        const batchDeleteDocs = async (
          snapshot: admin.firestore.QuerySnapshot,
        ): Promise<number> => {
          if (snapshot.empty) return 0;

          const batches: admin.firestore.WriteBatch[] = [];
          let currentBatch = db.batch();
          let opCount = 0;

          for (const doc of snapshot.docs) {
            currentBatch.delete(doc.ref);
            opCount++;
            if (opCount === 500) {
              batches.push(currentBatch);
              currentBatch = db.batch();
              opCount = 0;
            }
          }
          if (opCount > 0) batches.push(currentBatch);

          for (const batch of batches) {
            await batch.commit();
          }
          return snapshot.size;
        };

        // 3a. Dismissed notifications older than 30 days
        const dismissedSnapshot = await db
          .collectionGroup("notifications")
          .where("dismissed", "==", true)
          .where("createdAt", "<", thirtyDayCutoff)
          .get();

        const dismissedCount = await batchDeleteDocs(dismissedSnapshot);
        notificationsDeleted += dismissedCount;
        console.log(
          `  🗑️ Deleted ${dismissedCount} dismissed notifications (>30 days)`,
        );

        // 3b. Read notifications older than 90 days
        const readSnapshot = await db
          .collectionGroup("notifications")
          .where("read", "==", true)
          .where("dismissed", "==", false)
          .where("createdAt", "<", ninetyDayCutoff)
          .get();

        const readCount = await batchDeleteDocs(readSnapshot);
        notificationsDeleted += readCount;
        console.log(`  📖 Deleted ${readCount} read notifications (>90 days)`);

        // 3c. Catch-all: any notification older than 6 months regardless of status
        const ancientSnapshot = await db
          .collectionGroup("notifications")
          .where("createdAt", "<", cutoffTimestamp)
          .get();

        const ancientCount = await batchDeleteDocs(ancientSnapshot);
        notificationsDeleted += ancientCount;
        console.log(
          `  🧹 Deleted ${ancientCount} ancient notifications (>6 months)`,
        );

        console.log(
          `✅ Notification cleanup complete: ${notificationsDeleted} total deleted`,
        );
      } catch (notifError) {
        console.error("❌ Error cleaning notifications:", notifError);
        errors.push(`Notifications: ${notifError}`);
      }
    } catch (error) {
      console.error("❌ Fatal error in event cleanup:", error);
      throw error;
    }
  },
);
