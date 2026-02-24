/**
 * Create Subscription Checkout Session
 *
 * Creates a Stripe Checkout session for club admins to subscribe to a paid tier.
 * This handles the Clubs → Sportnizer payment flow (platform subscription).
 *
 * IMPORTANT: This is separate from Stripe Connect (member payments to clubs).
 */

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import Stripe from "stripe";
import {
    getCurrencyForCountry,
    getPriceIdForSubscription,
} from "../config/subscriptionConfig";
import { config } from "../utils/config";

interface CreateSubscriptionCheckoutRequest {
  clubId: string;
  tier: "basic" | "pro";
  successUrl: string;
  cancelUrl: string;
}

interface CreateSubscriptionCheckoutResponse {
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
}

export const createSubscriptionCheckout = onCall(
  {
    region: config.region,
    secrets: ["STRIPE_SECRET_KEY"],
  },
  async (request): Promise<CreateSubscriptionCheckoutResponse> => {
    // Initialize Stripe inside the function
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
    });

    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const {
        clubId,
        tier,
        successUrl,
        cancelUrl,
      }: CreateSubscriptionCheckoutRequest = request.data;

      // Validate required fields
      if (!clubId || !tier || !successUrl || !cancelUrl) {
        throw new HttpsError(
          "invalid-argument",
          "Missing required fields: clubId, tier, successUrl, cancelUrl",
        );
      }

      // Validate tier
      if (!["basic", "pro"].includes(tier)) {
        throw new HttpsError(
          "invalid-argument",
          'Invalid tier. Must be "basic" or "pro"',
        );
      }

      const userId = request.auth.uid;
      console.log(
        `Creating subscription checkout for club ${clubId}, tier: ${tier}, user: ${userId}`,
      );

      // Get user document to verify club-admin role
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(userId)
        .get();
      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User profile not found");
      }

      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];
      const userClubAccess = clubAccess.find((c: any) => c.clubId === clubId);

      if (!userClubAccess || userClubAccess.role !== "club-admin") {
        throw new HttpsError(
          "permission-denied",
          "Only club administrators can manage subscriptions",
        );
      }

      // Get club document
      const clubRef = admin.firestore().collection("clubs").doc(clubId);
      const clubDoc = await clubRef.get();

      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      const clubData = clubDoc.data();
      const clubName = clubData?.name || "Unknown Club";

      // Determine country and currency
      // Priority: club.stripe.country > 'SE' (default for Sweden)
      const country = clubData?.stripe?.country || "SE";
      const currency = getCurrencyForCountry(country);

      // Get the appropriate price ID for this tier and currency
      const priceId = getPriceIdForSubscription(tier, country);
      console.log(
        `Using price ID: ${priceId} for tier: ${tier}, country: ${country}, currency: ${currency}`,
      );

      // Check if club already has an active subscription
      const existingSubscriptionId =
        clubData?.subscription?.stripeSubscriptionId;
      const existingTier = clubData?.subscription?.tier;
      const existingStatus = clubData?.subscription?.status;

      // If club has an active subscription, they should use updateSubscription instead
      if (
        existingSubscriptionId &&
        existingTier &&
        existingTier !== "free" &&
        existingStatus !== "cancelled"
      ) {
        throw new HttpsError(
          "already-exists",
          `Club already has an active ${existingTier} subscription. Use the upgrade option to change tiers.`,
        );
      }

      // Check if club already has a Stripe customer ID
      let customerId = clubData?.subscription?.stripeCustomerId;

      if (!customerId) {
        // Create a new Stripe customer for this club
        const customer = await stripe.customers.create({
          name: clubName,
          email: userData?.email,
          metadata: {
            clubId: clubId,
            clubName: clubName,
            createdByUserId: userId,
          },
        });
        customerId = customer.id;
        console.log(`Created new Stripe customer: ${customerId}`);

        // Store customer ID in club document
        await clubRef.update({
          "subscription.stripeCustomerId": customerId,
          "subscription.status": "active", // Will be updated by webhook
          lastModified: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Create Checkout Session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        subscription_data: {
          metadata: {
            clubId: clubId,
            tier: tier,
          },
        },
        metadata: {
          clubId: clubId,
          tier: tier,
          type: "platform_subscription", // Distinguishes from member payments
        },
        allow_promotion_codes: true,
        billing_address_collection: "required",
        customer_update: {
          address: "auto",
        },
      });

      console.log(`Created checkout session: ${session.id}`);

      return {
        success: true,
        checkoutUrl: session.url || undefined,
        sessionId: session.id,
      };
    } catch (error) {
      console.error("Error creating subscription checkout:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      if (error instanceof Stripe.errors.StripeError) {
        throw new HttpsError("internal", `Stripe error: ${error.message}`);
      }

      throw new HttpsError(
        "internal",
        "Failed to create subscription checkout",
      );
    }
  },
);
