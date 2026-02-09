// ===============================================================================
// FILE PURPOSE: Event Creation Service
// ===============================================================================
// Handles event creation with createEventV2 backend function
// Supports role filtering and youth member handling

import { httpsCallable } from "firebase/functions";
import { functions } from "../core/firebase";

// ===============================================================================
// TYPESCRIPT INTERFACES
// ===============================================================================

export interface CreateEventV2Request {
  // Club context (required at top level for validation)
  clubId: string;
  clubName: string;

  // Event basic info
  title: string;
  description?: string;
  eventType: "training" | "match" | "meeting" | "other";

  // Timing
  startDate: string; // ISO format date string
  startTime: string; // ISO format datetime string
  endDate?: string; // ISO format date string (optional)
  endTime?: string; // ISO format datetime string (optional)
  gatheringTime?: string; // ISO format datetime string (optional)

  // Location
  location: string;

  // Targeting
  targetScope: {
    level: "club" | "group" | "subgroup";
    clubId: string;
    clubName: string;
    groupId?: string;
    groupName?: string;
    subgroupId?: string;
    subgroupName?: string;
  };

  // Optional filters
  roleFilter?: ("player" | "player-underage" | "coach" | "admin")[];

  // Optional capacity
  capacityLimit?: number;

  // Optional response deadline
  responseDeadline?: string; // ISO format datetime string

  // Creator info
  createdBy: string;
  createdByName: string;
}

export interface CreateEventV2Response {
  success: boolean;
  eventId?: string;
  totalRecipients?: number;
  error?: string;
}

// ===============================================================================
// EVENT SERVICE
// ===============================================================================

export const eventCreationService = {
  /**
   * Create event using createEventV2 backend function
   * Handles role filtering and youth member notification routing
   */
  async createEvent(
    request: CreateEventV2Request,
  ): Promise<CreateEventV2Response> {
    try {
      console.log("🎯 Creating event via createEventV2:", request.title);

      // Call backend function
      const createEventV2Fn = httpsCallable(functions, "createEventV2");
      const result = await createEventV2Fn(request);

      const response = result.data as CreateEventV2Response;

      if (response.success) {
        console.log(`✅ Event created successfully: ${response.eventId}`);
        console.log(
          `📤 Notifications sent to ${response.totalRecipients} recipients`,
        );
      } else {
        console.error("❌ Event creation failed:", response.error);
      }

      return response;
    } catch (error: any) {
      console.error("❌ Error calling createEventV2:", error);
      return {
        success: false,
        error: error.message || "Failed to create event",
      };
    }
  },
};
