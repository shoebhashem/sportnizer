/**
 * Legal Service
 *
 * Handles legal document version checking, acceptance recording,
 * and re-acceptance flows for Terms of Service and Privacy Policy.
 */

import Constants from "expo-constants";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Platform } from "react-native";
import {
    CURRENT_PRIVACY_VERSION,
    CURRENT_TERMS_VERSION,
    LEGAL_URLS,
    LegalAcceptanceMethod,
} from "../../constants/legal";
import { db, functions } from "../core/firebase";
import {
    LegalConfig,
    RecordAcceptanceInput,
    RecordAcceptanceResponse,
    VersionCheckResult,
} from "../types/legal";

/**
 * Get the current platform
 */
const getCurrentPlatform = (): "ios" | "android" | "web" => {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
};

/**
 * Get the current app version
 */
const getAppVersion = (): string => {
  return Constants.expoConfig?.version || "1.0.0";
};

/**
 * Fetch legal configuration from backend
 */
export const fetchLegalConfig = async (): Promise<LegalConfig | null> => {
  try {
    const getLegalConfigFn = httpsCallable(functions, "getLegalConfig");
    const result = await getLegalConfigFn();
    const data = result.data as {
      success: boolean;
      config?: LegalConfig;
      error?: string;
    };

    if (data.success && data.config) {
      return data.config;
    }

    console.warn("Failed to fetch legal config:", data.error);
    return null;
  } catch (error) {
    console.error("Error fetching legal config:", error);
    return null;
  }
};

/**
 * Get user's legal acceptance status from their profile
 */
export const getUserLegalAcceptance = async (
  userId: string,
): Promise<{
  acceptedTermsVersion: string | null;
  acceptedPrivacyVersion: string | null;
  legalAcceptedAt: any;
} | null> => {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));

    if (!userDoc.exists()) {
      return null;
    }

    const data = userDoc.data();
    return {
      acceptedTermsVersion: data?.acceptedTermsVersion || null,
      acceptedPrivacyVersion: data?.acceptedPrivacyVersion || null,
      legalAcceptedAt: data?.legalAcceptedAt || null,
    };
  } catch (error) {
    console.error("Error fetching user legal acceptance:", error);
    throw error;
  }
};

/**
 * Check if user needs to accept or re-accept legal documents
 */
export const checkLegalVersions = async (
  userId: string,
): Promise<VersionCheckResult> => {
  try {
    // Fetch both legal config and user's acceptance in parallel
    const [legalConfig, userAcceptance] = await Promise.all([
      fetchLegalConfig(),
      getUserLegalAcceptance(userId),
    ]);

    // Use fallback versions if config fetch fails
    const currentTerms =
      legalConfig?.currentTermsVersion || CURRENT_TERMS_VERSION;
    const currentPrivacy =
      legalConfig?.currentPrivacyVersion || CURRENT_PRIVACY_VERSION;

    // Check if user has never accepted
    const neverAccepted =
      !userAcceptance?.acceptedTermsVersion ||
      !userAcceptance?.acceptedPrivacyVersion;

    // Check if versions are outdated
    const termsOutdated = userAcceptance?.acceptedTermsVersion !== currentTerms;
    const privacyOutdated =
      userAcceptance?.acceptedPrivacyVersion !== currentPrivacy;

    const requiresAcceptance =
      neverAccepted || termsOutdated || privacyOutdated;

    return {
      requiresAcceptance,
      termsOutdated: !neverAccepted && termsOutdated,
      privacyOutdated: !neverAccepted && privacyOutdated,
      neverAccepted,
      materialChangesSummary: legalConfig?.materialChangesSummary || null,
      currentTermsVersion: currentTerms,
      currentPrivacyVersion: currentPrivacy,
    };
  } catch (error) {
    console.error("Error checking legal versions:", error);
    // On error, don't block the user - return as if accepted
    // This prevents app lockout on network errors
    return {
      requiresAcceptance: false,
      termsOutdated: false,
      privacyOutdated: false,
      neverAccepted: false,
      materialChangesSummary: null,
      currentTermsVersion: CURRENT_TERMS_VERSION,
      currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
    };
  }
};

/**
 * Record user's acceptance of legal documents
 */
export const recordLegalAcceptance = async (
  input: RecordAcceptanceInput,
): Promise<RecordAcceptanceResponse> => {
  try {
    const recordAcceptanceFn = httpsCallable(
      functions,
      "recordLegalAcceptance",
    );

    const result = await recordAcceptanceFn({
      termsVersion: input.termsVersion,
      privacyVersion: input.privacyVersion,
      acceptanceMethod: input.acceptanceMethod,
      clientInfo: {
        platform: input.platform,
        appVersion: input.appVersion,
      },
    });

    const data = result.data as RecordAcceptanceResponse;
    return data;
  } catch (error) {
    console.error("Error recording legal acceptance:", error);
    return {
      success: false,
      error: "Failed to record acceptance. Please try again.",
    };
  }
};

/**
 * Helper to record acceptance with current versions and auto-detected client info
 */
export const acceptCurrentLegalDocuments = async (
  acceptanceMethod: LegalAcceptanceMethod = "app_prompt",
): Promise<RecordAcceptanceResponse> => {
  // Fetch current versions first
  const legalConfig = await fetchLegalConfig();

  const termsVersion =
    legalConfig?.currentTermsVersion || CURRENT_TERMS_VERSION;
  const privacyVersion =
    legalConfig?.currentPrivacyVersion || CURRENT_PRIVACY_VERSION;

  return recordLegalAcceptance({
    termsVersion,
    privacyVersion,
    acceptanceMethod,
    platform: getCurrentPlatform(),
    appVersion: getAppVersion(),
  });
};

/**
 * Get legal acceptance data for signup flow
 * Returns the data structure needed for createUserAccount
 */
export const getLegalAcceptanceForSignup = async () => {
  const legalConfig = await fetchLegalConfig();

  return {
    termsVersion: legalConfig?.currentTermsVersion || CURRENT_TERMS_VERSION,
    privacyVersion:
      legalConfig?.currentPrivacyVersion || CURRENT_PRIVACY_VERSION,
    acceptanceMethod: "signup" as const,
    clientInfo: {
      platform: getCurrentPlatform(),
      appVersion: getAppVersion(),
    },
  };
};

/**
 * Get legal document URLs
 */
export const getLegalUrls = () => {
  return {
    termsOfService: LEGAL_URLS.termsOfService,
    privacyPolicy: LEGAL_URLS.privacyPolicy,
  };
};

/**
 * Format date for display
 */
export const formatLegalDate = (date: any): string => {
  if (!date) return "N/A";

  try {
    // Handle Firestore Timestamp
    if (date.toDate) {
      return date.toDate().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }

    // Handle regular Date or string
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "N/A";
  }
};

export const legalService = {
  fetchLegalConfig,
  getUserLegalAcceptance,
  checkLegalVersions,
  recordLegalAcceptance,
  acceptCurrentLegalDocuments,
  getLegalAcceptanceForSignup,
  getLegalUrls,
  formatLegalDate,
  getCurrentPlatform,
  getAppVersion,
};

export default legalService;
