/**
 * Personnummer Encryption Cloud Functions
 *
 * AES-256-GCM encryption/decryption for Swedish personal identity numbers.
 * Encryption key is stored in Google Cloud Secret Manager.
 *
 * Security design:
 * - Full personnummer is NEVER stored in plaintext in Firestore
 * - Only encrypted value + last 4 digits are stored
 * - Decryption only happens server-side for RF API submission
 * - Each encryption uses a unique IV (initialization vector)
 */

import * as crypto from "crypto";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128-bit IV for GCM
const KEY_LENGTH = 32; // 256-bit key
const AUTH_TAG_LENGTH = 16;

// Cache the encryption key in memory (per function instance)
let cachedEncryptionKey: Buffer | null = null;

/**
 * Get the encryption key from environment/Secret Manager.
 * In production, this should be configured via Google Cloud Secret Manager
 * and referenced in firebase functions config.
 */
const getEncryptionKey = async (): Promise<Buffer> => {
  if (cachedEncryptionKey) return cachedEncryptionKey;

  // In production: use Secret Manager via defineSecret() or environment variable
  // The key should be set via: firebase functions:secrets:set PERSONNUMMER_ENCRYPTION_KEY
  const keyHex = process.env.PERSONNUMMER_ENCRYPTION_KEY;

  if (!keyHex) {
    throw new HttpsError(
      "failed-precondition",
      "Personnummer encryption key not configured. Contact system administrator.",
    );
  }

  const keyBuffer = Buffer.from(keyHex, "hex");
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new HttpsError("internal", "Invalid encryption key length.");
  }

  cachedEncryptionKey = keyBuffer;
  return keyBuffer;
};

/**
 * Encrypt a personnummer string using AES-256-GCM.
 * Returns: iv:authTag:ciphertext (all hex-encoded, colon-separated)
 */
const encrypt = async (plaintext: string): Promise<string> => {
  const key = await getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
};

/**
 * Decrypt a personnummer string using AES-256-GCM.
 * Input format: iv:authTag:ciphertext (hex-encoded, colon-separated)
 */
export const decrypt = async (encryptedData: string): Promise<string> => {
  const key = await getEncryptionKey();
  const parts = encryptedData.split(":");

  if (parts.length !== 3) {
    throw new HttpsError("internal", "Invalid encrypted data format.");
  }

  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const ciphertext = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

/**
 * Validate Swedish personnummer format and Luhn checksum.
 * Accepts: YYYYMMDDXXXX (12 digits) or YYMMDD-XXXX / YYMMDDXXXX (10 digits)
 * Returns normalized 12-digit format: YYYYMMDDXXXX
 */
export const validateAndNormalizePersonnummer = (
  input: string,
): { valid: boolean; normalized?: string; error?: string } => {
  // Remove whitespace and hyphens
  const cleaned = input.replace(/[\s-]/g, "");

  if (!/^\d{10,12}$/.test(cleaned)) {
    return { valid: false, error: "personnummer_invalid_format" };
  }

  let digits12: string;

  if (cleaned.length === 12) {
    digits12 = cleaned;
  } else if (cleaned.length === 10) {
    // Assume 19xx or 20xx based on current date
    const twoDigitYear = parseInt(cleaned.substring(0, 2), 10);
    const currentYear = new Date().getFullYear() % 100;
    const century = twoDigitYear > currentYear ? "19" : "20";
    digits12 = century + cleaned;
  } else {
    return { valid: false, error: "personnummer_invalid_format" };
  }

  // Validate date portion
  const year = parseInt(digits12.substring(0, 4), 10);
  const month = parseInt(digits12.substring(4, 6), 10);
  const day = parseInt(digits12.substring(6, 8), 10);

  if (month < 1 || month > 12) {
    return { valid: false, error: "personnummer_invalid_date" };
  }
  if (day < 1 || day > 31) {
    return { valid: false, error: "personnummer_invalid_date" };
  }

  // Check if date is valid
  const dateCheck = new Date(year, month - 1, day);
  if (
    dateCheck.getFullYear() !== year ||
    dateCheck.getMonth() !== month - 1 ||
    dateCheck.getDate() !== day
  ) {
    return { valid: false, error: "personnummer_invalid_date" };
  }

  // Luhn check on the last 10 digits (YYMMDDXXXX)
  const luhnDigits = digits12.substring(2); // 10 digits: YYMMDDXXXX
  if (!luhnCheck(luhnDigits)) {
    return { valid: false, error: "personnummer_invalid_checksum" };
  }

  return { valid: true, normalized: digits12 };
};

/**
 * Luhn algorithm check for Swedish personnummer.
 * Uses the last 10 digits (YYMMDDXXXX), check digit is the last digit.
 */
const luhnCheck = (digits: string): boolean => {
  if (digits.length !== 10) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(digits[i], 10);
    // Multiply alternating digits by 2 (starting with the first)
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(digits[9], 10);
};

/**
 * Extract birth date from a 12-digit personnummer.
 */
export const getBirthDateFromPersonnummer = (normalized: string): Date => {
  const year = parseInt(normalized.substring(0, 4), 10);
  const month = parseInt(normalized.substring(4, 6), 10);
  const day = parseInt(normalized.substring(6, 8), 10);
  return new Date(year, month - 1, day);
};

/**
 * Calculate age at a given date from personnummer.
 */
export const getAgeAtDate = (normalized: string, atDate: Date): number => {
  const birth = getBirthDateFromPersonnummer(normalized);
  let age = atDate.getFullYear() - birth.getFullYear();
  const monthDiff = atDate.getMonth() - birth.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && atDate.getDate() < birth.getDate())
  ) {
    age--;
  }
  return age;
};

