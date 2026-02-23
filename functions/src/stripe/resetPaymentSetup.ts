import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

/**
 * Reset payment setup for a club
 *
 * This removes the Stripe account association from the club,
 * allowing the admin to set up payments again with a different country.
 *
 * Note: This does NOT delete the Stripe Connected Account itself -
 * that must be done through the Stripe Dashboard if needed.
 *
 * SECURITY: Only club-admin role can call this function
 */
export const resetPaymentSetup = onCall(
  { region: config.region },
  async (
    request,
  ): Promise<{
    success: boolean;
    error?: string;
  }> => {
    // 1. Validate authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId } = request.data;

    if (!clubId) {
      throw new HttpsError("invalid-argument", "Club ID is required");
    }

    const db = admin.firestore();

    try {
      // 2. Verify user is club-admin
      const userDoc = await db.collection("users").doc(request.auth.uid).get();

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User profile not found");
      }

      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];

      const isClubAdmin = clubAccess.some(
        (access: { clubId: string; role: string }) =>
          access.clubId === clubId && access.role === "club-admin",
      );

      if (!isClubAdmin) {
        throw new HttpsError(
          "permission-denied",
          "Only club administrators can reset payment setup",
        );
      }

      // 3. Get the club document
      const clubRef = db.collection("clubs").doc(clubId);
      const clubDoc = await clubRef.get();

      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      const clubData = clubDoc.data();

      if (!clubData?.stripe) {
        return { success: true }; // No Stripe setup to reset
      }

      // 4. Remove the Stripe data from club document
      // We keep a record of the previous account for audit purposes
      const previousStripeData = clubData.stripe;

      await clubRef.update({
        stripe: admin.firestore.FieldValue.delete(),
        previousStripeAccount: {
          ...previousStripeData,
          disconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
          disconnectedBy: request.auth.uid,
        },
      });

      console.log(
        `Reset payment setup for club ${clubId}. Previous account: ${previousStripeData.accountId}`,
      );

      return { success: true };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error("Error resetting payment setup:", error);
      throw new HttpsError("internal", "Failed to reset payment setup");
    }
  },
);
