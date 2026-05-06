import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { resolveClubAccountNumbers } from "../accounting/chartOfAccounts";
import { createVerification } from "../accounting/verificationService";
import { FeeComponent } from "../config/accounting";
import { config } from "../utils/config";

/**
 * Stripe Platform Webhook Handler
 *
 * Handles platform-level events (e.g. account.updated from connected account onboarding).
 * Payment events (checkout.session.completed etc.) for direct charges are handled by
 * stripeConnectWebhookHandler below, which uses a separate Connect webhook secret.
 *
 * IMPORTANT: This is an HTTP endpoint (onRequest), NOT a callable function (onCall)
 * because Stripe sends raw HTTP POST requests with signature headers.
 */
export const stripeWebhookHandler = onRequest(
  {
    region: config.region,
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    // IMPORTANT: We need the raw body for signature verification
    // Firebase will parse JSON by default, but we need the raw buffer
  },
  async (req, res) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
    });

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("Stripe webhook secret not configured");
      res.status(500).json({ error: "Webhook not configured" });
      return;
    }

    // Only allow POST requests
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Get the signature header
    const signature = req.headers["stripe-signature"];

    if (!signature) {
      console.error("Missing stripe-signature header");
      res.status(400).json({ error: "Missing signature" });
      return;
    }

    let event: Stripe.Event;

    try {
      // SECURITY: Verify the webhook signature
      // This ensures the request came from Stripe and wasn't tampered with
      // Note: We use req.rawBody which Firebase provides for signature verification
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        webhookSecret,
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      res.status(400).json({ error: "Signature verification failed" });
      return;
    }

    const db = admin.firestore();

    // SECURITY: Idempotency check - prevent processing duplicate events
    const eventRef = db.collection("stripeEvents").doc(event.id);
    const eventDoc = await eventRef.get();

    if (eventDoc.exists) {
      console.log("Event already processed:", event.id);
      res.json({ received: true, duplicate: true });
      return;
    }

    // Return 200 immediately to acknowledge receipt
    // Stripe will retry if it doesn't receive a 2xx response within 30 seconds
    res.json({ received: true });

    // Mark event as processing to prevent race conditions
    try {
      await eventRef.set({
        type: event.type,
        processedAt: FieldValue.serverTimestamp(),
        livemode: event.livemode,
      });
    } catch (_error) {
      // If this fails, another instance is already processing
      console.log("Event being processed by another instance:", event.id);
      return;
    }

    // Process the event
    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session,
            db,
            stripe,
            "",
          );
          break;

        case "checkout.session.expired":
          await handleCheckoutExpired(
            event.data.object as Stripe.Checkout.Session,
            db,
          );
          break;

        case "payment_intent.payment_failed":
          await handlePaymentFailed(
            event.data.object as Stripe.PaymentIntent,
            db,
          );
          break;

        case "charge.refunded":
          await handleChargeRefunded(
            event.data.object as Stripe.Charge,
            db,
            stripe,
            "",
          );
          break;

        // Account events for connected accounts (onboarding status)
        case "account.updated":
          await handleAccountUpdated(event.data.object as Stripe.Account, db);
          break;

        default:
          console.log("Unhandled event type:", event.type);
      }

      // Update event as successfully processed
      await eventRef.update({
        status: "processed",
        completedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("Error processing webhook event:", event.type, error);

      // Update event as failed
      await eventRef.update({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        failedAt: FieldValue.serverTimestamp(),
      });
    }
  },
);

/**
 * Stripe Connect Webhook Handler
 *
 * Handles payment events fired on connected accounts (clubs) when using direct charges.
 * With direct charges the Checkout Session lives on the connected account, so
 * checkout.session.completed, payment_intent.payment_failed, etc. are dispatched
 * to a Connect application webhook — NOT the platform webhook above.
 *
 * Register this endpoint in the Stripe Dashboard as a "Connect application" webhook
 * (Developers → Webhooks → Add endpoint, type: "Connect application") and set the
 * signing secret as the STRIPE_CONNECT_WEBHOOK_SECRET Firebase secret.
 *
 * Events to subscribe: checkout.session.completed, checkout.session.expired,
 *                      payment_intent.payment_failed, charge.refunded
 */
