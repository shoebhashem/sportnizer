/**
 * Legal Service Type Definitions
 *
 * TypeScript interfaces for legal document acceptance and version management.
 */

import { Timestamp } from "firebase/firestore";

/**
 * Legal configuration stored in /config/legal
 */
export interface LegalConfig {
  // Current versions
  currentTermsVersion: string;
  currentPrivacyVersion: string;

  // Timestamps
  termsLastUpdated: Timestamp;
  privacyLastUpdated: Timestamp;
  termsEffectiveDate: Timestamp;
  privacyEffectiveDate: Timestamp;

  // Material changes summary (shown on re-acceptance)
  materialChangesSummary: string | null;
}

/**
 * Legal acceptance record stored in /legal_acceptances/{acceptanceId}
 */
export interface LegalAcceptanceRecord {
  acceptanceId: string;
  userId: string;
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: Timestamp;
  acceptanceMethod: "signup" | "login_re-acceptance" | "app_prompt";
  clientInfo: {
    platform: "ios" | "android" | "web";
    appVersion: string;
  };
}

/**
 * User's legal acceptance status (stored in user document)
 */
export interface UserLegalAcceptance {
  acceptedTermsVersion: string | null;
  acceptedPrivacyVersion: string | null;
  legalAcceptedAt: Timestamp | null;
}

/**
 * Result of version check
 */
export interface VersionCheckResult {
  requiresAcceptance: boolean;
  termsOutdated: boolean;
  privacyOutdated: boolean;
  neverAccepted: boolean;
  materialChangesSummary: string | null;
  currentTermsVersion: string;
  currentPrivacyVersion: string;
}

/**
 * Input for recording legal acceptance
 */
export interface RecordAcceptanceInput {
  termsVersion: string;
  privacyVersion: string;
  acceptanceMethod: "signup" | "login_re-acceptance" | "app_prompt";
  platform: "ios" | "android" | "web";
  appVersion: string;
}

/**
 * Response from recording legal acceptance
 */
export interface RecordAcceptanceResponse {
  success: boolean;
  acceptanceId?: string;
  error?: string;
}
