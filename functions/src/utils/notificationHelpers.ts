import { EventResponse } from "../types/interfaces";

/**
 * A resolved notification job: one push notification to send.
 *
 * For adult members: targetUserId === inviteeUserId
 * For youth members: targetUserId = guardian's UID, inviteeUserId = youth's UID
 */
export type NotificationJob = {
  /** User who will receive the push / in-app notification */
  targetUserId: string;
  /** Pre-built message string */
  message: string;
  /** The invited member (may differ from targetUserId for youth) */
  inviteeUserId: string;
  /** Display name of the invited member */
  inviteeName: string;
};

export type NotificationJobOpts = {
  /** When true the message describes a recurring series */
  isRecurring?: boolean;
  /** Number of occurrences in the series (used when isRecurring=true) */
  occurrenceCount?: number;
  /** Frequency label e.g. "weekly", "biweekly", "monthly" (used when isRecurring=true) */
  frequency?: string;
  /**
   * Override the message verb.
   * Defaults to "invited to" (creation) – pass "updated:" for edit notifications.
   */
  verb?: "invited to" | "updated:";
};

/**
 * Builds a list of notification jobs for an event, applying the pending-gate rule.
 *
 * Pending-gate: only invitees whose `response === "pending"` are notified.
 * Youth members: notifications are sent to each guardian (not the youth directly).
 *
 * @param responses   The `responses[]` array from the EventDocument
 * @param eventTitle  Title of the event
 * @param eventDateStr Human-readable date string shown in the message
 * @param opts        Optional modifiers (recurring series info, message verb)
 */
export function buildPendingNotificationJobs(
  responses: EventResponse[],
  eventTitle: string,
  eventDateStr: string,
  opts: NotificationJobOpts = {},
): NotificationJob[] {
  const { isRecurring = false, occurrenceCount, frequency, verb = "invited to" } = opts;

  const jobs: NotificationJob[] = [];

  for (const resp of responses) {
    // Pending-gate: skip anyone who has already responded
    if (resp.response !== "pending") continue;

    if (resp.isYouthMember && resp.guardianIds && resp.guardianIds.length > 0) {
      // Youth member — notify each guardian instead
      for (const guardianId of resp.guardianIds) {
        const message = isRecurring
          ? `${resp.userName || "Your child"} has been invited to ${eventTitle} (${frequency ?? "recurring"}, ${occurrenceCount ?? "multiple"} occurrences) starting ${eventDateStr}`
          : `${resp.userName || "Your child"} has been ${verb} ${eventTitle} on ${eventDateStr}`;

        jobs.push({
          targetUserId: guardianId,
          message,
          inviteeUserId: resp.userId,
          inviteeName: resp.userName || "",
        });
      }
    } else {
      // Regular adult member
      const message = isRecurring
        ? `You've been invited to ${eventTitle} (${frequency ?? "recurring"}, ${occurrenceCount ?? "multiple"} occurrences) starting ${eventDateStr}`
        : `You've been ${verb} ${eventTitle} on ${eventDateStr}`;

      jobs.push({
        targetUserId: resp.userId,
        message,
        inviteeUserId: resp.userId,
        inviteeName: resp.userName || "",
      });
    }
  }

  return jobs;
}

/**
 * Builds notification jobs for ALL invitees regardless of response status.
 * Used for edit and cancellation notifications where even accepted/declined
 * members need to know about the change.
 *
 * For youth members, notifications go to guardians (same mapping as above).
 *
 * @param responses   The `responses[]` array from the EventDocument
 * @param eventTitle  Title of the event
 * @param eventDateStr Human-readable date string shown in the message
 * @param changeDescription Short description of what changed e.g. "time or location"
 */
export function buildAllInviteesNotificationJobs(
  responses: EventResponse[],
  eventTitle: string,
  eventDateStr: string,
  changeDescription = "details",
): NotificationJob[] {
  const jobs: NotificationJob[] = [];

  for (const resp of responses) {
    if (resp.isYouthMember && resp.guardianIds && resp.guardianIds.length > 0) {
      for (const guardianId of resp.guardianIds) {
        jobs.push({
          targetUserId: guardianId,
          message: `${eventTitle} on ${eventDateStr} has been updated — ${changeDescription} may have changed`,
          inviteeUserId: resp.userId,
          inviteeName: resp.userName || "",
        });
      }
    } else {
      jobs.push({
        targetUserId: resp.userId,
        message: `${eventTitle} on ${eventDateStr} has been updated — ${changeDescription} may have changed`,
        inviteeUserId: resp.userId,
        inviteeName: resp.userName || "",
      });
    }
  }

  return jobs;
}
