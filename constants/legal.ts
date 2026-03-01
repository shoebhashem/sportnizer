/**
 * Legal Document Version Constants
 *
 * These constants define the current versions of legal documents.
 * When legal documents are updated, increment the version number here
 * and update the /config/legal document in Firestore.
 */

// Current legal document versions
export const CURRENT_TERMS_VERSION = "TERMS_2026.1";
export const CURRENT_PRIVACY_VERSION = "PRIVACY_2026.1";

// Legal document URLs (public, no authentication required)
export const LEGAL_URLS = {
  termsOfService: "https://clubnizer.com/legal/terms",
  privacyPolicy: "https://clubnizer.com/legal/privacy",
  // Fallback URLs during development (can be updated)
  termsOfServiceFallback: "/legal/terms",
  privacyPolicyFallback: "/legal/privacy",
};

// Legal document metadata
export const LEGAL_METADATA = {
  effectiveDate: "2026-02-25",
  lastUpdated: "2026-02-25",
};

// Acceptance method types
export type LegalAcceptanceMethod =
  | "signup"
  | "login_re-acceptance"
  | "app_prompt";

// Document type for combined acceptance
export type LegalDocumentType = "terms_and_privacy";
