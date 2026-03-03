import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { config } from "../utils/config";

export const verifyEmail = onRequest(
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

      // Get verification document
      const verificationDoc = await admin
        .firestore()
        .collection("emailVerifications")
        .doc(token)
        .get();

      if (!verificationDoc.exists) {
        res.status(400).json({
          success: false,
          error: "Invalid or expired verification token",
        });
        return;
      }

      const verificationData = verificationDoc.data();

      // Check if already verified
      if (verificationData?.verified) {
        // Redirect to success page (signup screen)
        res.redirect(`${config.baseUrl}/signup?verified=already`);
        return;
      }

      // Check if expired
      const now = new Date();
      const expiresAt = verificationData?.expiresAt?.toDate();

      if (expiresAt && now > expiresAt) {
        // Clean up expired token
        await admin
          .firestore()
          .collection("emailVerifications")
          .doc(token)
          .delete();

        res.status(400).json({
          success: false,
          error: "Verification token has expired",
        });
        return;
      }

      // Update user document to mark email as verified (use set with merge to avoid creating new docs)
      await admin
        .firestore()
        .collection("users")
        .doc(verificationData?.uid)
        .set(
          {
            emailVerified: true,
            verifiedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

      // Mark verification as used
      await admin
        .firestore()
        .collection("emailVerifications")
        .doc(token)
        .update({
          verified: true,
          verifiedAt: FieldValue.serverTimestamp(),
        });

      // Clean up verification document after successful verification
      await admin
        .firestore()
        .collection("emailVerifications")
        .doc(token)
        .delete();

      console.log(
        "Email verified successfully for user:",
        verificationData?.uid,
      );

      // Redirect to success page (signup screen with success message)
      res.redirect(`${config.baseUrl}/signup?verified=success`);
    } catch (error: any) {
      console.error("Error verifying email:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error during email verification",
      });
    }
  },
);
