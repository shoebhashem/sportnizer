/**
 * Legal Document Version Constants
 *
 * These constants define the current versions of legal documents.
 * When legal documents are updated, increment the version number here
 * and update the /config/legal document in Firestore.
 */

// Current legal document versions
export const CURRENT_TERMS_VERSION = "TERMS_2026.1";
export const CURRENT_PRIVACY_VERSION = "PRIVACY_2026.2";

// LOK-stöd consent version (personnummer collection)
export const CURRENT_LOK_CONSENT_VERSION = "LOK_CONSENT_2026.1";

// Legal document URLs (public, no authentication required)
export const LEGAL_URLS = {
  termsOfService: "https://clubnizer.com/legal/terms",
  privacyPolicy: "https://clubnizer.com/legal/privacy",
  lokConsent: "https://clubnizer.com/legal/lok-consent",
  // Fallback URLs during development (can be updated)
  termsOfServiceFallback: "/legal/terms",
  privacyPolicyFallback: "/legal/privacy",
  lokConsentFallback: "/legal/lok-consent",
};

// Legal document metadata
export const LEGAL_METADATA = {
  effectiveDate: "2026-03-01",
  lastUpdated: "2026-03-01",
  privacyChangeSummary:
    "Updated to include handling of Swedish personal identity numbers (personnummer) for LOK-stöd attendance reporting to Riksidrottsförbundet (RF).",
};

// Acceptance method types
export type LegalAcceptanceMethod =
  | "signup"
  | "login_re-acceptance"
  | "app_prompt";

// Document type for combined acceptance
export type LegalDocumentType = "terms_and_privacy";
