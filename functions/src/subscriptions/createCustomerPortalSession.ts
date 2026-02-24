/**
 * Create Customer Portal Session
 *
 * Creates a Stripe Customer Portal session for club admins to manage their subscription.
 * This allows clubs to update payment methods, view invoices, and cancel subscriptions.
 */

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { config } from "../utils/config";

interface CreateCustomerPortalRequest {
  clubId: string;
  returnUrl: string;
}

interface CreateCustomerPortalResponse {
  success: boolean;
  portalUrl?: string;
  error?: string;
}

export const createCustomerPortalSession = onCall(
  {
    region: config.region,
    secrets: ["STRIPE_SECRET_KEY"],
  },
  async (request): Promise<CreateCustomerPortalResponse> => {
    // Initialize Stripe inside the function
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
    });

    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const { clubId, returnUrl }: CreateCustomerPortalRequest = request.data;

      // Validate required fields
      if (!clubId || !returnUrl) {
        throw new HttpsError(
          "invalid-argument",
          "Missing required fields: clubId, returnUrl",
        );
      }

      const userId = request.auth.uid;
      console.log(
        `Creating customer portal session for club ${clubId}, user: ${userId}`,
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
      const clubDoc = await admin
        .firestore()
        .collection("clubs")
        .doc(clubId)
        .get();

      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      const clubData = clubDoc.data();
      const customerId = clubData?.subscription?.stripeCustomerId;

      if (!customerId) {
        throw new HttpsError(
          "failed-precondition",
          "No subscription found for this club. Please subscribe first.",
        );
      }

      // Create Customer Portal Session
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      console.log(`Created customer portal session for club ${clubId}`);

      return {
        success: true,
        portalUrl: session.url,
      };
    } catch (error) {
      console.error("Error creating customer portal session:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      if (error instanceof Stripe.errors.StripeError) {
        throw new HttpsError("internal", `Stripe error: ${error.message}`);
      }

      throw new HttpsError(
        "internal",
        "Failed to create customer portal session",
      );
    }
  },
);
