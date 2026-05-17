/**
 * Personnummer Service (Frontend)
 *
 * Handles personnummer collection, storage, and status checking
 * via Cloud Functions. The actual encryption happens server-side.
 *
 * IMPORTANT: The full personnummer is NEVER stored on the client.
 * Only the birth date portion (YYYYMMDD) is returned for display.
 */

import { httpsCallable } from "firebase/functions";
import { functions } from "../core/firebase";

// ─── Types ─────────────────────────────────────────────────────

export interface PersonnummerStatus {
  hasPersonnummer: boolean;
  birthDate: string | null; // "YYYYMMDD" — first 8 digits, less sensitive than last 4
  consentVersion: string | null;
  providedAt?: any;
  updatedAt?: any;
}

export interface StorePersonnummerResult {
  success: boolean;
  birthDate?: string;
  error?: string;
}

export interface RemovePersonnummerResult {
  success: boolean;
  error?: string;
}

// ─── Client-side Validation ────────────────────────────────────

/**
 * Basic client-side personnummer format validation.
 * Full validation including Luhn check happens server-side.
 * This provides quick feedback before sending to the server.
 */
export const validatePersonnummerFormat = (
  input: string,
): { valid: boolean; error?: string } => {
  const cleaned = input.replace(/[\s-]/g, "");

  if (cleaned.length === 0) {
    return { valid: false, error: "personnummer_required" };
  }

  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, error: "personnummer_digits_only" };
  }

  if (cleaned.length !== 10 && cleaned.length !== 12) {
    return { valid: false, error: "personnummer_invalid_length" };
  }

  // Basic date validation
  const dateStr =
    cleaned.length === 12 ? cleaned.substring(0, 8) : cleaned.substring(0, 6);

  if (cleaned.length === 12) {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10);
    const day = parseInt(dateStr.substring(6, 8), 10);

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { valid: false, error: "personnummer_invalid_date" };
    }
    if (year < 1900 || year > new Date().getFullYear()) {
      return { valid: false, error: "personnummer_invalid_year" };
    }
  }

  return { valid: true };
};

/**
 * Format personnummer with hyphen for display during input.
 * YYYYMMDD-XXXX or YYMMDD-XXXX
 */
export const formatPersonnummerInput = (input: string): string => {
  const cleaned = input.replace(/[^0-9]/g, "");

  if (cleaned.length <= 8) {
    return cleaned;
  }

  // Insert hyphen after date part
  if (cleaned.length <= 12) {
    return `${cleaned.slice(0, 8)}-${cleaned.slice(8)}`;
  }

  return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}`;
};

/**
 * Format a "YYYYMMDD" birthDate string as "YYYY-MM-DD" for display.
 */
const formatBirthDateForDisplay = (birthDate: string): string => {
  if (birthDate.length !== 8) return birthDate;
  return `${birthDate.substring(0, 4)}-${birthDate.substring(4, 6)}-${birthDate.substring(6, 8)}`;
};

/**
 * Get a human-readable confirmation string for a stored personnummer.
 * Includes the member's name and birth date for clarity.
 * e.g. "Personnummer för Alex Morgan (1985-01-12) är inlämnat ✓"
 */
export const getPersonnummerDisplayText = (
  name: string,
  birthDate: string,
): string => {
  const formatted = formatBirthDateForDisplay(birthDate);
  return `Personnummer för ${name} (${formatted}) är inlämnat ✓`;
};

// ─── Cloud Function Calls ──────────────────────────────────────

/**
 * Store personnummer via Cloud Function (encrypts server-side).
 */
export const storePersonnummer = async (
  personnummer: string,
  consentVersion: string,
): Promise<StorePersonnummerResult> => {
  try {
    const storePersonnummerFn = httpsCallable(functions, "storePersonnummer");
    const result = await storePersonnummerFn({
      personnummer,
      consentVersion,
    });

    return result.data as StorePersonnummerResult;
  } catch (error: any) {
    console.error("Error storing personnummer:", error);
    return {
      success: false,
      error: error.message || "Failed to store personnummer.",
    };
  }
};

/**
 * Remove personnummer (GDPR right to erasure).
 */
export const removePersonnummer =
  async (): Promise<RemovePersonnummerResult> => {
    try {
      const removePersonnummerFn = httpsCallable(
        functions,
        "removePersonnummer",
      );
      const result = await removePersonnummerFn();
      return result.data as RemovePersonnummerResult;
    } catch (error: any) {
      console.error("Error removing personnummer:", error);
      return {
        success: false,
        error: error.message || "Failed to remove personnummer.",
      };
    }
  };

/**
 * Get current personnummer status (has it? birthDate? consent version?).
 */
export const getPersonnummerStatus = async (): Promise<PersonnummerStatus> => {
  try {
    const getStatusFn = httpsCallable(functions, "getPersonnummerStatus");
    const result = await getStatusFn();
    return result.data as PersonnummerStatus;
  } catch (error: any) {
    console.error("Error getting personnummer status:", error);
    return {
      hasPersonnummer: false,
      birthDate: null,
      consentVersion: null,
    };
  }
};

/**
 * Store personnummer for a dependent (child) via Cloud Function.
 * Caller must be a registered guardian for the target user.
 */
export const storePersonnummerForDependent = async (
  targetUserId: string,
  personnummer: string,
  consentVersion: string,
): Promise<StorePersonnummerResult> => {
  try {
    const fn = httpsCallable(functions, "storePersonnummerForDependent");
    const result = await fn({ targetUserId, personnummer, consentVersion });
    return result.data as StorePersonnummerResult;
  } catch (error: any) {
    console.error("Error storing personnummer for dependent:", error);
    return {
      success: false,
      error: error.message || "Failed to store personnummer.",
    };
  }
};

/**
 * Remove personnummer for a dependent (child) via Cloud Function.
 */
export const removePersonnummerForDependent = async (
  targetUserId: string,
): Promise<RemovePersonnummerResult> => {
  try {
    const fn = httpsCallable(functions, "removePersonnummerForDependent");
    const result = await fn({ targetUserId });
    return result.data as RemovePersonnummerResult;
  } catch (error: any) {
    console.error("Error removing personnummer for dependent:", error);
    return {
      success: false,
      error: error.message || "Failed to remove personnummer.",
    };
  }
};

/**
 * Get personnummer status for a dependent (child) via Cloud Function.
 */
export const getPersonnummerStatusForDependent = async (
  targetUserId: string,
): Promise<PersonnummerStatus> => {
  try {
    const fn = httpsCallable(functions, "getPersonnummerStatusForDependent");
    const result = await fn({ targetUserId });
    return result.data as PersonnummerStatus;
  } catch (error: any) {
    console.error("Error getting personnummer status for dependent:", error);
    return {
      hasPersonnummer: false,
      birthDate: null,
      consentVersion: null,
    };
  }
};

// ─── Service Export ────────────────────────────────────────────

export const personnummerService = {
  validatePersonnummerFormat,
  formatPersonnummerInput,
  getPersonnummerDisplayText,
  storePersonnummer,
  removePersonnummer,
  getPersonnummerStatus,
  storePersonnummerForDependent,
  removePersonnummerForDependent,
  getPersonnummerStatusForDependent,
};

export default personnummerService;
