import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { createNotificationDirect } from "../notifications/createNotification";
import { buildPendingNotificationJobs } from "../utils/notificationHelpers";

/**
 * Daily scheduled function that sends two types of event notifications:
 *
 *  1. 24-hour event reminders
 *     Finds events starting within the next 25 hours (slight buffer for clock
 *     drift) where `notificationSentAt` has not yet been set.
 *     Sends a reminder push/in-app notification to every pending invitee.
 *     Sets `notificationSentAt` on the event document afterwards (idempotency).
 *
 *  2. Response-deadline nudges
 *     Finds events whose `responseDeadline` falls within the next 25 hours
 *     where `deadlineReminderSentAt` has not yet been set.
 *     Sends a "please RSVP" push/in-app notification to every pending invitee.
 *     Sets `deadlineReminderSentAt` on the event document afterwards (idempotency).
 *
 * Design notes:
 *  - Both checks apply the pending-gate (only `response === "pending"` invitees).
 *  - Youth members: notification is sent to each guardian (not the youth directly).
 *  - The 25-hour window at 06:00 UTC covers events starting before 07:00 the
 *    next calendar day, which catches Swedish afternoon/evening sports events.
 *  - Running the function twice in the same day is safe because of the
 *    `notificationSentAt` / `deadlineReminderSentAt` idempotency guards.
 *  - Cloud Scheduler requires a supported region — europe-west1 is used here
 *    (same as the other scheduled functions in this project).
 */
export const sendDailyEventNotifications = onSchedule(
  {
    schedule: "0 6 * * *", // Every day at 06:00 UTC
    timeZone: "UTC",
    region: "europe-west1", // Cloud Scheduler supported region
    timeoutSeconds: 540,
  },
  async () => {
    const db = admin.firestore();
    const now = new Date();
    // 25-hour window (slight buffer for clock drift / function startup latency)
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const nowTs = Timestamp.fromDate(now);
    const windowEndTs = Timestamp.fromDate(windowEnd);

    let totalEventReminders = 0;
    let totalDeadlineNudges = 0;

    console.log(
      `🔔 Daily event notifications starting. Window: ${now.toISOString()} → ${windowEnd.toISOString()}`,
    );

    // Fetch all clubs once; iterate per club for subcollection queries
    const clubsSnapshot = await db.collection("clubs").get();
    console.log(`📋 Processing ${clubsSnapshot.size} club(s)`);

    for (const clubDoc of clubsSnapshot.docs) {
      const clubId = clubDoc.id;

      // ========================================================================
      // CHECK 1: Event reminders (startDate within next 25 h)
      // ========================================================================
      const upcomingSnap = await db
        .collection("clubs")
        .doc(clubId)
        .collection("events")
        .where("startDate", ">=", nowTs)
        .where("startDate", "<=", windowEndTs)
        .where("status", "==", "scheduled")
        .get();

      for (const eventDoc of upcomingSnap.docs) {
        const event = eventDoc.data();

        // Idempotency: skip if already notified
        if (event.notificationSentAt) continue;

        const startDateStr = event.startDate?.toDate
          ? event.startDate.toDate().toLocaleDateString()
          : new Date(event.startDate).toLocaleDateString();

        const jobs = buildPendingNotificationJobs(
          event.responses || [],
          event.title,
          startDateStr,
        );

        if (jobs.length > 0) {
          await Promise.all(
            jobs.map(async (job) => {
              try {
                await createNotificationDirect(job.targetUserId, {
                  type: "event",
                  title: `Reminder: ${event.title}`,
                  message: job.message,
                  sourceId: eventDoc.id,
                  sourceCollection: "events",
                  clubId,
                  clubName: event.targetScope?.clubName || "",
                  ...(event.targetScope?.groupId && {
                    groupId: event.targetScope.groupId,
                  }),
                  ...(event.targetScope?.groupName && {
                    groupName: event.targetScope.groupName,
                  }),
                  priority: "normal",
                  actionUrl: `/event-details?eventId=${eventDoc.id}&clubId=${clubId}&inviteeUserId=${job.inviteeUserId}&inviteeName=${encodeURIComponent(job.inviteeName)}`,
                });
              } catch (err: any) {
                console.error(
                  `⚠️ Event reminder failed for user ${job.targetUserId} (event ${eventDoc.id}):`,
                  err.message,
                );
              }
            }),
          );
        }

        // Always write idempotency guard — even when there were no pending invitees
        await eventDoc.ref.update({
          notificationSentAt: FieldValue.serverTimestamp(),
        });
        totalEventReminders++;
      }

      // ========================================================================
      // CHECK 2: Response-deadline nudges (responseDeadline within next 25 h)
      // ========================================================================
      const deadlineSnap = await db
        .collection("clubs")
        .doc(clubId)
        .collection("events")
        .where("responseDeadline", ">=", nowTs)
        .where("responseDeadline", "<=", windowEndTs)
        .where("status", "==", "scheduled")
        .get();

      for (const eventDoc of deadlineSnap.docs) {
        const event = eventDoc.data();

        // Idempotency: skip if already nudged
        if (event.deadlineReminderSentAt) continue;

        const jobs = buildPendingNotificationJobs(
          event.responses || [],
          event.title,
          event.startDate?.toDate
            ? event.startDate.toDate().toLocaleDateString()
            : new Date(event.startDate).toLocaleDateString(),
        );

        if (jobs.length > 0) {
          await Promise.all(
            jobs.map(async (job) => {
              try {
                await createNotificationDirect(job.targetUserId, {
                  type: "event",
                  title: `RSVP Reminder: ${event.title}`,
                  message: `Please respond to ${event.title} — your RSVP deadline is approaching`,
                  sourceId: eventDoc.id,
                  sourceCollection: "events",
                  clubId,
                  clubName: event.targetScope?.clubName || "",
                  ...(event.targetScope?.groupId && {
                    groupId: event.targetScope.groupId,
                  }),
                  ...(event.targetScope?.groupName && {
                    groupName: event.targetScope.groupName,
                  }),
                  priority: "high",
                  actionUrl: `/event-details?eventId=${eventDoc.id}&clubId=${clubId}&inviteeUserId=${job.inviteeUserId}&inviteeName=${encodeURIComponent(job.inviteeName)}`,
                });
              } catch (err: any) {
                console.error(
                  `⚠️ Deadline nudge failed for user ${job.targetUserId} (event ${eventDoc.id}):`,
                  err.message,
                );
              }
            }),
          );
        }

        await eventDoc.ref.update({
          deadlineReminderSentAt: FieldValue.serverTimestamp(),
        });
        totalDeadlineNudges++;
      }
    }

    console.log(
      `✅ Daily event notifications complete: ${totalEventReminders} event reminders, ${totalDeadlineNudges} deadline nudges`,
    );
  },
);
