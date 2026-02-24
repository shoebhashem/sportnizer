// /services/paymentService.ts - Payment and membership fee orchestration service
// Calls Firebase Functions for Stripe Connect and payment operations

import { getCurrentConfig } from "@/constants/config";
import * as WebBrowser from "expo-web-browser";
import { httpsCallable } from "firebase/functions";
import { Platform } from "react-native";
import { functions } from "./core/firebase";

// Firebase Function references - Stripe Connect
const createStripeConnectedAccountFn = httpsCallable(
  functions,
  "createStripeConnectedAccount",
);
const createStripeOnboardingLinkFn = httpsCallable(
  functions,
  "createStripeOnboardingLink",
);
const checkStripeAccountStatusFn = httpsCallable(
  functions,
  "checkStripeAccountStatus",
);
const resetPaymentSetupFn = httpsCallable(functions, "resetPaymentSetup");

// Firebase Function references - Payments
const createCheckoutSessionFn = httpsCallable(
  functions,
  "createCheckoutSession",
);
const createMembershipFeeFn = httpsCallable(functions, "createMembershipFee");
const getMembershipFeesFn = httpsCallable(functions, "getMembershipFees");
const getUserPendingPaymentsFn = httpsCallable(
  functions,
  "getUserPendingPayments",
);

// Types
export interface PendingPayment {
  feeId: string;
  feeTitle: string;
  beneficiaryId: string;
  beneficiaryName: string;
  clubId: string;
  clubName: string;
  groupId: string;
  groupName: string;
  amount: number;
  currency: string;
  dueDate: Date | null;
  isOverdue: boolean;
  daysRemaining: number | null;
  status?: "pending" | "processing" | "paid"; // Payment status
}

export interface MembershipFee {
  feeId: string;
  title: string;
  groupId: string;
  groupName: string;
  amount: number;
  currency: string;
  dueDate: Date | null;
  status: "active" | "closed";
  totalExpected: number;
  totalPaid: number;
  percentPaid: number;
  createdAt: Date;
}

export interface CreateFeeParams {
  clubId: string;
  groupId: string;
  title: string;
  description?: string;
  amount: number; // In smallest currency unit (öre/cents)
  currency: string;
  dueDate?: Date;
  targetRoles: string[];
}

export interface StripeAccountStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  onboardingComplete: boolean;
  requiresAction: boolean;
  pendingRequirements: string[];
}

// Fee estimate for display to club admin
export interface FeeEstimate {
  memberPays: number;
  stripeFeeEstimate: number;
  platformFee: number;
  clubReceivesEstimate: number;
  currency: string;
}

/**
 * Stripe fee estimates by country
 * These are conservative estimates for European cards
 */
const STRIPE_FEE_ESTIMATES: Record<
  string,
  { percentage: number; fixed: number }
> = {
  SE: { percentage: 1.5, fixed: 180 },
  NO: { percentage: 2.4, fixed: 200 },
  DK: { percentage: 1.5, fixed: 180 },
  FI: { percentage: 1.5, fixed: 25 },
  DE: { percentage: 1.5, fixed: 25 },
  GB: { percentage: 1.5, fixed: 20 },
  US: { percentage: 2.9, fixed: 30 },
};

const PLATFORM_FEE_PERCENT = 2;

