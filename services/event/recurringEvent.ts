// ===============================================================================
// FILE PURPOSE: Recurring Event Service
// ===============================================================================
// Handles recurring event creation and editing via Cloud Functions
// Supports pre-generated occurrences with scope-based modifications

import { httpsCallable } from "firebase/functions";
import { functions } from "../core/firebase";

// ===============================================================================
// TYPESCRIPT INTERFACES
// ===============================================================================

export interface CreateRecurringEventRequest {
  clubId: string;
  clubName: string;
  title: string;
  description?: string;
  eventType: "training" | "match" | "meeting" | "other";
  location: string;

  // Timing for the first occurrence
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  gatheringTime?: string;

  // Recurrence settings
  frequency: "weekly" | "biweekly" | "monthly";
  endType: "date" | "occurrences";
  seriesEndDate?: string;
  occurrenceCount?: number;

  // Targeting
  targetScope: {
    level: "club" | "group" | "subgroup";
    groupId?: string;
    groupName?: string;
    subgroupId?: string;
    subgroupName?: string;
  };
  roleFilter?: (
    | "player"
    | "player-underage"
    | "coach"
    | "admin"
    | "guardian"
    | "club-admin"
  )[];
  selectedMemberIds?: string[];
  capacityLimit?: number;
  responseDeadline?: string;

  // Creator info
  createdBy: string;
  createdByName: string;
}

export interface CreateRecurringEventResponse {
  success: boolean;
  recurringEventId?: string;
  occurrenceEventIds?: string[];
  totalOccurrences?: number;
  totalRecipients?: number;
  message?: string;
  error?: string;
}

export interface EditRecurringEventRequest {
  clubId: string;
  eventId: string;
  recurringEventId: string;
  scope: "single" | "future";

  // Updated fields (only include what changed)
  title?: string;
  description?: string;
  eventType?: "training" | "match" | "meeting" | "other";
  location?: string;
  startTime?: string;
  endTime?: string;
  gatheringTime?: string | null;
  capacityLimit?: number | null;
  responseDeadline?: string | null;
}

export interface EditRecurringEventResponse {
  success: boolean;
  updatedCount?: number;
  error?: string;
}

// ===============================================================================
// RECURRING EVENT SERVICE
// ===============================================================================

export const recurringEventService = {
  /**
   * Create a recurring event series with pre-generated occurrences
   *
   * @param request - Full recurring event creation request
   * @returns Promise with recurring event ID and all occurrence IDs
   */
  async createRecurringEvent(
    request: CreateRecurringEventRequest,
  ): Promise<CreateRecurringEventResponse> {
    try {
      console.log(
        "📅 Creating recurring event:",
        request.title,
        `(${request.frequency})`,
      );

      const createRecurringEventFn = httpsCallable(
        functions,
        "createRecurringEvent",
      );
      const result = await createRecurringEventFn(request);

      const response = result.data as CreateRecurringEventResponse;

      if (response.success) {
        console.log(
          `✅ Recurring event created: ${response.recurringEventId} with ${response.totalOccurrences} occurrences`,
        );
      } else {
        console.error("❌ Recurring event creation failed:", response.error);
      }

      return response;
    } catch (error: any) {
      console.error("❌ Error creating recurring event:", error);
      return {
        success: false,
        error: error.message || "Failed to create recurring event",
      };
    }
  },

  /**
   * Edit one or more occurrences of a recurring event
   *
   * @param request - Edit request with scope ("single" or "future")
   * @returns Promise with number of updated occurrences
   */
  async editRecurringEvent(
    request: EditRecurringEventRequest,
  ): Promise<EditRecurringEventResponse> {
    try {
      console.log(
        `✏️ Editing recurring event (scope: ${request.scope}):`,
        request.eventId,
      );

      const editRecurringEventFn = httpsCallable(
        functions,
        "editRecurringEvent",
      );
      const result = await editRecurringEventFn(request);

      const response = result.data as EditRecurringEventResponse;

      if (response.success) {
        console.log(
          `✅ Recurring event edited: ${response.updatedCount} occurrence(s) updated`,
        );
      } else {
        console.error("❌ Recurring event edit failed:", response.error);
      }

      return response;
    } catch (error: any) {
      console.error("❌ Error editing recurring event:", error);
      return {
        success: false,
        error: error.message || "Failed to edit recurring event",
      };
    }
  },
};
