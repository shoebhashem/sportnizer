import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { emailTransporter, passwordResetTemplate } from "../utils/email";
import { validateEmail } from "../utils/validation";

/**
 * Request a password reset email.
 *
 * Flow:
 * 1. Validate the email format.
 * 2. Look up the user in Firestore (by email).
 * 3. Rate-limit: max 3 requests per email per hour.
 * 4. Store a token in `passwordResetRequests/{token}` (1-hour expiry).
 * 5. Send a branded password reset email via SMTP.
 *
 * SECURITY:
 * - No auth required (user has forgotten their password).
 * - Always returns a generic success message to prevent email enumeration.
 * - Unverified users are silently skipped (no email sent).
 */
export const requestPasswordReset = onCall(
  {
    region: config.region,
    secrets: ["SMTP_PASSWORD"],
  },
  async (request) => {
    const { email } = request.data as { email?: string };

    // ── Validate input ─────────────────────────────────────
    if (!email || typeof email !== "string" || !email.trim()) {
      throw new HttpsError("invalid-argument", "Email is required");
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      throw new HttpsError("invalid-argument", "Invalid email format");
    }

    // ── Generic success response (always returned) ─────────
    const genericResponse = {
      success: true,
      message:
        "If an account exists with this email, a password reset link has been sent.",
    };

    const db = admin.firestore();

    // ── Look up user by email ──────────────────────────────
    const usersSnap = await db
      .collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (usersSnap.empty) {
      // No user found — return generic response (no email enumeration)
      console.log(
        `Password reset requested for non-existent email: ${normalizedEmail}`,
      );
      return genericResponse;
    }

    const userDoc = usersSnap.docs[0];
    const userData = userDoc.data();
    const uid = userDoc.id;

    // ── Skip unverified users ──────────────────────────────
    if (!userData.emailVerified) {
      console.log(
        `Password reset skipped for unverified user: ${normalizedEmail}`,
      );
      return genericResponse;
    }

    // ── Rate limit: max 3 requests per email per hour ──────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRequests = await db
      .collection("passwordResetRequests")
      .where("email", "==", normalizedEmail)
      .where("createdAt", ">", oneHourAgo)
      .get();

    if (recentRequests.size >= 3) {
      console.log(
        `Password reset rate limited for: ${normalizedEmail} (${recentRequests.size} requests in last hour)`,
      );
      return genericResponse;
    }

    // ── Create reset token ─────────────────────────────────
    const token = db.collection("passwordResetRequests").doc().id;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.collection("passwordResetRequests").doc(token).set({
      uid,
      email: normalizedEmail,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      used: false,
    });

    // ── Send reset email ───────────────────────────────────
    const resetLink = `${config.cloudFunctionUrls.resetPassword}?token=${token}`;
    const fullName = userData.fullName || userData.displayName || "User";

    const mailOptions = {
      from: config.email.from,
      to: normalizedEmail,
      subject: "Reset Your Password — Clubnizer",
      html: passwordResetTemplate(fullName, resetLink),
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(
      `Password reset email sent to ${normalizedEmail} for user ${uid}`,
    );

    return genericResponse;
  },
);
