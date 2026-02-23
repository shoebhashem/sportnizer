import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { STRIPE_CONFIG } from "../config/stripe";
import { config } from "../utils/config";

/**
 * Create a Stripe Connect Express account for a club
 *
 * This creates a connected account that allows the club to receive payments.
 * The club admin will then be redirected to Stripe's hosted onboarding to
 * complete KYC verification and bank account setup.
 *
 * SECURITY: Only club-admin role can call this function
 */
export const createStripeConnectedAccount = onCall(
  { region: config.region, secrets: ["STRIPE_SECRET_KEY"] },
  async (
    request,
  ): Promise<{ success: boolean; accountId: string; message: string }> => {
    // 1. Validate authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, country } = request.data;

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
          "Only club administrators can enable payments",
        );
      }

      // 3. Check if club already has a Stripe account
      const clubDoc = await db.collection("clubs").doc(clubId).get();

      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      const clubData = clubDoc.data();

      if (clubData?.stripe?.accountId) {
        throw new HttpsError(
          "already-exists",
          "Club already has a Stripe account configured",
        );
      }

      // 4. Create Stripe Express connected account
      const account = await stripe.accounts.create({
        type: "express",
        country: country || "SE", // Default to Sweden
        email: userData?.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "company",
        business_profile: {
          name: clubData?.name,
          mcc: "7941", // Sports clubs, membership
          product_description: "Sports club membership fees",
        },
        metadata: {
          clubId: clubId,
          createdBy: request.auth.uid,
        },
      });

      // 5. Update club document with Stripe account info
      await db
        .collection("clubs")
        .doc(clubId)
        .update({
          stripe: {
            accountId: account.id,
            country: country || "SE",
            currency: getCurrencyForCountry(country || "SE"),
            chargesEnabled: false,
            payoutsEnabled: false,
            onboardingComplete: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      return {
        success: true,
        accountId: account.id,
        message:
          "Stripe account created. Please complete onboarding to enable payments.",
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error("Error creating Stripe account:", error);
      throw new HttpsError(
        "internal",
        "Failed to create Stripe account. Please try again.",
      );
    }
  },
);

/**
 * Get currency for a country code
 */
function getCurrencyForCountry(countryCode: string): string {
  const currencyMap: Record<string, string> = {
    SE: "sek",
    NO: "nok",
    DK: "dkk",
    FI: "eur",
    DE: "eur",
    NL: "eur",
    BE: "eur",
    FR: "eur",
    AT: "eur",
    ES: "eur",
    PT: "eur",
    IT: "eur",
    IE: "eur",
    GB: "gbp",
    CH: "chf",
    US: "usd",
    CA: "cad",
    AU: "aud",
    NZ: "nzd",
    PL: "pln",
  };

  return (
    currencyMap[countryCode.toUpperCase()] || STRIPE_CONFIG.defaultCurrency
  );
}
