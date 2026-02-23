import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { config } from "../utils/config";

/**
 * Check and update the Stripe account status for a club
 *
 * This retrieves the current status from Stripe and updates the club document.
 * Call this after the admin returns from Stripe onboarding to check if
 * onboarding was completed successfully.
 *
 * SECURITY: Only club-admin role can call this function
 */
export const checkStripeAccountStatus = onCall(
  { region: config.region, secrets: ["STRIPE_SECRET_KEY"] },
  async (
    request,
  ): Promise<{
    success: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    onboardingComplete: boolean;
    requiresAction: boolean;
    pendingRequirements: string[];
  }> => {
    // 1. Validate authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId } = request.data;

    if (!clubId) {
      throw new HttpsError("invalid-argument", "Club ID is required");
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
    });

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
          "Only club administrators can check payment status",
        );
      }

      // 3. Get club's Stripe account ID
      const clubDoc = await db.collection("clubs").doc(clubId).get();

      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      const clubData = clubDoc.data();
      const stripeAccountId = clubData?.stripe?.accountId;

      if (!stripeAccountId) {
        throw new HttpsError(
          "failed-precondition",
          "Club does not have a Stripe account set up",
        );
      }

      // 4. Retrieve account status from Stripe
      const account = await stripe.accounts.retrieve(stripeAccountId);

      // 5. Determine if onboarding is complete
      // An account is ready when charges_enabled and payouts_enabled are true
      const chargesEnabled = account.charges_enabled || false;
      const payoutsEnabled = account.payouts_enabled || false;
      const onboardingComplete = chargesEnabled && payoutsEnabled;

      // Check for pending requirements
      const pendingRequirements = account.requirements?.currently_due || [];
      const requiresAction = pendingRequirements.length > 0;

      // 6. Update club document with current status
      await db
        .collection("clubs")
        .doc(clubId)
        .update({
          "stripe.chargesEnabled": chargesEnabled,
          "stripe.payoutsEnabled": payoutsEnabled,
          "stripe.onboardingComplete": onboardingComplete,
          "stripe.lastStatusCheck":
            admin.firestore.FieldValue.serverTimestamp(),
          "stripe.detailsSubmitted": account.details_submitted || false,
          lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      return {
        success: true,
        chargesEnabled,
        payoutsEnabled,
        onboardingComplete,
        requiresAction,
        pendingRequirements,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error("Error checking Stripe account status:", error);
      throw new HttpsError(
        "internal",
        "Failed to check account status. Please try again.",
      );
    }
  },
);
