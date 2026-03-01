import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { ResendVerificationEmailRequest } from "../types/interfaces";
import { config } from "../utils/config";
import { emailTransporter, emailVerificationTemplate } from "../utils/email";
import { cleanupExpiredTokens } from "../utils/userManagement";
import { validateRequiredFields } from "../utils/validation";

export const resendVerificationEmail = onCall(
  {
    region: config.region,
  },
  async (request) => {
    try {
      const { email }: ResendVerificationEmailRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ["email"]);

      // Find user by email in Firestore
      const usersQuery = await admin
        .firestore()
        .collection("users")
        .where("email", "==", email.toLowerCase())
        .limit(1)
        .get();

      if (usersQuery.empty) {
        throw new HttpsError(
          "not-found",
          "No account found with this email address",
        );
      }

      const userDoc = usersQuery.docs[0];
      const userData = userDoc.data();
      const uid = userDoc.id;

      // Check if email is already verified
      if (userData.emailVerified) {
        throw new HttpsError(
          "already-exists",
          "This email address is already verified",
        );
      }

      // Clean up any existing unverified tokens for this user
      await cleanupExpiredTokens("emailVerifications", uid);

      // Generate new verification token
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
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + config.expiration.emailVerification),
          verified: false,
        });

      // Create verification link
      const verificationLink = `${config.cloudFunctionUrls.verifyEmail}?token=${verificationToken}`;

      const mailOptions = {
        from: config.email.from,
        to: email,
        subject: "Verify Your Clubnizer Account - Resent",
        html: emailVerificationTemplate(
          userData.name || "User",
          verificationLink,
          true,
        ),
      };

      await emailTransporter.sendMail(mailOptions);
      console.log("Verification email resent successfully to:", email);

      return {
        success: true,
        message:
          "Verification email sent successfully! Please check your inbox.",
      };
    } catch (error: any) {
      console.error("Error resending verification email:", error);
      throw new HttpsError("internal", "Failed to resend verification email");
    }
  },
);
