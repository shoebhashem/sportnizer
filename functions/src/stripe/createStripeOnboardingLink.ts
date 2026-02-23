import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { STRIPE_CONFIG } from "../config/stripe";
import { config } from "../utils/config";

/**
 * Create a Stripe onboarding link for a club's connected account
 *
 * This generates a URL that redirects the club admin to Stripe's hosted
 * onboarding flow where they complete KYC verification and add bank details.
 *
 * SECURITY: Only club-admin role can call this function
 */
export const createStripeOnboardingLink = onCall(
  { region: config.region, secrets: ["STRIPE_SECRET_KEY"] },
  async (request): Promise<{ success: boolean; onboardingUrl: string }> => {
    // 1. Validate authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, returnUrl, refreshUrl } = request.data;

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
          "Only club administrators can manage payment settings",
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
          "Club does not have a Stripe account. Please enable payments first.",
        );
      }

      // 4. Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        type: "account_onboarding",
        return_url: returnUrl || STRIPE_CONFIG.onboardingReturnUrl,
        refresh_url: refreshUrl || STRIPE_CONFIG.onboardingRefreshUrl,
        collect: "eventually_due", // Collect all required info upfront
      });

      return {
        success: true,
        onboardingUrl: accountLink.url,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error("Error creating Stripe onboarding link:", error);
      throw new HttpsError(
        "internal",
        "Failed to create onboarding link. Please try again.",
      );
    }
  },
);
