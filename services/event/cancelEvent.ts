// ===============================================================================
// FILE PURPOSE: Event Cancellation Service
// ===============================================================================
// Handles event cancellation via cancelEvent backend function
// Sends cancellation notifications to all invited users

import { httpsCallable } from "firebase/functions";
import { functions } from "../core/firebase";

// ===============================================================================
// TYPESCRIPT INTERFACES
// ===============================================================================

export interface CancelEventRequest {
  clubId: string;
  eventId: string;
  cancellationReason?: string;
  // Recurring event support
  recurringEventId?: string;
  scope?: "single" | "future";
}

export interface CancelEventResponse {
  success: boolean;
  message?: string;
  error?: string;
  cancelledCount?: number;
}

// ===============================================================================
// CANCEL EVENT SERVICE
// ===============================================================================

export const eventCancellationService = {
  /**
   * Cancel an event and notify all invitees
   *
   * @param request - Club ID, Event ID, and optional cancellation reason
   * @returns Promise with success/error
   */
  async cancelEvent(request: CancelEventRequest): Promise<CancelEventResponse> {
    try {
      console.log("🚫 Cancelling event:", request.eventId);

      const cancelEventFn = httpsCallable(functions, "cancelEvent");
      const result = await cancelEventFn(request);

      const response = result.data as CancelEventResponse;

      if (response.success) {
        console.log(`✅ Event cancelled successfully: ${request.eventId}`);
      } else {
        console.error("❌ Event cancellation failed:", response.error);
      }

      return response;
    } catch (error: any) {
      console.error("❌ Error cancelling event:", error);
      return {
        success: false,
        error: error.message || "Failed to cancel event",
      };
    }
  },
};