// ─── Cloud Functions ───────────────────────────────────────────

/**
 * Store personnummer — encrypts and saves to user document.
 * Requires the user to provide explicit consent.
 */
export const storePersonnummer = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { personnummer, consentVersion } = request.data;

    if (!personnummer || typeof personnummer !== "string") {
      throw new HttpsError("invalid-argument", "Personnummer is required.");
    }
    if (!consentVersion || typeof consentVersion !== "string") {
      throw new HttpsError("invalid-argument", "Consent version is required.");
    }

    // Validate and normalize
    const validation = validateAndNormalizePersonnummer(personnummer);
    if (!validation.valid || !validation.normalized) {
      throw new HttpsError(
        "invalid-argument",
        validation.error || "Invalid personnummer.",
      );
    }

    const normalized = validation.normalized;
    const birthDate = normalized.substring(0, 8);

    // Encrypt
    const encrypted = await encrypt(normalized);

    const db = admin.firestore();
    const userId = request.auth.uid;
    const now = FieldValue.serverTimestamp();

    // Check if user already has a personnummer (update vs. first-time)
    const userDoc = await db.collection("users").doc(userId).get();
    const existingPersonalNumber = userDoc.data()?.personalNumber;

    const personalNumberData: Record<string, any> = {
      "personalNumber.encrypted": encrypted,
      "personalNumber.birthDate": birthDate,
      "personalNumber.consentAt": now,
      "personalNumber.consentVersion": consentVersion,
    };

    if (existingPersonalNumber?.encrypted) {
      // Update — keep original providedAt, set updatedAt
      personalNumberData["personalNumber.updatedAt"] = now;
    } else {
      // First time — set providedAt
      personalNumberData["personalNumber.providedAt"] = now;
    }

    await db.collection("users").doc(userId).update(personalNumberData);

    console.log(
      `✅ Personnummer stored for user ${userId} (birthDate: ${birthDate})`,
    );

    // Fire-and-forget: mark events that may now become LOK-eligible for recheck
    markEventsForRecheck(userId, db).catch((err) =>
      console.error(`Failed to mark events for recheck for user ${userId}:`, err),
    );

    return {
      success: true,
      birthDate,
    };
  },
);

/**
 * Remove personnummer from user document.
 * User can withdraw consent at any time (GDPR right to erasure).
 */
export const removePersonnummer = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const db = admin.firestore();
    const userId = request.auth.uid;

    await db.collection("users").doc(userId).update({
      personalNumber: FieldValue.delete(),
    });

    console.log(`🗑️ Personnummer removed for user ${userId}`);

    return { success: true };
  },
);

/**
 * Get masked personnummer for display.
 * Returns only the last 4 digits — never the full number to the client.
 */
