import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { syncEmailToMemberArrays } from "../utils/emailSync";

/**
 * HTTP endpoint that verifies an email-change token.
 *
 * Called when the user clicks the link sent by `requestEmailChange`.
 *
 * Steps:
 * 1. Validate the token (exists, not expired, not used).
 * 2. Update email in Firebase Auth.
 * 3. Update email in Firestore `users/{uid}`.
 * 4. Sync email across all denormalized allMembers / guardian arrays.
 * 5. Revoke refresh tokens → force re-login.
 * 6. Redirect to login page with success indicator.
 */
export const verifyEmailChange = onRequest(
  {
    region: config.region,
  },
  async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== "string") {
        res.status(400).json({
          success: false,
          error: "Invalid verification token",
        });
        return;
      }

      // ── Fetch token document ─────────────────────────────
      const db = admin.firestore();
      const tokenDoc = await db
        .collection("emailChangeRequests")
        .doc(token)
        .get();

      if (!tokenDoc.exists) {
        res.status(400).json({
          success: false,
          error: "Invalid or expired email change token",
        });
        return;
      }

      const data = tokenDoc.data()!;

      // ── Already verified? ────────────────────────────────
      if (data.verified) {
        res.redirect(`${config.baseUrl}/login?emailChanged=already`);
        return;
      }

      // ── Expired? ─────────────────────────────────────────
      const expiresAt = data.expiresAt?.toDate
        ? data.expiresAt.toDate()
        : new Date(data.expiresAt);

      if (new Date() > expiresAt) {
        await db.collection("emailChangeRequests").doc(token).delete();
        res.status(400).json({
          success: false,
          error: "Email change token has expired. Please request a new one.",
        });
        return;
      }

      const { uid, oldEmail, newEmail } = data;

      // ── 1. Update Firebase Auth email ────────────────────
      await admin.auth().updateUser(uid, { email: newEmail });

      // ── 2. Update Firestore user document ────────────────
      await db.collection("users").doc(uid).update({
        email: newEmail,
        emailChangedAt: FieldValue.serverTimestamp(),
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp(),
      });

      // ── 3. Sync email in denormalized locations ──────────
      try {
        await syncEmailToMemberArrays(uid, oldEmail, newEmail);
      } catch (syncError) {
        // Log but don't fail — the critical Auth + user doc are done
        console.error("Error syncing email to member arrays:", syncError);
      }

      // ── 4. Revoke refresh tokens → force re-login ───────
      await admin.auth().revokeRefreshTokens(uid);

      // ── 5. Cleanup token ─────────────────────────────────
      await db.collection("emailChangeRequests").doc(token).update({
        verified: true,
        verifiedAt: FieldValue.serverTimestamp(),
      });
      await db.collection("emailChangeRequests").doc(token).delete();

      console.log(
        `Email changed for user ${uid}: ${oldEmail} → ${newEmail}`,
      );

      // ── 6. Redirect to login with success indicator ──────
      res.redirect(`${config.baseUrl}/login?emailChanged=success`);
    } catch (error: any) {
      console.error("Error verifying email change:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error during email change verification",
      });
    }
  },
);
