// ===============================================================================
// FILE PURPOSE: News Creation Service
// ===============================================================================
// Handles news creation with createNews backend function
// Supports role filtering, email delivery, and youth member handling

import { httpsCallable } from "firebase/functions";
import { functions } from "../core/firebase";

// ===============================================================================
// TYPESCRIPT INTERFACES
// ===============================================================================

export interface CreateNewsRequest {
  // Club context
  clubId: string;
  clubName: string;

  // News content
  title: string;
  description: string;

  // Targeting
  targetScope: {
    level: "club" | "group" | "subgroup";
    groupId?: string;
    groupName?: string;
    subgroupId?: string;
    subgroupName?: string;
  };

  // Optional filters
  roleFilter?: (
    | "player"
    | "player-underage"
    | "coach"
    | "admin"
    | "guardian"
    | "club-admin"
  )[];

  // Email delivery
  sendEmail?: boolean;

  // Creator info
  createdBy: string;
  createdByName: string;
}

export interface CreateNewsResponse {
  success: boolean;
  newsId?: string;
  totalRecipients?: number;
  emailsSent?: number;
  emailsFailed?: number;
  message?: string;
  error?: string;
}

// ===============================================================================
// NEWS CREATION SERVICE
// ===============================================================================

export const newsCreationService = {
  /**
   * Create news using createNews backend function
   * Handles role filtering, email delivery, and youth member notification routing
   */
  async createNews(request: CreateNewsRequest): Promise<CreateNewsResponse> {
    try {
      console.log("📰 Creating news via createNews:", request.title);

      // Call backend function
      const createNewsFn = httpsCallable(functions, "createNews");
      const result = await createNewsFn(request);

      const response = result.data as CreateNewsResponse;

      if (response.success) {
        console.log(`✅ News created successfully: ${response.newsId}`);
        console.log(
          `📤 Notifications sent to ${response.totalRecipients} recipients`,
        );
        if (response.emailsSent !== undefined) {
          console.log(`📧 Emails sent: ${response.emailsSent}`);
        }
      } else {
        console.error("❌ News creation failed:", response.error);
      }

      return response;
    } catch (error: any) {
      console.error("❌ Error calling createNews:", error);
      return {
        success: false,
        error: error.message || "Failed to create news",
      };
    }
  },
};