export const getPersonnummerStatus = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const db = admin.firestore();
    const userId = request.auth.uid;
    const userDoc = await db.collection("users").doc(userId).get();
    const personalNumber = userDoc.data()?.personalNumber;

    if (!personalNumber?.encrypted) {
      return {
        hasPersonnummer: false,
        birthDate: null,
        consentVersion: null,
      };
    }

    return {
      hasPersonnummer: true,
      birthDate: personalNumber.birthDate,
      consentVersion: personalNumber.consentVersion,
      providedAt: personalNumber.providedAt,
      updatedAt: personalNumber.updatedAt || null,
    };
  },
);

/**
 * Internal helper: Decrypt personnummer for a batch of user IDs.
 * Used by LOK report generation — NOT exposed as a client-callable function.
 */
export const decryptPersonnummerBatch = async (
  userIds: string[],
): Promise<Map<string, string>> => {
  const db = admin.firestore();
  const result = new Map<string, string>();

  // Batch read user documents
  const userRefs = userIds.map((id) => db.collection("users").doc(id));
  if (userRefs.length === 0) return result;
  const userDocs = await db.getAll(...userRefs);

  for (const doc of userDocs) {
    if (doc.exists) {
      const personalNumber = doc.data()?.personalNumber;
      if (personalNumber?.encrypted) {
        try {
          const decrypted = await decrypt(personalNumber.encrypted);
          result.set(doc.id, decrypted);
        } catch (error) {
          console.error(
            `Failed to decrypt personnummer for user ${doc.id}:`,
            error,
          );
        }
      }
    }
  }

  return result;
};

/**
 * Internal helper: Mark recently completed events as needing LOK eligibility
 * recheck for a given user. Called after personnummer is stored or updated.
 * Fire-and-forget — errors are logged but do not fail the CF response.
 */
const markEventsForRecheck = async (
  userId: string,
  db: admin.firestore.Firestore,
): Promise<void> => {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const userDoc = await db.collection("users").doc(userId).get();
  const clubAccessArr: any[] = userDoc.data()?.clubAccess || [];

  for (const ca of clubAccessArr) {
    if (!ca.clubId) continue;
    try {
      const eventsSnap = await db
        .collection("clubs")
        .doc(ca.clubId)
        .collection("events")
        .where("status", "==", "completed")
        .where(
          "startDate",
          ">=",
          admin.firestore.Timestamp.fromDate(twelveMonthsAgo),
        )
        .where("lok.eligible", "==", false)
        .get();

      const batch = db.batch();
      let batchCount = 0;

      for (const eventDoc of eventsSnap.docs) {
        const responses: any[] = eventDoc.data().responses || [];
        const attended = responses.some(
          (r: any) => r.userId === userId && r.actualAttendance === true,
        );
        if (attended) {
          batch.update(eventDoc.ref, { "lok.needsRecheck": true });
          batchCount++;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
        console.log(
          `🔄 Marked ${batchCount} events for LOK recheck in club ${ca.clubId}`,
        );
      }
    } catch (err) {
      console.error(
        `Failed to mark events for recheck in club ${ca.clubId}:`,
        err,
      );
    }
  }
};

/**
 * Store personnummer for a dependent (child) — for use by legal guardians.
 * Validates that the caller is a registered guardian for the target user.
 */
export const storePersonnummerForDependent = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { targetUserId, personnummer, consentVersion } = request.data;

    if (!targetUserId || typeof targetUserId !== "string") {
      throw new HttpsError("invalid-argument", "targetUserId is required.");
    }
    if (!personnummer || typeof personnummer !== "string") {
      throw new HttpsError("invalid-argument", "Personnummer is required.");
    }
    if (!consentVersion || typeof consentVersion !== "string") {
      throw new HttpsError("invalid-argument", "Consent version is required.");
    }

    const db = admin.firestore();
    const guardianUserId = request.auth.uid;

    // Verify guardian relationship
    const targetDoc = await db.collection("users").doc(targetUserId).get();
    if (!targetDoc.exists) {
      throw new HttpsError("not-found", "Target user not found.");
    }
    const guardians: any[] = targetDoc.data()?.guardians || [];
    const isGuardian = guardians.some((g: any) => g.guardianUid === guardianUserId);
    if (!isGuardian) {
      throw new HttpsError(
        "permission-denied",
        "You are not a registered guardian for this user.",
      );
    }

    // Validate and normalize
    const validation = validateAndNormalizePersonnummer(personnummer);
    if (!validation.valid || !validation.normalized) {
      throw new HttpsError(
        "invalid-argument",
        validation.error || "Invalid personnummer.",
      );
    }

    const normalized = validation.normalized;
    const birthDate = normalized.substring(0, 8);
    const encrypted = await encrypt(normalized);
    const now = FieldValue.serverTimestamp();

    const existingPersonalNumber = targetDoc.data()?.personalNumber;
    const personalNumberData: Record<string, any> = {
      "personalNumber.encrypted": encrypted,
      "personalNumber.birthDate": birthDate,
      "personalNumber.consentAt": now,
      "personalNumber.consentVersion": consentVersion,
    };

    if (existingPersonalNumber?.encrypted) {
      personalNumberData["personalNumber.updatedAt"] = now;
    } else {
      personalNumberData["personalNumber.providedAt"] = now;
    }

    await db.collection("users").doc(targetUserId).update(personalNumberData);

    console.log(
      `✅ Personnummer stored for dependent ${targetUserId} by guardian ${guardianUserId} (birthDate: ${birthDate})`,
    );

    markEventsForRecheck(targetUserId, db).catch((err) =>
      console.error(
        `Failed to mark events for recheck for dependent ${targetUserId}:`,
        err,
      ),
    );

    return { success: true, birthDate };
  },
);

