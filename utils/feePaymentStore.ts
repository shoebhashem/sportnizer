/**
 * Module-level store for passing fee payment status data to the
 * select-event-members screen when it is opened in "fee mode".
 *
 * Usage:
 *   Caller (track-payments): call setFeePaymentStatuses() before router.push()
 *   Recipient (select-event-members): call consumeFeePaymentStatuses() on mount
 *
 * When the store is null, select-event-members behaves exactly as before
 * (no payment badges, no paid-member block). This keeps the generic screen
 * unaffected when it is opened from event-details or create-event.
 */

export type FeePaymentStatus = "paid" | "pending" | "overdue" | "no_fee" | "cancelled";

export interface FeePaymentEntry {
  userId: string;
  status: FeePaymentStatus;
}

let _feePaymentStatuses: FeePaymentEntry[] | null = null;

/** Set payment status data before navigating to select-event-members. */
export function setFeePaymentStatuses(entries: FeePaymentEntry[]): void {
  _feePaymentStatuses = entries;
}

/**
 * Read and clear the stored payment status entries in one call.
 * Returns null if nothing was stored (non-fee mode).
 */
export function consumeFeePaymentStatuses(): FeePaymentEntry[] | null {
  const entries = _feePaymentStatuses;
  _feePaymentStatuses = null;
  return entries;
}
