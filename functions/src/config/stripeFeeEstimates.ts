/**
 * Stripe Fee Estimates by Country
 *
 * Used to show clubs an estimate when creating membership fees.
 * These estimates help clubs understand how much they'll receive after fees.
 *
 * NOTE: These are estimates based on Stripe's published pricing.
 * Actual fees may vary based on card type, international cards, etc.
 *
 * Stripe pricing sources:
 * - https://stripe.com/se/pricing (Sweden)
 * - https://stripe.com/pricing (other countries)
 *
 * Last updated: February 2025
 */

import { STRIPE_CONFIG } from "./stripe";

/**
 * Fee structure for a country
 */
export interface StripeFeeStructure {
  /** Percentage fee (e.g., 1.5 for 1.5%) */
  percentageFee: number;
  /** Fixed fee in smallest currency unit (e.g., 180 öre = 1.80 SEK) */
  fixedFee: number;
  /** Currency code */
  currency: string;
  /** Human-readable description */
  description: string;
}

/**
 * Estimated Stripe fees by country code (ISO 3166-1 alpha-2)
 *
 * Most European cards: ~1.5% + fixed fee
 * International cards may be higher: up to 2.9% + fixed fee
 *
 * We use conservative estimates that assume European cards.
 */
export const STRIPE_FEE_ESTIMATES: Record<string, StripeFeeStructure> = {
  // Nordic countries
  SE: {
    percentageFee: 1.5,
    fixedFee: 180,
    currency: "sek",
    description: "1.5% + 1.80 kr",
  },
  NO: {
    percentageFee: 2.4,
    fixedFee: 200,
    currency: "nok",
    description: "2.4% + 2.00 kr",
  },
  DK: {
    percentageFee: 1.5,
    fixedFee: 180,
    currency: "dkk",
    description: "1.5% + 1.80 kr",
  },
  FI: {
    percentageFee: 1.5,
    fixedFee: 25,
    currency: "eur",
    description: "1.5% + €0.25",
  },

  // Western Europe
  DE: {
    percentageFee: 1.5,
    fixedFee: 25,
    currency: "eur",
    description: "1.5% + €0.25",
  },
  NL: {
    percentageFee: 1.5,
    fixedFee: 25,
    currency: "eur",
    description: "1.5% + €0.25",
  },
  BE: {
    percentageFee: 1.5,
    fixedFee: 25,
    currency: "eur",
    description: "1.5% + €0.25",
  },
  FR: {
    percentageFee: 1.5,
    fixedFee: 25,
    currency: "eur",
    description: "1.5% + €0.25",
  },
  AT: {
    percentageFee: 1.5,
    fixedFee: 25,
    currency: "eur",
    description: "1.5% + €0.25",
  },
  CH: {
    percentageFee: 2.9,
    fixedFee: 30,
    currency: "chf",
    description: "2.9% + 0.30 CHF",
  },

  // UK & Ireland
  GB: {
    percentageFee: 1.5,
    fixedFee: 20,
    currency: "gbp",
    description: "1.5% + £0.20",
  },
  IE: {
    percentageFee: 1.5,
    fixedFee: 25,
    currency: "eur",
    description: "1.5% + €0.25",
  },

  // Southern Europe
  ES: {
    percentageFee: 1.5,
    fixedFee: 25,
    currency: "eur",
    description: "1.5% + €0.25",
  },
  PT: {
    percentageFee: 1.5,
    fixedFee: 25,
    currency: "eur",
    description: "1.5% + €0.25",
  },
  IT: {
    percentageFee: 1.5,
    fixedFee: 25,
    currency: "eur",
    description: "1.5% + €0.25",
  },

  // Eastern Europe
  PL: {
    percentageFee: 1.5,
    fixedFee: 100,
    currency: "pln",
    description: "1.5% + 1.00 PLN",
  },
  CZ: {
    percentageFee: 1.5,
    fixedFee: 25,
    currency: "eur",
    description: "1.5% + €0.25",
  },

  // Americas (higher fees)
  US: {
    percentageFee: 2.9,
    fixedFee: 30,
    currency: "usd",
    description: "2.9% + $0.30",
  },
  CA: {
    percentageFee: 2.9,
    fixedFee: 30,
    currency: "cad",
    description: "2.9% + $0.30 CAD",
  },

  // Australia & New Zealand
  AU: {
    percentageFee: 1.7,
    fixedFee: 30,
    currency: "aud",
    description: "1.7% + $0.30 AUD",
  },
  NZ: {
    percentageFee: 2.7,
    fixedFee: 30,
    currency: "nzd",
    description: "2.7% + $0.30 NZD",
  },
};

