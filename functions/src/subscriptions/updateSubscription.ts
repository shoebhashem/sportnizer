/**
 * Update Subscription
 *
 * Handles upgrading/downgrading a club's subscription tier using Stripe's
 * subscription update API with proration.
 *
 * This is called when a club already has an active subscription and wants
 * to change to a different tier (e.g., Basic → Pro).
 */

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { getPriceIdForSubscription } from "../config/subscriptionConfig";
import { config } from "../utils/config";

interface UpdateSubscriptionRequest {
  clubId: string;
  newTier: "basic" | "pro";
}

interface UpdateSubscriptionResponse {
  success: boolean;
  error?: string;
  subscription?: {
    id: string;
    tier: string;
    status: string;
  };
}

export const updateSubscription = onCall(
  {
    region: config.region,
    secrets: ["STRIPE_SECRET_KEY"],
  },
  async (request): Promise<UpdateSubscriptionResponse> => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
    });

    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const { clubId, newTier }: UpdateSubscriptionRequest = request.data;

      // Validate required fields
      if (!clubId || !newTier) {
        throw new HttpsError(
          "invalid-argument",
          "Missing required fields: clubId, newTier",
        );
      }

      // Validate tier
      if (!["basic", "pro"].includes(newTier)) {
        throw new HttpsError(
          "invalid-argument",
          'Invalid tier. Must be "basic" or "pro"',
        );
      }

      const userId = request.auth.uid;
      console.log(
        `Updating subscription for club ${clubId} to ${newTier}, user: ${userId}`,
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

      // Verify club has an active subscription to update
      const subscriptionId = clubData?.subscription?.stripeSubscriptionId;
      const currentTier = clubData?.subscription?.tier;
      const subscriptionStatus = clubData?.subscription?.status;

      if (!subscriptionId) {
        throw new HttpsError(
          "failed-precondition",
          "Club does not have an active subscription to update. Use checkout to create a new subscription.",
        );
      }

      // Check if trying to switch to the same tier
      if (currentTier === newTier) {
        throw new HttpsError(
          "invalid-argument",
          `Club is already subscribed to the ${newTier} tier`,
        );
      }

      // Don't allow changes if subscription is cancelled (but still active until period end)
      if (subscriptionStatus === "cancelled") {
        throw new HttpsError(
          "failed-precondition",
          "Cannot modify a cancelled subscription. Wait for the current period to end, then create a new subscription.",
        );
      }

      // Get the Stripe subscription
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      if (subscription.status === "canceled") {
        throw new HttpsError(
          "failed-precondition",
          "Subscription has been cancelled in Stripe",
        );
      }

      // Determine country and currency from the subscription
      const country = clubData?.stripe?.country || "SE";
      const newPriceId = getPriceIdForSubscription(newTier, country);

      console.log(
        `Updating subscription ${subscriptionId} from ${currentTier} to ${newTier}, price: ${newPriceId}`,
      );

      // Get current subscription item ID
      const currentItemId = subscription.items.data[0]?.id;

      if (!currentItemId) {
        throw new HttpsError(
          "internal",
          "Could not find subscription item to update",
        );
      }

      // Update the subscription with the new price
      // This uses proration by default - customer will be credited/charged for the difference
      const updatedSubscription = await stripe.subscriptions.update(
        subscriptionId,
        {
          items: [
            {
              id: currentItemId,
              price: newPriceId,
            },
          ],
          // Proration behavior: create prorations for any changes
          proration_behavior: "create_prorations",
          // Update metadata
          metadata: {
            clubId: clubId,
            tier: newTier,
            updatedAt: new Date().toISOString(),
          },
        },
      );

      console.log(
        `Successfully updated subscription to ${newTier}, status: ${updatedSubscription.status}`,
      );

      // Note: The webhook will handle updating Firestore with the new tier
      // But we can optimistically update some fields here for faster UI feedback
      await clubRef.update({
        "subscription.tier": newTier,
        "subscription.stripePriceId": newPriceId,
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        subscription: {
          id: updatedSubscription.id,
          tier: newTier,
          status: updatedSubscription.status,
        },
      };
    } catch (error) {
      console.error("Error updating subscription:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      if (error instanceof Stripe.errors.StripeError) {
        throw new HttpsError("internal", `Stripe error: ${error.message}`);
      }

      throw new HttpsError("internal", "Failed to update subscription");
    }
  },
);
