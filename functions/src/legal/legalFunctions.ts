import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

/**
 * Record Legal Acceptance
 *
 * Records user acceptance of Terms of Service and Privacy Policy.
 * Creates an audit record in /legal_acceptances and updates user document.
 */

export interface RecordLegalAcceptanceRequest {
  termsVersion: string;
  privacyVersion: string;
  acceptanceMethod: "signup" | "login_re-acceptance" | "app_prompt";
  clientInfo: {
    platform: "ios" | "android" | "web";
    appVersion: string;
  };
}

export interface RecordLegalAcceptanceResponse {
  success: boolean;
  acceptanceId?: string;
  error?: string;
}

export const recordLegalAcceptance = onCall(
  {
    region: config.region,
  },
  async (request): Promise<RecordLegalAcceptanceResponse> => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;
      const {
        termsVersion,
        privacyVersion,
        acceptanceMethod,
        clientInfo,
      }: RecordLegalAcceptanceRequest = request.data;

      // Validate required fields
      if (!termsVersion || !privacyVersion) {
        throw new HttpsError(
          "invalid-argument",
          "Terms version and privacy version are required",
        );
      }

      if (!acceptanceMethod) {
        throw new HttpsError(
          "invalid-argument",
          "Acceptance method is required",
        );
      }

      if (!clientInfo?.platform || !clientInfo?.appVersion) {
        throw new HttpsError(
          "invalid-argument",
          "Client info (platform and appVersion) is required",
        );
      }

      const db = admin.firestore();
      const now = admin.firestore.FieldValue.serverTimestamp();

      // Create acceptance record in /legal_acceptances
      const acceptanceRef = db.collection("legal_acceptances").doc();
      const acceptanceId = acceptanceRef.id;

      const acceptanceRecord = {
        acceptanceId,
        userId,
        termsVersion,
        privacyVersion,
        acceptedAt: now,
        acceptanceMethod,
        clientInfo: {
          platform: clientInfo.platform,
          appVersion: clientInfo.appVersion,
        },
      };

      // Batch write: acceptance record + user document update
      const batch = db.batch();

      // 1. Create acceptance audit record
      batch.set(acceptanceRef, acceptanceRecord);

      // 2. Update user document with current acceptance
      const userRef = db.collection("users").doc(userId);
      batch.update(userRef, {
        acceptedTermsVersion: termsVersion,
        acceptedPrivacyVersion: privacyVersion,
        legalAcceptedAt: now,
      });

      await batch.commit();

      console.log(
        `✅ Legal acceptance recorded for user ${userId}: Terms ${termsVersion}, Privacy ${privacyVersion}`,
      );

      return {
        success: true,
        acceptanceId,
      };
    } catch (error) {
      console.error("Error recording legal acceptance:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError("internal", "Failed to record legal acceptance");
    }
  },
);

/**
 * Get Legal Config
 *
 * Retrieves the current legal configuration from /config/legal.
 * This is a public function - no authentication required for reading legal config.
 */
export const getLegalConfig = onCall(
  {
    region: config.region,
  },
  async (): Promise<{
    success: boolean;
    config?: {
      currentTermsVersion: string;
      currentPrivacyVersion: string;
      termsLastUpdated: any;
      privacyLastUpdated: any;
      termsEffectiveDate: any;
      privacyEffectiveDate: any;
      materialChangesSummary: string | null;
    };
    error?: string;
  }> => {
    try {
      const db = admin.firestore();
      const configDoc = await db.collection("config").doc("legal").get();

      if (!configDoc.exists) {
        // Return default config if document doesn't exist yet
        // This allows the app to function before legal config is set up
        console.warn("Legal config document not found, returning defaults");
        return {
          success: true,
          config: {
            currentTermsVersion: "TERMS_2026.1",
            currentPrivacyVersion: "PRIVACY_2026.1",
            termsLastUpdated: null,
            privacyLastUpdated: null,
            termsEffectiveDate: null,
            privacyEffectiveDate: null,
            materialChangesSummary: null,
          },
        };
      }

      const data = configDoc.data();

      return {
        success: true,
        config: {
          currentTermsVersion: data?.currentTermsVersion || "TERMS_2026.1",
          currentPrivacyVersion:
            data?.currentPrivacyVersion || "PRIVACY_2026.1",
          termsLastUpdated: data?.termsLastUpdated || null,
          privacyLastUpdated: data?.privacyLastUpdated || null,
          termsEffectiveDate: data?.termsEffectiveDate || null,
          privacyEffectiveDate: data?.privacyEffectiveDate || null,
          materialChangesSummary: data?.materialChangesSummary || null,
        },
      };
    } catch (error) {
      console.error("Error getting legal config:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError("internal", "Failed to get legal configuration");
    }
  },
);
