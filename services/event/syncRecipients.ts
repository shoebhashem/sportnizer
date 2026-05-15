// ===============================================================================
// FILE PURPOSE: Sync Event Recipients Service
// ===============================================================================
// Wraps the syncEventRecipients Cloud Function for the frontend.
// Supports preview mode (dry-run diff) and confirm mode (apply changes).

import { httpsCallable } from "firebase/functions";
import { functions } from "../core/firebase";

// ===============================================================================
// TYPESCRIPT INTERFACES
// ===============================================================================

export interface SyncMemberDiff {
  userId: string;
  userName: string;
  photoUrl: string | null;
}

export interface SyncRecipientsRequest {
  clubId: string;
  eventId: string;
  mode: "preview" | "confirm" | "manual";
  /** For recurring events – which occurrences to sync */
  scope?: "single" | "future";
  recurringEventId?: string;
  /** Required when mode is "manual" */
  newInvitedUserIds?: string[];
}

export interface SyncRecipientsResponse {
  success: boolean;
  added: SyncMemberDiff[];
  removed: SyncMemberDiff[];
  unchanged: number;
  updatedOccurrences?: number;
  message?: string;
}

// ===============================================================================
// SYNC RECIPIENTS SERVICE
// ===============================================================================

export const syncRecipientsService = {
  /**
   * Preview the diff between current event recipients and current group membership.
   * Does NOT modify any data.
   */
  async preview(
    clubId: string,
    eventId: string,
    options?: { scope?: "single" | "future"; recurringEventId?: string },
  ): Promise<SyncRecipientsResponse> {
    try {
      console.log("🔍 Previewing sync for event:", eventId);

      const syncFn = httpsCallable(functions, "syncEventRecipients");
      const result = await syncFn({
        clubId,
        eventId,
        mode: "preview",
        ...(options?.scope && { scope: options.scope }),
        ...(options?.recurringEventId && {
          recurringEventId: options.recurringEventId,
        }),
      });

      const response = result.data as SyncRecipientsResponse;
      console.log(
        `✅ Preview complete: +${response.added?.length || 0} / -${response.removed?.length || 0}`,
      );
      return response;
    } catch (error: any) {
      console.error("❌ Error previewing sync:", error);
      return {
        success: false,
        added: [],
        removed: [],
        unchanged: 0,
        message: error.message || "Failed to preview sync",
      };
    }
  },

  /**
   * Confirm and apply the sync – adds new members to the event(s) and
   * sends notifications.
   */
  async confirm(
    clubId: string,
    eventId: string,
    options?: { scope?: "single" | "future"; recurringEventId?: string },
  ): Promise<SyncRecipientsResponse> {
    try {
      console.log("🔄 Confirming sync for event:", eventId);

      const syncFn = httpsCallable(functions, "syncEventRecipients");
      const result = await syncFn({
        clubId,
        eventId,
        mode: "confirm",
        ...(options?.scope && { scope: options.scope }),
        ...(options?.recurringEventId && {
          recurringEventId: options.recurringEventId,
        }),
      });

      const response = result.data as SyncRecipientsResponse;

      if (response.success) {
        console.log(`✅ Sync confirmed: ${response.message}`);
      } else {
        console.error("❌ Sync confirmation failed:", response.message);
      }

      return response;
    } catch (error: any) {
      console.error("❌ Error confirming sync:", error);
      return {
        success: false,
        added: [],
        removed: [],
        unchanged: 0,
        message: error.message || "Failed to sync recipients",
      };
    }
  },

  /**
   * Manually update the event's recipient list to exactly the provided IDs.
   * Supports add and remove. Sends notifications to newly added users.
   */
  async manualUpdate(
    clubId: string,
    eventId: string,
    newInvitedUserIds: string[],
    options?: { scope?: "single" | "future"; recurringEventId?: string },
  ): Promise<SyncRecipientsResponse> {
    try {
      console.log("✏️ Manually updating recipients for event:", eventId);

      const syncFn = httpsCallable(functions, "syncEventRecipients");
      const result = await syncFn({
        clubId,
        eventId,
        mode: "manual",
        newInvitedUserIds,
        ...(options?.scope && { scope: options.scope }),
        ...(options?.recurringEventId && {
          recurringEventId: options.recurringEventId,
        }),
      });

      const response = result.data as SyncRecipientsResponse;
      if (response.success) {
        console.log(`✅ Manual update complete: ${response.message}`);
      } else {
        console.error("❌ Manual update failed:", response.message);
      }
      return response;
    } catch (error: any) {
      console.error("❌ Error updating recipients manually:", error);
      return {
        success: false,
        added: [],
        removed: [],
        unchanged: 0,
        message: error.message || "Failed to update recipients",
      };
    }
  },
};
