import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { SendEmailVerificationRequest } from "../types/interfaces";
import { config } from "../utils/config";
import { emailTransporter, emailVerificationTemplate } from "../utils/email";
import { cleanupExpiredTokens } from "../utils/userManagement";
import { validateRequiredFields } from "../utils/validation";

export const sendEmailVerification = onCall(
  {
    region: config.region,
    secrets: ["SMTP_PASSWORD"],
  },
  async (request) => {
    try {
      const { email, uid, fullName }: SendEmailVerificationRequest =
        request.data;

      // Validate required fields
      validateRequiredFields(request.data, ["email", "uid", "fullName"]);

      // Clean up any existing unverified tokens for this user
      await cleanupExpiredTokens("emailVerifications", uid);

      // Generate verification token
      const verificationToken = admin
        .firestore()
        .collection("emailVerifications")
        .doc().id;

      // Store verification token with expiry
      await admin
        .firestore()
        .collection("emailVerifications")
        .doc(verificationToken)
        .set({
          uid,
          email: email.toLowerCase(),
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + config.expiration.emailVerification),
          verified: false,
        });

      // Create verification link
      const verificationLink = `${config.cloudFunctionUrls.verifyEmail}?token=${verificationToken}`;

      const mailOptions = {
        from: config.email.from,
        to: email,
        subject: "Verify Your Clubnizer Account",
        html: emailVerificationTemplate(fullName, verificationLink),
      };

      await emailTransporter.sendMail(mailOptions);
      console.log("Verification email sent successfully to:", email);

      return {
        success: true,
        message:
          "Verification email sent successfully! Please check your inbox.",
      };
    } catch (error: any) {
      console.error("Error sending verification email:", error);
      throw new HttpsError("internal", "Failed to send verification email");
    }
  },
);