/**
 * Fee estimate result
 */
export interface FeeEstimate {
  /** Amount the member pays (input) */
  memberPays: number;
  /** Estimated Stripe fee (charged to club) */
  stripeFeeEstimate: number;
  /** Platform fee (3% to Sportnizer) */
  platformFee: number;
  /** Estimated amount club receives after all fees */
  clubReceivesEstimate: number;
  /** Currency code */
  currency: string;
  /** Human-readable fee description */
  feeDescription: string;
}

/**
 * Calculate estimated fees for a payment
 *
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., 'SE', 'NO')
 * @param amount - Amount in smallest currency unit (öre/cents)
 * @returns Fee breakdown estimate
 *
 * @example
 * // Member pays 1500 SEK (150000 öre)
 * const estimate = estimateStripeFee('SE', 150000);
 * // Returns:
 * // {
 * //   memberPays: 150000,
 * //   stripeFeeEstimate: 2430,    // ~24.30 SEK (1.5% + 1.80)
 * //   platformFee: 4500,          // 45.00 SEK (3%)
 * //   clubReceivesEstimate: 143070, // ~1430.70 SEK
 * //   currency: 'sek',
 * //   feeDescription: '1.5% + 1.80 kr'
 * // }
 */
export function estimateStripeFee(
  countryCode: string,
  amount: number,
): FeeEstimate {
  // Default to Sweden if country not found
  const feeStructure =
    STRIPE_FEE_ESTIMATES[countryCode.toUpperCase()] ||
    STRIPE_FEE_ESTIMATES["SE"];

  // Calculate Stripe's estimated fee: percentage + fixed
  const stripeFeeEstimate = Math.round(
    amount * (feeStructure.percentageFee / 100) + feeStructure.fixedFee,
  );

  // Calculate platform fee (3%)
  const platformFee = Math.floor(
    amount * (STRIPE_CONFIG.platformFeePercent / 100),
  );

  // Calculate what club receives
  const clubReceivesEstimate = amount - stripeFeeEstimate - platformFee;

  return {
    memberPays: amount,
    stripeFeeEstimate,
    platformFee,
    clubReceivesEstimate,
    currency: feeStructure.currency,
    feeDescription: feeStructure.description,
  };
}

/**
 * Get fee structure for a country
 *
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns Fee structure or default (Sweden)
 */
export function getFeeStructure(countryCode: string): StripeFeeStructure {
  return (
    STRIPE_FEE_ESTIMATES[countryCode.toUpperCase()] ||
    STRIPE_FEE_ESTIMATES["SE"]
  );
}

/**
 * Format amount with currency
 *
 * @param amount - Amount in smallest unit
 * @param currency - Currency code
 * @returns Formatted string (e.g., "1 500.00 kr")
 */
export function formatAmount(amount: number, currency: string): string {
  const majorUnits = amount / 100;
  const locale = getCurrencyLocale(currency);

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(majorUnits);
}

/**
 * Get locale for currency formatting
 */
function getCurrencyLocale(currency: string): string {
  const localeMap: Record<string, string> = {
    sek: "sv-SE",
    nok: "nb-NO",
    dkk: "da-DK",
    eur: "de-DE",
    gbp: "en-GB",
    usd: "en-US",
    chf: "de-CH",
    pln: "pl-PL",
    cad: "en-CA",
    aud: "en-AU",
    nzd: "en-NZ",
  };

  return localeMap[currency.toLowerCase()] || "en-US";
}