export const paymentService = {
  // ---------------------------
  // Stripe Connect (Club Setup)
  // ---------------------------

  /**
   * Create a Stripe connected account for a club
   */
  async createStripeAccount(
    clubId: string,
    country: string = "SE",
  ): Promise<{ success: boolean; accountId?: string; error?: string }> {
    try {
      const result = await createStripeConnectedAccountFn({ clubId, country });
      return result.data as {
        success: boolean;
        accountId?: string;
        error?: string;
      };
    } catch (error: any) {
      console.error("❌ Error creating Stripe account:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get onboarding link and open it in browser
   */
  async startStripeOnboarding(
    clubId: string,
    clubName?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Generate environment-appropriate return URLs
      const config = getCurrentConfig();
      const params = clubName
        ? `?clubId=${clubId}&clubName=${encodeURIComponent(clubName)}`
        : `?clubId=${clubId}`;
      const returnUrl = `${config.webUrl}/stripe-return${params}`;
      const refreshUrl = `${config.webUrl}/stripe-refresh${params}`;

      const result = await createStripeOnboardingLinkFn({
        clubId,
        returnUrl,
        refreshUrl,
      });

      const data = result.data as { success: boolean; onboardingUrl?: string };

      if (!data.success || !data.onboardingUrl) {
        return { success: false, error: "Failed to get onboarding URL" };
      }

      // Open Stripe onboarding in browser
      if (Platform.OS === "web") {
        window.open(data.onboardingUrl, "_blank");
      } else {
        await WebBrowser.openBrowserAsync(data.onboardingUrl);
      }

      return { success: true };
    } catch (error: any) {
      console.error("❌ Error starting Stripe onboarding:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Check if Stripe onboarding is complete
   */
  async checkStripeStatus(clubId: string): Promise<{
    success: boolean;
    status?: StripeAccountStatus;
    error?: string;
  }> {
    try {
      const result = await checkStripeAccountStatusFn({ clubId });
      const data = result.data as any;

      return {
        success: data.success,
        status: {
          chargesEnabled: data.chargesEnabled,
          payoutsEnabled: data.payoutsEnabled,
          onboardingComplete: data.onboardingComplete,
          requiresAction: data.requiresAction,
          pendingRequirements: data.pendingRequirements,
        },
      };
    } catch (error: any) {
      // Don't log error for expected "no account" case
      const isNoAccountError = error.message?.includes(
        "does not have a Stripe account",
      );
      if (!isNoAccountError) {
        console.error("❌ Error checking Stripe status:", error);
      }
      return { success: false, error: error.message };
    }
  },

  /**
   * Reset payment setup for a club (disconnect Stripe account)
   */
  async resetPaymentSetup(clubId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const result = await resetPaymentSetupFn({ clubId });
      const data = result.data as { success: boolean; error?: string };
      return data;
    } catch (error: any) {
      console.error("❌ Error resetting payment setup:", error);
      return { success: false, error: error.message };
    }
  },

  // ---------------------------
  // Membership Fee Management
  // ---------------------------

  /**
   * Create a membership fee for a group
   */
  async createMembershipFee(params: CreateFeeParams): Promise<{
    success: boolean;
    feeId?: string;
    includedMembersCount?: number;
    error?: string;
  }> {
    try {
      const result = await createMembershipFeeFn({
        ...params,
        dueDate: params.dueDate?.toISOString(),
      });
      return result.data as {
        success: boolean;
        feeId?: string;
        includedMembersCount?: number;
        error?: string;
      };
    } catch (error: any) {
      console.error("❌ Error creating membership fee:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get membership fees for a club/group
   */
  async getMembershipFees(
    clubId: string,
    groupId?: string,
    status?: "active" | "closed",
  ): Promise<{ success: boolean; fees?: MembershipFee[]; error?: string }> {
    try {
      const result = await getMembershipFeesFn({ clubId, groupId, status });
      const data = result.data as { success: boolean; fees: any[] };

      // Convert timestamps to dates
      const fees = data.fees?.map((fee) => ({
        ...fee,
        dueDate: fee.dueDate ? new Date(fee.dueDate._seconds * 1000) : null,
        createdAt: fee.createdAt
          ? new Date(fee.createdAt._seconds * 1000)
          : new Date(),
      }));

      return { success: true, fees };
    } catch (error: any) {
      console.error("❌ Error fetching membership fees:", error);
      return { success: false, error: error.message };
    }
  },

  // ---------------------------
  // Member Payments
  // ---------------------------

  /**
   * Get pending payments for the current user (and their children)
   */
  async getPendingPayments(): Promise<{
    success: boolean;
    payments?: PendingPayment[];
    error?: string;
  }> {
    try {
      const result = await getUserPendingPaymentsFn({});
      const data = result.data as { success: boolean; pendingPayments: any[] };

      // Convert timestamps to dates
      const payments = data.pendingPayments?.map((payment) => ({
        ...payment,
        dueDate: payment.dueDate
          ? new Date(payment.dueDate._seconds * 1000)
          : null,
      }));

      return { success: true, payments };
    } catch (error: any) {
      console.error("❌ Error fetching pending payments:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Start payment checkout for a membership fee
   */
  async startPayment(
    feeId: string,
    beneficiaryId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Build return URLs based on environment
      const config = getCurrentConfig();
      const baseUrl = config.appUrl;

      // Use the app URL for redirect pages
      const successUrl = `${baseUrl}/payment-success`;
      const cancelUrl = `${baseUrl}/payment-cancelled`;

      const result = await createCheckoutSessionFn({
        feeId,
        beneficiaryId,
        successUrl,
        cancelUrl,
      });
      const data = result.data as {
        success: boolean;
        checkoutUrl?: string;
        sessionId?: string;
      };

      if (!data.success || !data.checkoutUrl) {
        return { success: false, error: "Failed to create checkout session" };
      }

      // Open Stripe Checkout in browser
      if (Platform.OS === "web") {
        window.location.href = data.checkoutUrl;
      } else {
        await WebBrowser.openBrowserAsync(data.checkoutUrl);
      }

      return { success: true };
    } catch (error: any) {
      console.error("❌ Error starting payment:", error);

      // Handle specific error messages
      if (error.message?.includes("already been paid")) {
        return { success: false, error: "This fee has already been paid." };
      }
      if (error.message?.includes("already in progress")) {
        return {
          success: false,
          error: "A payment is already in progress. Please wait a few minutes.",
        };
      }

      return { success: false, error: error.message };
    }
  },

  // ---------------------------
  // Fee Estimation
  // ---------------------------

  /**
   * Estimate fees for a given amount (for display to club admin)
   * This is calculated client-side for immediate feedback
   */
  estimateFees(amount: number, country: string = "SE"): FeeEstimate {
    const feeStructure =
      STRIPE_FEE_ESTIMATES[country] || STRIPE_FEE_ESTIMATES["SE"];

    // Calculate Stripe fee estimate
    const stripeFeeEstimate = Math.round(
      amount * (feeStructure.percentage / 100) + feeStructure.fixed,
    );

    // Calculate platform fee (3%)
    const platformFee = Math.floor(amount * (PLATFORM_FEE_PERCENT / 100));

    // Calculate club receives
    const clubReceivesEstimate = amount - stripeFeeEstimate - platformFee;

    return {
      memberPays: amount,
      stripeFeeEstimate,
      platformFee,
      clubReceivesEstimate,
      currency: getCurrencyForCountry(country),
    };
  },

  // ---------------------------
  // Utility Functions
  // ---------------------------

  /**
   * Format amount from smallest unit to display string
   */
  formatAmount(amountInSmallestUnit: number, currency: string): string {
    const majorUnits = amountInSmallestUnit / 100;
    const locale = getLocaleForCurrency(currency);

    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(majorUnits);
  },

  /**
   * Parse amount from display string to smallest unit
   */
  parseAmount(displayAmount: string): number {
    const cleaned = displayAmount.replace(/[^\d.,]/g, "").replace(",", ".");
    return Math.round(parseFloat(cleaned) * 100);
  },
};

// Helper functions
function getCurrencyForCountry(country: string): string {
  const currencies: Record<string, string> = {
    SE: "sek",
    NO: "nok",
    DK: "dkk",
    FI: "eur",
    DE: "eur",
    GB: "gbp",
    US: "usd",
  };
  return currencies[country] || "sek";
}

function getLocaleForCurrency(currency: string): string {
  const locales: Record<string, string> = {
    sek: "sv-SE",
    nok: "nb-NO",
    dkk: "da-DK",
    eur: "de-DE",
    gbp: "en-GB",
    usd: "en-US",
  };
  return locales[currency.toLowerCase()] || "en-US";
}

export default paymentService;
