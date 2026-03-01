/**
 * Subscription Webhook Handler
 *
 * Handles Stripe webhook events for platform subscriptions (Clubs → Clubnizer).
 * This is separate from the existing stripeWebhookHandler which handles member payments.
 *
 * Events handled:
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.payment_succeeded
 * - invoice.payment_failed
 */

import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import {
    STRIPE_PRICE_IDS,
    SubscriptionTier,
    getMaxMembersForTier,
} from "../config/subscriptionConfig";
import { config } from "../utils/config";

/**
 * Determine tier from Stripe price ID
 */
function getTierFromPriceId(priceId: string): SubscriptionTier {
  // Check Basic prices
  for (const [, id] of Object.entries(STRIPE_PRICE_IDS.basic)) {
    if (id === priceId) return "basic";
  }

  // Check Pro prices
  for (const [, id] of Object.entries(STRIPE_PRICE_IDS.pro)) {
    if (id === priceId) return "pro";
  }

  // Default to free if not found (shouldn't happen)
  console.warn(`Unknown price ID: ${priceId}, defaulting to free tier`);
  return "free";
}

/**
 * Find club by Stripe customer ID
 */
async function findClubByCustomerId(
  customerId: string,
): Promise<{ clubId: string; clubData: any } | null> {
  const clubsSnapshot = await admin
    .firestore()
    .collection("clubs")
    .where("subscription.stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (clubsSnapshot.empty) {
    return null;
  }

  const clubDoc = clubsSnapshot.docs[0];
  return {
    clubId: clubDoc.id,
    clubData: clubDoc.data(),
  };
}

/**
 * Update club subscription in Firestore
 */
async function updateClubSubscription(
  clubId: string,
  subscriptionUpdate: Partial<{
    tier: SubscriptionTier;
    status: string;
    stripeSubscriptionId: string | null;
    stripePriceId: string | null;
    currentPeriodStart: admin.firestore.Timestamp | null;
    currentPeriodEnd: admin.firestore.Timestamp | null;
    cancelAtPeriodEnd: boolean;
    paymentFailedAt: admin.firestore.Timestamp | null;
  }>,
): Promise<void> {
  const updateData: Record<string, any> = {
    lastModified: admin.firestore.FieldValue.serverTimestamp(),
    version: admin.firestore.FieldValue.increment(1),
  };

  // Flatten subscription updates
  for (const [key, value] of Object.entries(subscriptionUpdate)) {
    updateData[`subscription.${key}`] = value;
  }

  // Also update maxMembers based on tier if tier is changing
  if (subscriptionUpdate.tier) {
    const maxMembers = getMaxMembersForTier(subscriptionUpdate.tier);
    updateData.maxMembers = maxMembers;
  }

  await admin.firestore().collection("clubs").doc(clubId).update(updateData);
}

/**
 * Handle subscription created/updated
 */
async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = subscription.customer as string;
  const club = await findClubByCustomerId(customerId);

  if (!club) {
    console.error(`No club found for Stripe customer: ${customerId}`);
    return;
  }

  // Get the price ID from the subscription
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) {
    console.error("No price ID found in subscription");
    return;
  }

  const tier = getTierFromPriceId(priceId);

  // Map Stripe status to our status
  let status: string;
  switch (subscription.status) {
    case "active":
    case "trialing":
      status = subscription.status;
      break;
    case "past_due":
      status = "past_due";
      break;
    case "canceled":
    case "unpaid":
      status = "cancelled";
      break;
    default:
      status = "active";
  }

  console.log(
    `Updating club ${club.clubId} subscription: tier=${tier}, status=${status}`,
  );

  // Safely convert Unix timestamps to Firestore Timestamps
  const currentPeriodStart = subscription.current_period_start
    ? admin.firestore.Timestamp.fromMillis(
        subscription.current_period_start * 1000,
      )
    : null;
  const currentPeriodEnd = subscription.current_period_end
    ? admin.firestore.Timestamp.fromMillis(
        subscription.current_period_end * 1000,
      )
    : null;

  await updateClubSubscription(club.clubId, {
    tier,
    status,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    paymentFailedAt: null, // Clear any previous payment failure
  });
}

/**
 * Handle subscription deleted (cancelled)
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = subscription.customer as string;
  const club = await findClubByCustomerId(customerId);

  if (!club) {
    console.error(`No club found for Stripe customer: ${customerId}`);
    return;
  }

  console.log(
    `Club ${club.clubId} subscription cancelled, reverting to free tier`,
  );

  // Revert to free tier
  await updateClubSubscription(club.clubId, {
    tier: "free",
    status: "active", // Free tier is always "active"
    stripeSubscriptionId: null,
    stripePriceId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    paymentFailedAt: null,
  });
}

/**
 * Handle payment failure
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  const club = await findClubByCustomerId(customerId);

  if (!club) {
    console.error(`No club found for Stripe customer: ${customerId}`);
    return;
  }

  // Check if this is a subscription invoice
  if (!invoice.subscription) {
    console.log("Invoice is not for a subscription, skipping");
    return;
  }

  console.log(`Payment failed for club ${club.clubId}`);

  await updateClubSubscription(club.clubId, {
    status: "past_due",
    paymentFailedAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Handle successful payment (clears past_due status)
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  const club = await findClubByCustomerId(customerId);

  if (!club) {
    // This might be a new customer, which is fine
    console.log(
      `No club found for Stripe customer: ${customerId} (might be new)`,
    );
    return;
  }

  // Check if this is a subscription invoice
  if (!invoice.subscription) {
    console.log("Invoice is not for a subscription, skipping");
    return;
  }

  // Only update if club was in past_due status
  if (club.clubData?.subscription?.status === "past_due") {
    console.log(
      `Payment recovered for club ${club.clubId}, clearing past_due status`,
    );

    await updateClubSubscription(club.clubId, {
      status: "active",
      paymentFailedAt: null,
    });
  }
}

/**
 * Main webhook handler
 */
export const subscriptionWebhookHandler = onRequest(
  {
    region: config.region,
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_SUBSCRIPTION_WEBHOOK_SECRET"],
    // Allow Stripe's IP addresses
    cors: false,
  },
  async (req, res) => {
    // Initialize Stripe inside the function
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
    });

    const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("Subscription webhook secret not configured");
      res.status(500).json({ error: "Webhook not configured" });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const sig = req.headers["stripe-signature"];

    if (!sig) {
      console.error("No Stripe signature found");
      res.status(400).send("No signature");
      return;
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    console.log(`Received subscription webhook event: ${event.type}`);

    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
          await handleSubscriptionChange(
            event.data.object as Stripe.Subscription,
          );
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription,
          );
          break;

        case "invoice.payment_failed":
          await handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case "invoice.payment_succeeded":
          await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Error processing webhook:", error);
      // Return 200 to acknowledge receipt (Stripe will retry otherwise)
      // But log the error for debugging
      res.status(200).json({ received: true, error: "Processing error" });
    }
  },
);