export const stripeConnectWebhookHandler = onRequest(
  {
    region: config.region,
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET"],
  },
  async (req, res) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
    });

    const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

    if (!connectWebhookSecret) {
      console.error("Stripe Connect webhook secret not configured");
      res.status(500).json({ error: "Webhook not configured" });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const signature = req.headers["stripe-signature"];
    if (!signature) {
      console.error("Missing stripe-signature header");
      res.status(400).json({ error: "Missing signature" });
      return;
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        connectWebhookSecret,
      );
    } catch (err: any) {
      console.error(
        "Connect webhook signature verification failed:",
        err.message,
      );
      res.status(400).json({ error: "Signature verification failed" });
      return;
    }

    const db = admin.firestore();

    // Idempotency: prefix with "connect_" to avoid collisions with platform events
    const eventRef = db.collection("stripeEvents").doc(`connect_${event.id}`);
    const eventDoc = await eventRef.get();

    if (eventDoc.exists) {
      console.log("Connect event already processed:", event.id);
      res.json({ received: true, duplicate: true });
      return;
    }

    res.json({ received: true });

    try {
      await eventRef.set({
        type: event.type,
        account: event.account,
        processedAt: FieldValue.serverTimestamp(),
        livemode: event.livemode,
      });
    } catch (_error) {
      console.log(
        "Connect event being processed by another instance:",
        event.id,
      );
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session,
            db,
            stripe,
            event.account ?? "",
          );
          break;

        case "checkout.session.expired":
          await handleCheckoutExpired(
            event.data.object as Stripe.Checkout.Session,
            db,
          );
          break;

        case "payment_intent.payment_failed":
          await handlePaymentFailed(
            event.data.object as Stripe.PaymentIntent,
            db,
          );
          break;

        case "charge.refunded":
          await handleChargeRefunded(
            event.data.object as Stripe.Charge,
            db,
            stripe,
            event.account ?? "",
          );
          break;

        default:
          console.log("Unhandled Connect event type:", event.type);
      }

      await eventRef.update({
        status: "processed",
        completedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error(
        "Error processing Connect webhook event:",
        event.type,
        error,
      );
      await eventRef.update({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        failedAt: FieldValue.serverTimestamp(),
      });
    }
  },
);

/**
 * Handle successful checkout completion
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  db: admin.firestore.Firestore,
  stripe: Stripe,
  stripeAccountId: string,
) {
  console.log("Processing checkout.session.completed:", session.id);

  const metadata = session.metadata;
  if (!metadata?.paymentId) {
    console.error("Missing paymentId in session metadata");
    return;
  }

  const { paymentId, feeId, beneficiaryId, clubId, groupId } = metadata;

  // 1. Update payment record
  const paymentRef = db.collection("payments").doc(paymentId);
  const paymentDoc = await paymentRef.get();

  if (!paymentDoc.exists) {
    console.error("Payment record not found:", paymentId);
    return;
  }

  const paymentData = paymentDoc.data()!;

  await paymentRef.update({
    status: "succeeded",
    stripePaymentIntentId: session.payment_intent,
    paidAt: FieldValue.serverTimestamp(),
  });

  // 2. Update fee's totalPaid count
  const feeRef = db.collection("membershipFees").doc(feeId);
  await feeRef.update({
    totalPaid: FieldValue.increment(1),
    lastModifiedAt: FieldValue.serverTimestamp(),
  });

  // 3. Update member's payment status in allMembers
  // Note: Using new Date() instead of serverTimestamp() because Firestore
  // doesn't allow FieldValue.serverTimestamp() inside arrays
  await updateMemberPaymentStatus(db, clubId, groupId, beneficiaryId, {
    status: "paid",
    paidAt: new Date(),
    paidBy:
      paymentData.payerId === beneficiaryId
        ? null // Paid by self
        : paymentData.payerName, // Paid by guardian
  });

  // 4. Dismiss payment notifications for ALL guardians of this beneficiary
  await dismissPaymentNotifications(db, feeId, beneficiaryId, clubId, groupId);

  // 5. Auto-create accounting verification
  try {
    await createAccountingVerification({
      session,
      paymentData,
      clubId,
      feeId,
      groupId,
      beneficiaryId,
      db,
      stripe,
      stripeAccountId,
    });
  } catch (verErr) {
    // Log but never fail the payment processing because of accounting
    console.error("Failed to create accounting verification:", verErr);
  }

  console.log("Successfully processed payment:", paymentId);
}

/**
 * Handle expired checkout sessions
 */
