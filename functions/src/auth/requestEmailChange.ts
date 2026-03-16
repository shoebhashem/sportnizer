import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { emailChangeTemplate, emailTransporter } from "../utils/email";
import { cleanupExpiredTokens } from "../utils/userManagement";
import { validateEmail } from "../utils/validation";

/**
 * Request an email address change.
 *
 * Flow:
 * 1. Validate the new email (format, not same, not taken).
 * 2. Store a token in `emailChangeRequests/{token}`.
 * 3. Send a verification email to the NEW address.
 * 4. Client signs the user out after this call succeeds.
 *
 * The actual swap happens when the user clicks the link → `verifyEmailChange`.
 */
export const requestEmailChange = onCall(
  {
    region: config.region,
    secrets: ["SMTP_PASSWORD"],
  },
  async (request) => {
    // ── Auth guard ──────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const uid = request.auth.uid;
    const { newEmail } = request.data as { newEmail?: string };

    // ── Validate input ─────────────────────────────────────
    if (!newEmail || typeof newEmail !== "string" || !newEmail.trim()) {
      throw new HttpsError("invalid-argument", "newEmail is required");
    }

    const normalizedEmail = newEmail.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      throw new HttpsError("invalid-argument", "Invalid email format");
    }

    // ── Fetch current user ─────────────────────────────────
    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User document not found");
    }
    const userData = userDoc.data()!;
    const currentEmail = (userData.email || "").toLowerCase();

    if (normalizedEmail === currentEmail) {
      throw new HttpsError(
        "invalid-argument",
        "New email must be different from current email",
      );
    }

    // ── Check email not already taken in Firebase Auth ─────
    try {
      await admin.auth().getUserByEmail(normalizedEmail);
      // If we reach here, the email is already in use
      throw new HttpsError(
        "already-exists",
        "This email address is already in use by another account",
      );
    } catch (error: any) {
      // `auth/user-not-found` means the email is available — continue
      if (error instanceof HttpsError && error.code === "already-exists") {
        throw error; // re-throw our own error
      }
      if (error.code !== "auth/user-not-found") {
        console.error("Error checking email availability:", error);
        throw new HttpsError("internal", "Failed to check email availability");
      }
    }

    // ── Check email not taken in Firestore users collection ─
    const existingFirestoreUser = await db
      .collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();
    if (!existingFirestoreUser.empty) {
      throw new HttpsError(
        "already-exists",
        "This email address is already in use by another account",
      );
    }

    // ── Cleanup previous pending requests for this user ────
    await cleanupExpiredTokens("emailChangeRequests", uid);

    // ── Create verification token ──────────────────────────
    const token = db.collection("emailChangeRequests").doc().id;

    await db
      .collection("emailChangeRequests")
      .doc(token)
      .set({
        uid,
        oldEmail: currentEmail,
        newEmail: normalizedEmail,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + config.expiration.emailVerification), // 24 h
        verified: false,
      });

    // ── Send verification email to new address ─────────────
    const verificationLink = `${config.cloudFunctionUrls.verifyEmailChange}?token=${token}`;
    const fullName = userData.fullName || userData.displayName || "User";

    const mailOptions = {
      from: config.email.from,
      to: normalizedEmail,
      subject: "Confirm Your New Email — Clubnizer",
      html: emailChangeTemplate(fullName, verificationLink),
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(
      `Email change verification sent to ${normalizedEmail} for user ${uid}`,
    );

    return {
      success: true,
      message:
        "A verification email has been sent to your new email address. " +
        "Please click the link to confirm the change.",
    };
  },
);