/**
 * Remove personnummer for a dependent (child) — GDPR erasure by legal guardian.
 */
export const removePersonnummerForDependent = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { targetUserId } = request.data;

    if (!targetUserId || typeof targetUserId !== "string") {
      throw new HttpsError("invalid-argument", "targetUserId is required.");
    }

    const db = admin.firestore();
    const guardianUserId = request.auth.uid;

    // Verify guardian relationship
    const targetDoc = await db.collection("users").doc(targetUserId).get();
    if (!targetDoc.exists) {
      throw new HttpsError("not-found", "Target user not found.");
    }
    const guardians: any[] = targetDoc.data()?.guardians || [];
    const isGuardian = guardians.some((g: any) => g.guardianUid === guardianUserId);
    if (!isGuardian) {
      throw new HttpsError(
        "permission-denied",
        "You are not a registered guardian for this user.",
      );
    }

    await db.collection("users").doc(targetUserId).update({
      personalNumber: FieldValue.delete(),
    });

    console.log(
      `🗑️ Personnummer removed for dependent ${targetUserId} by guardian ${guardianUserId}`,
    );

    return { success: true };
  },
);

/**
 * Get personnummer status for a dependent (child) — for guardian view.
 * Returns birthDate instead of full personnummer to minimize data exposure.
 */
export const getPersonnummerStatusForDependent = onCall(
  { region: "europe-north1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { targetUserId } = request.data;

    if (!targetUserId || typeof targetUserId !== "string") {
      throw new HttpsError("invalid-argument", "targetUserId is required.");
    }

    const db = admin.firestore();
    const guardianUserId = request.auth.uid;

    // Verify guardian relationship
    const targetDoc = await db.collection("users").doc(targetUserId).get();
    if (!targetDoc.exists) {
      throw new HttpsError("not-found", "Target user not found.");
    }
    const guardians: any[] = targetDoc.data()?.guardians || [];
    const isGuardian = guardians.some((g: any) => g.guardianUid === guardianUserId);
    if (!isGuardian) {
      throw new HttpsError(
        "permission-denied",
        "You are not a registered guardian for this user.",
      );
    }

    const personalNumber = targetDoc.data()?.personalNumber;
    if (!personalNumber?.encrypted) {
      return {
        hasPersonnummer: false,
        birthDate: null,
        consentVersion: null,
      };
    }

    return {
      hasPersonnummer: true,
      birthDate: personalNumber.birthDate,
      consentVersion: personalNumber.consentVersion,
      providedAt: personalNumber.providedAt,
      updatedAt: personalNumber.updatedAt || null,
    };
  },
);