async function handleCheckoutExpired(
  session: Stripe.Checkout.Session,
  db: admin.firestore.Firestore,
) {
  console.log("Processing checkout.session.expired:", session.id);

  const metadata = session.metadata;
  if (!metadata?.paymentId) {
    return;
  }

  // Update payment record to expired
  const paymentRef = db.collection("payments").doc(metadata.paymentId);
  await paymentRef.update({
    status: "expired",
    expiredAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Handle failed payment intents
 */
async function handlePaymentFailed(
  paymentIntent: Stripe.PaymentIntent,
  db: admin.firestore.Firestore,
) {
  console.log("Processing payment_intent.payment_failed:", paymentIntent.id);

  const metadata = paymentIntent.metadata;
  if (!metadata?.paymentId) {
    return;
  }

  const paymentRef = db.collection("payments").doc(metadata.paymentId);
  await paymentRef.update({
    status: "failed",
    failureReason:
      paymentIntent.last_payment_error?.message || "Payment failed",
    failedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Handle refunds
 */
async function handleChargeRefunded(
  charge: Stripe.Charge,
  db: admin.firestore.Firestore,
  stripe: Stripe,
  stripeAccountId: string,
) {
  console.log("Processing charge.refunded:", charge.id);

  // Find payment by payment intent
  const paymentIntentId = charge.payment_intent;
  if (!paymentIntentId) {
    return;
  }

  const paymentQuery = await db
    .collection("payments")
    .where("stripePaymentIntentId", "==", paymentIntentId)
    .limit(1)
    .get();

  if (paymentQuery.empty) {
    console.log("No payment found for refunded charge");
    return;
  }

  const paymentDoc = paymentQuery.docs[0];
  const paymentData = paymentDoc.data();

  // Update payment status
  await paymentDoc.ref.update({
    status: "refunded",
    refundedAt: FieldValue.serverTimestamp(),
  });

  // Decrement fee's totalPaid count
  await db
    .collection("membershipFees")
    .doc(paymentData.feeId)
    .update({
      totalPaid: FieldValue.increment(-1),
      lastModifiedAt: FieldValue.serverTimestamp(),
    });

  // Update member's payment status back to pending
  await updateMemberPaymentStatus(
    db,
    paymentData.clubId,
    paymentData.groupId,
    paymentData.beneficiaryId,
    {
      status: "pending",
      paidAt: null,
      paidBy: null,
    },
  );

  // Auto-create reversal accounting verification
  try {
    const feeDoc = await db
      .collection("membershipFees")
      .doc(paymentData.feeId)
      .get();
    const fee = feeDoc.data() ?? {};

    // Resolve system account numbers for refund
    const {
      bankAccount: refundBankAccount,
      paymentFeeAccount: refundFeeAccount,
      platformFeeAccount: refundPlatformFeeAccount,
      vatOutputAccount: refundVatOutputAccount,
    } = await resolveClubAccountNumbers(db, paymentData.clubId, undefined);
    const refundComponents: FeeComponent[] =
      (fee.components as FeeComponent[]) ?? [];

    // Get the gross amount from the charge (in cents/öre)
    const grossAmount = charge.amount;

    // Fetch balance_transaction and split fees into Stripe fee vs platform fee.
    // The reversal mirrors the original payment journal entries exactly.
    let refundStripeFeeAmount = 0;
    let refundPlatformFeeAmount = 0;
    const balanceTxnId =
      typeof charge.balance_transaction === "string"
        ? charge.balance_transaction
        : charge.balance_transaction?.id;

    if (balanceTxnId && stripeAccountId) {
      try {
        const balanceTxn = await stripe.balanceTransactions.retrieve(
          balanceTxnId,
          { stripeAccount: stripeAccountId },
        );
        for (const detail of balanceTxn.fee_details) {
          if (detail.type === "stripe_fee") {
            refundStripeFeeAmount += detail.amount;
          } else if (detail.type === "application_fee") {
            refundPlatformFeeAmount += detail.amount;
          }
        }
        if (balanceTxn.fee_details.length === 0 && balanceTxn.fee > 0) {
          refundStripeFeeAmount = balanceTxn.fee;
        }
      } catch (e) {
        console.warn("Could not fetch balance_transaction for refund:", e);
      }
    }

    const totalRefundFee = refundStripeFeeAmount + refundPlatformFeeAmount;
    const netAmount = grossAmount - totalRefundFee;

    // Build reversal lines (mirror original payment journal in reverse)
    type RefundLine = {
      account: number;
      debit: number;
      credit: number;
      description: string;
    };
    const refundRevenueLines: RefundLine[] = [];

    if (refundComponents.length > 0) {
      for (const comp of refundComponents) {
        if (comp.taxExempt || comp.vatRate === 0) {
          refundRevenueLines.push({
            account: comp.resolvedRevenueAccount,
            debit: comp.amount,
            credit: 0,
            description: `Återföring: ${comp.label ?? comp.category}`,
          });
        } else {
          const netRevenue = Math.round(comp.amount / (1 + comp.vatRate / 100));
          const vatAmount = comp.amount - netRevenue;
          refundRevenueLines.push({
            account: comp.resolvedRevenueAccount,
            debit: netRevenue,
            credit: 0,
            description: `Återföring: ${comp.label ?? comp.category} (excl. VAT)`,
          });
          if (vatAmount > 0) {
            refundRevenueLines.push({
              account: refundVatOutputAccount,
              debit: vatAmount,
              credit: 0,
              description: `Återföring moms ${comp.vatRate}%`,
            });
          }
        }
      }
    } else {
      // Fallback: fee predates components model.
      const { revenueAccount: fallbackRevenue } =
        await resolveClubAccountNumbers(db, paymentData.clubId, fee.category);
      refundRevenueLines.push({
        account: fallbackRevenue,
        debit: grossAmount,
        credit: 0,
        description: "Återföring intäkt",
      });
    }

    await createVerification(db, {
      clubId: paymentData.clubId,
      date: new Date(),
      description: `Återbetalning: ${fee.title ?? paymentData.feeId}`,
      lines: [
        ...refundRevenueLines,
        ...(refundStripeFeeAmount > 0
          ? [
              {
                account: refundFeeAccount,
                debit: 0,
                credit: refundStripeFeeAmount,
                description: "Återföring Stripe-avgift",
              },
            ]
          : []),
        ...(refundPlatformFeeAmount > 0
          ? [
              {
                account: refundPlatformFeeAccount,
                debit: 0,
                credit: refundPlatformFeeAmount,
                description: "Återföring plattformsavgift",
              },
            ]
          : []),
        {
          account: refundBankAccount,
          debit: 0,
          credit: netAmount,
          description: "Stripe utbetalning återbetald",
        },
      ],
      sourceType: "stripe_refund",
      stripeChargeId: charge.id,
      stripePaymentIntentId:
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : undefined,
      feeId: paymentData.feeId,
      feeTitle: fee.title,
      category:
        refundComponents.length === 1
          ? refundComponents[0].category
          : (fee.category ?? undefined),
      basAccount:
        refundComponents.length === 1
          ? refundComponents[0].resolvedRevenueAccount
          : undefined,
      earmarkedGroupId: fee.earmarkedGroupId,
      memberId: paymentData.beneficiaryId,
      memberName: paymentData.beneficiaryName,
      groupId: paymentData.groupId,
    });
  } catch (verErr) {
    console.error("Failed to create refund verification:", verErr);
  }
}

/**
 * Handle Stripe Connect account updates
 */
async function handleAccountUpdated(
  account: Stripe.Account,
  db: admin.firestore.Firestore,
) {
  console.log("Processing account.updated:", account.id);

  // Find club by Stripe account ID
  const clubQuery = await db
    .collection("clubs")
    .where("stripe.accountId", "==", account.id)
    .limit(1)
    .get();

  if (clubQuery.empty) {
    console.log("No club found for Stripe account:", account.id);
    return;
  }

  const clubDoc = clubQuery.docs[0];

  // Update club's Stripe status
  await clubDoc.ref.update({
    "stripe.chargesEnabled": account.charges_enabled || false,
    "stripe.payoutsEnabled": account.payouts_enabled || false,
    "stripe.onboardingComplete":
      (account.charges_enabled && account.payouts_enabled) || false,
    "stripe.detailsSubmitted": account.details_submitted || false,
    "stripe.lastUpdated": FieldValue.serverTimestamp(),
    lastModifiedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Update member's payment status in allMembers collection
 */
async function updateMemberPaymentStatus(
  db: admin.firestore.Firestore,
  clubId: string,
  groupId: string,
  beneficiaryId: string,
  statusUpdate: {
    status: string;
    paidAt: Date | null;
    paidBy: string | null;
  },
) {
  const membersRef = db
    .collection("clubs")
    .doc(clubId)
    .collection("groups")
    .doc(groupId)
    .collection("allMembers")
    .doc("members");

  const membersDoc = await membersRef.get();

  if (!membersDoc.exists) {
    console.error("Members document not found");
    return;
  }

  const membersData = membersDoc.data();
  const members = membersData?.members || [];

  const memberIndex = members.findIndex(
    (m: { userId: string }) => m.userId === beneficiaryId,
  );

  if (memberIndex === -1) {
    console.error("Member not found in allMembers:", beneficiaryId);
    return;
  }

  // Update the member's payment status
  members[memberIndex].paymentStatus = {
    ...members[memberIndex].paymentStatus,
    ...statusUpdate,
  };

  await membersRef.update({ members });
}

/**
 * Dismiss payment notifications for all guardians of a beneficiary
 * Now queries from users/{userId}/notifications subcollections
 */
async function dismissPaymentNotifications(
  db: admin.firestore.Firestore,
  feeId: string,
  beneficiaryId: string,
  clubId?: string,
  groupId?: string,
) {
  // Build list of userIds to check for notifications
  const userIdsToCheck: string[] = [beneficiaryId]; // Always check the beneficiary

  // Try to find guardians from allMembers if we have clubId and groupId
  if (clubId && groupId) {
    try {
      const membersDoc = await db
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId)
        .collection("allMembers")
        .doc("members")
        .get();

      if (membersDoc.exists) {
        const membersData = membersDoc.data();
        const members = membersData?.members || [];
        const beneficiary = members.find(
          (m: { userId: string }) => m.userId === beneficiaryId,
        );

        if (beneficiary?.guardiansContacts) {
          for (const guardian of beneficiary.guardiansContacts) {
            if (guardian.guardianUid) {
              userIdsToCheck.push(guardian.guardianUid);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not fetch guardians for notification dismissal:", e);
    }
  }

  // Dismiss notifications from each user's subcollection
  let totalDismissed = 0;
  for (const userId of userIdsToCheck) {
    // Query for pending payment notifications using the consistent structure
    // Notifications now use read/dismissed fields instead of status
    const notificationsQuery = await db
      .collection("users")
      .doc(userId)
      .collection("notifications")
      .where("type", "==", "payment_request")
      .where("dismissed", "==", false)
      .get();

    // Filter by feeId and beneficiaryId in code (metadata fields)
    const matchingDocs = notificationsQuery.docs.filter((doc) => {
      const data = doc.data();
      const metadata = data.metadata || {};
      return (
        metadata.feeId === feeId && metadata.beneficiaryId === beneficiaryId
      );
    });

    if (matchingDocs.length > 0) {
      const batch = db.batch();
      matchingDocs.forEach((doc) => {
        batch.update(doc.ref, {
          dismissed: true,
          read: true,
          actionTakenAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
      totalDismissed += matchingDocs.length;
    }
  }

  if (totalDismissed > 0) {
    console.log(`Dismissed ${totalDismissed} payment notifications`);
  }
}

// ---------------------------------------------------------------------------
// Accounting: auto-create verification after a successful payment
// ---------------------------------------------------------------------------

interface AccountingVerificationInput {
  session: Stripe.Checkout.Session;
  paymentData: FirebaseFirestore.DocumentData;
  clubId: string;
  feeId: string;
  groupId: string;
  beneficiaryId: string;
  db: admin.firestore.Firestore;
  stripe: Stripe;
  stripeAccountId: string;
}

async function createAccountingVerification({
  session,
  paymentData,
  clubId,
  feeId,
  groupId,
  beneficiaryId,
  db,
  stripe,
  stripeAccountId,
}: AccountingVerificationInput): Promise<void> {
  // 1. Fetch the fee and its components
  const feeDoc = await db.collection("membershipFees").doc(feeId).get();
  const fee = feeDoc.data() ?? {};
  const feeComponents: FeeComponent[] =
    (fee.components as FeeComponent[]) ?? [];

  // 2. Resolve system account numbers (bank, fee accounts, VAT output).
  //    Component-level revenue accounts are already snapshotted in fee.components.
  const {
    bankAccount,
    paymentFeeAccount,
    platformFeeAccount,
    vatOutputAccount,
  } = await resolveClubAccountNumbers(db, clubId, undefined);

  // 3. Gross amount is the checkout amount_total (in smallest currency unit)
  const grossAmount = session.amount_total ?? 0;
  if (grossAmount <= 0) return;

  // 4. Fetch balance_transaction and split fees into Stripe fee vs platform fee.
  //    fee_details separates "stripe_fee" (processing cost charged by Stripe) from
  //    "application_fee" (platform fee collected by Clubnizer). Both reduce the
  //    club’s bank balance and must be booked as separate expense lines.
  let stripeFeeAmount = 0;
  let platformFeeAmount = 0;
  if (stripeAccountId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(
        session.payment_intent as string,
        { stripeAccount: stripeAccountId },
      );
      const chargeId =
        typeof pi.latest_charge === "string"
          ? pi.latest_charge
          : pi.latest_charge?.id;

      if (chargeId) {
        const charge = await stripe.charges.retrieve(chargeId, {
          stripeAccount: stripeAccountId,
        });
        const balanceTxnId =
          typeof charge.balance_transaction === "string"
            ? charge.balance_transaction
            : charge.balance_transaction?.id;

        if (balanceTxnId) {
          const balanceTxn = await stripe.balanceTransactions.retrieve(
            balanceTxnId,
            { stripeAccount: stripeAccountId },
          );
          for (const detail of balanceTxn.fee_details) {
            if (detail.type === "stripe_fee") {
              stripeFeeAmount += detail.amount;
            } else if (detail.type === "application_fee") {
              platformFeeAmount += detail.amount;
            }
          }
          // Fallback: fee_details empty but fee > 0 — treat all as Stripe fee
          if (balanceTxn.fee_details.length === 0 && balanceTxn.fee > 0) {
            stripeFeeAmount = balanceTxn.fee;
          }
        }
      }
    } catch (e) {
      console.warn("Could not fetch Stripe balance_transaction:", e);
      // Continue with fees = 0; debit/credit will still balance
    }
  }

  const totalFee = stripeFeeAmount + platformFeeAmount;
  const netAmount = grossAmount - totalFee;
  const memberName: string =
    paymentData.beneficiaryName ?? paymentData.payerName ?? "Okänd medlem";

  // 5. Build double-entry lines
  //    Per-component revenue credits with VAT split; single bank debit.
  type JournalLine = {
    account: number;
    debit: number;
    credit: number;
    description: string;
  };
  const revenueLines: JournalLine[] = [];

  if (feeComponents.length > 0) {
    for (const comp of feeComponents) {
      if (comp.taxExempt || comp.vatRate === 0) {
        revenueLines.push({
          account: comp.resolvedRevenueAccount,
          debit: 0,
          credit: comp.amount,
          description: comp.label ?? comp.category,
        });
      } else {
        const netRevenue = Math.round(comp.amount / (1 + comp.vatRate / 100));
        const vatAmount = comp.amount - netRevenue;
        revenueLines.push({
          account: comp.resolvedRevenueAccount,
          debit: 0,
          credit: netRevenue,
          description: `${comp.label ?? comp.category} (excl. VAT)`,
        });
        if (vatAmount > 0) {
          revenueLines.push({
            account: vatOutputAccount,
            debit: 0,
            credit: vatAmount,
            description: `Utgående moms ${comp.vatRate}%`,
          });
        }
      }
    }
  } else {
    // Fallback: fee predates components model — use top-level category.
    const { revenueAccount: fallbackRevenue } = await resolveClubAccountNumbers(
      db,
      clubId,
      fee.category,
    );
    revenueLines.push({
      account: fallbackRevenue,
      debit: 0,
      credit: grossAmount,
      description: fee.title ?? feeId,
    });
  }

  const lines: JournalLine[] = [
    {
      account: bankAccount,
      debit: netAmount,
      credit: 0,
      description: "Stripe net (bank)",
    },
    ...(stripeFeeAmount > 0
      ? [
          {
            account: paymentFeeAccount,
            debit: stripeFeeAmount,
            credit: 0,
            description: "Stripe-avgift",
          },
        ]
      : []),
    ...(platformFeeAmount > 0
      ? [
          {
            account: platformFeeAccount,
            debit: platformFeeAmount,
            credit: 0,
            description: "Plattformsavgift",
          },
        ]
      : []),
    ...revenueLines,
  ];

  await createVerification(db, {
    clubId,
    date: new Date(),
    description: `${fee.title ?? feeId} — ${memberName}`,
    lines,
    sourceType: "stripe_payment",
    stripeChargeId: undefined,
    stripePaymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : undefined,
    feeId,
    feeTitle: fee.title,
    category:
      feeComponents.length === 1
        ? feeComponents[0].category
        : (fee.category ?? undefined),
    basAccount:
      feeComponents.length === 1
        ? feeComponents[0].resolvedRevenueAccount
        : undefined,
    earmarkedGroupId: fee.earmarkedGroupId,
    memberId: beneficiaryId,
    memberName,
    groupId,
  });
}
