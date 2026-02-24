import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { STRIPE_CONFIG, calculatePlatformFee } from "../config/stripe";
import { config } from "../utils/config";

/**
 * Create a Stripe Checkout session for paying a membership fee
 *
 * This creates a payment session that:
 * 1. Charges the member the full fee amount
 * 2. Sends the platform fee (2%) to Sportnizer
 * 3. Sends the rest to the club's connected account
 * 4. Club pays the Stripe processing fees (via on_behalf_of)
 *
 * SECURITY:
 * - User must be authenticated
 * - User must be in the fee's includedMembers list OR be a guardian of someone in that list
 * - Fee must not already be paid for this beneficiary
 */
export const createCheckoutSession = onCall(
  { region: config.region, secrets: ["STRIPE_SECRET_KEY"] },
  async (
    request,
  ): Promise<{
    success: boolean;
    checkoutUrl: string;
    sessionId: string;
  }> => {
    // 1. Validate authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { feeId, beneficiaryId, successUrl, cancelUrl } = request.data;

    if (!feeId) {
      throw new HttpsError("invalid-argument", "Fee ID is required");
    }

    if (!beneficiaryId) {
      throw new HttpsError("invalid-argument", "Beneficiary ID is required");
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
    });

    const db = admin.firestore();

    try {
      // 2. Get the membership fee details
      const feeDoc = await db.collection("membershipFees").doc(feeId).get();

      if (!feeDoc.exists) {
        throw new HttpsError("not-found", "Membership fee not found");
      }

      const feeData = feeDoc.data()!;

      // 3. Check if fee is still active
      if (feeData.status !== "active") {
        throw new HttpsError(
          "failed-precondition",
          "This membership fee is no longer active",
        );
      }

      // 4. Verify user can pay for this beneficiary
      const payerId = request.auth.uid;
      const isPayingForSelf = payerId === beneficiaryId;
      const isInIncludedMembers =
        feeData.includedMembers?.includes(beneficiaryId);

      if (!isInIncludedMembers) {
        throw new HttpsError(
          "permission-denied",
          "This member is not included in this membership fee",
        );
      }

      // If paying for someone else, verify user is a guardian
      if (!isPayingForSelf) {
        const beneficiaryDoc = await db
          .collection("users")
          .doc(beneficiaryId)
          .get();

        if (!beneficiaryDoc.exists) {
          throw new HttpsError("not-found", "Beneficiary not found");
        }

        const beneficiaryData = beneficiaryDoc.data();
        const guardians = beneficiaryData?.guardians || [];
        const isGuardian = guardians.some(
          (g: { guardianUid: string }) => g.guardianUid === payerId,
        );

        if (!isGuardian) {
          throw new HttpsError(
            "permission-denied",
            "You are not authorized to pay for this member",
          );
        }
      }

      // 5. Check if already paid for this beneficiary
      const existingPayment = await db
        .collection("payments")
        .where("feeId", "==", feeId)
        .where("beneficiaryId", "==", beneficiaryId)
        .where("status", "==", "succeeded")
        .limit(1)
        .get();

      if (!existingPayment.empty) {
        throw new HttpsError(
          "already-exists",
          "This membership fee has already been paid for this member",
        );
      }

      // 6. Check for pending payment sessions (prevent simultaneous payments)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const pendingSessions = await db
        .collection("payments")
        .where("feeId", "==", feeId)
        .where("beneficiaryId", "==", beneficiaryId)
        .where("status", "==", "pending")
        .where("createdAt", ">", fifteenMinutesAgo)
        .limit(1)
        .get();

      if (!pendingSessions.empty) {
        throw new HttpsError(
          "already-exists",
          "A payment is already in progress for this member. Please wait a few minutes or try again later.",
        );
      }

      // 7. Get club's Stripe account
      const clubDoc = await db.collection("clubs").doc(feeData.clubId).get();

      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      const clubData = clubDoc.data()!;

      if (!clubData.stripe?.accountId || !clubData.stripe?.chargesEnabled) {
        throw new HttpsError(
          "failed-precondition",
          "Club has not completed payment setup",
        );
      }

      // 8. Get payer and beneficiary names
      const [payerDoc, beneficiaryDoc] = await Promise.all([
        db.collection("users").doc(payerId).get(),
        payerId === beneficiaryId
          ? null
          : db.collection("users").doc(beneficiaryId).get(),
      ]);

      const payerData = payerDoc.data();
      const payerName = payerData?.displayName || payerData?.name || "Unknown";
      const beneficiaryData = beneficiaryDoc?.data();
      const beneficiaryName =
        payerId === beneficiaryId
          ? payerName
          : beneficiaryData?.displayName || beneficiaryData?.name || "Unknown";

      // 9. Calculate fees
      const amount = feeData.amount; // In smallest unit (öre/cents)
      const platformFee = calculatePlatformFee(amount);

      // 10. Create payment record (pending status)
      const paymentRef = db.collection("payments").doc();
      await paymentRef.set({
        feeId,
        feeTitle: feeData.title,
        clubId: feeData.clubId,
        groupId: feeData.groupId,
        payerId,
        payerName,
        beneficiaryId,
        beneficiaryName,
        amount,
        currency: feeData.currency,
        platformFee,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        paidAt: null,
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
      });

      // 11. Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: feeData.currency,
              product_data: {
                name: feeData.title,
                description: `${feeData.groupName || "Group"} - ${clubData.name}${
                  payerId !== beneficiaryId ? ` (for ${beneficiaryName})` : ""
                }`,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        // Platform fee goes to Sportnizer
        payment_intent_data: {
          application_fee_amount: platformFee,
          // on_behalf_of makes the club the settlement merchant
          // This means Stripe fees are charged to the club's account, not platform
          on_behalf_of: clubData.stripe.accountId,
          transfer_data: {
            destination: clubData.stripe.accountId,
          },
          metadata: {
            paymentId: paymentRef.id,
            feeId,
            payerId,
            beneficiaryId,
            clubId: feeData.clubId,
            groupId: feeData.groupId,
          },
        },
        success_url: `${successUrl || STRIPE_CONFIG.successUrl}?session_id={CHECKOUT_SESSION_ID}&payment_id=${paymentRef.id}`,
        cancel_url: `${cancelUrl || STRIPE_CONFIG.cancelUrl}?payment_id=${paymentRef.id}`,
        metadata: {
          paymentId: paymentRef.id,
          feeId,
          payerId,
          beneficiaryId,
          clubId: feeData.clubId,
          groupId: feeData.groupId,
        },
        customer_email: payerDoc.data()?.email,
        expires_at:
          Math.floor(Date.now() / 1000) +
          STRIPE_CONFIG.checkoutSessionExpireMinutes * 60,
      });

      // 12. Update payment record with session ID
      await paymentRef.update({
        stripeCheckoutSessionId: session.id,
      });

      return {
        success: true,
        checkoutUrl: session.url!,
        sessionId: session.id,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error("Error creating checkout session:", error);
      throw new HttpsError(
        "internal",
        "Failed to create payment session. Please try again.",
      );
    }
  },
);
