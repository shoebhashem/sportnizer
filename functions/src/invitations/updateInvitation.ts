import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * updateInvitation - Configurable Cloud Function for invitation document operations
 *
 * Actions:
 * - "claim": Atomically reads invitation data + sets status="processing" (prevents double-processing)
 *            Returns the full invitation data to the caller.
 * - "delete": Deletes the invitation document (used after successful processing)
 * - "reject": Sets status to "rejected" and marks as used, then deletes the document
 *
 * This replaces the old markInvitationUsed function and adds the "claim" action
 * that was previously done client-side (blocked by Firestore security rules).
 */

export interface UpdateInvitationRequest {
  invitationToken: string;
  userId: string;
  action: "claim" | "delete" | "reject";
}

export interface UpdateInvitationResponse {
  success: boolean;
  invitationData?: any; // Returned only for "claim" action
  error?: string;
  errorCode?: string; // Machine-readable error code for client-side handling
}

export const updateInvitation = onCall(
  {
    region: config.region,
  },
  async (request): Promise<UpdateInvitationResponse> => {
    try {
      const { invitationToken, userId, action }: UpdateInvitationRequest =
        request.data;

      // Validate required fields
      validateRequiredFields(request.data, [
        "invitationToken",
        "userId",
        "action",
      ]);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      // Validate action
      if (!["claim", "delete", "reject"].includes(action)) {
        throw new HttpsError(
          "invalid-argument",
          'Action must be "claim", "delete", or "reject"',
        );
      }

      const db = admin.firestore();
      const invitationRef = db.collection("invitations").doc(invitationToken);

      // ─── ACTION: CLAIM ───────────────────────────────────────
      if (action === "claim") {
        console.log(
          `📝 Claiming invitation ${invitationToken} for user ${userId}...`,
        );

        // Use Admin SDK transaction for atomic read-then-update
        const transactionResult = await db.runTransaction(
          async (transaction) => {
            const invitationDoc = await transaction.get(invitationRef);

            if (!invitationDoc.exists) {
              throw new HttpsError("not-found", "INVITATION_NOT_FOUND");
            }

            const data = invitationDoc.data()!;

            // Already being processed by another call
            if (data.status === "processing") {
              throw new HttpsError(
                "already-exists",
                "INVITATION_ALREADY_PROCESSING",
              );
            }

            // Verify invitation is in a valid state for claiming
            const isNewUser = data.status === "accepted_pending_signup";
            const isExistingUser = data.status === "pending";

            if (!isNewUser && !isExistingUser) {
              throw new HttpsError(
                "failed-precondition",
                `INVALID_STATUS:${data.status}`,
              );
            }

            // ── Verify the caller is the intended recipient ──
            const callerUid = request.auth!.uid;
            const callerEmail = request.auth!.token.email;

            if (isExistingUser) {
              // For existing users: the invitation's userId must match the caller
              // Exception: youth invitations where guardian claims on behalf of child
              const isYouthInvitation =
                data.role === "player-underage" ||
                data.isYouthInvitation === true;
              if (
                !isYouthInvitation &&
                data.userId &&
                data.userId !== callerUid
              ) {
                console.warn(
                  `⚠️ Claim denied: caller ${callerUid} does not match invitation userId ${data.userId}`,
                );
                throw new HttpsError("permission-denied", "CALLER_MISMATCH");
              }
            } else if (isNewUser) {
              // For new users (accepted_pending_signup): the caller's email must match
              if (callerEmail && data.email && callerEmail !== data.email) {
                console.warn(
                  `⚠️ Claim denied: caller email ${callerEmail} does not match invitation email ${data.email}`,
                );
                throw new HttpsError("permission-denied", "CALLER_MISMATCH");
              }
            }

            // Atomically set status to "processing" so no other call can claim it
            transaction.update(invitationRef, { status: "processing" });

            // Return the original data with the original status preserved
            return { originalStatus: data.status, data: { ...data } };
          },
        );

        // Restore the original status for downstream logic
        const invitationData = {
          ...transactionResult.data,
          status: transactionResult.originalStatus,
        };

        // Convert Firestore Timestamps to ISO strings for serialization
        const serializedData = serializeFirestoreData(invitationData);

        console.log(
          `✅ Invitation claimed. Group: ${serializedData.groupName}, Status: ${serializedData.status}`,
        );

        return {
          success: true,
          invitationData: serializedData,
        };
      }

      // ─── ACTION: DELETE ──────────────────────────────────────
      if (action === "delete") {
        console.log(
          `🗑️ Deleting invitation ${invitationToken} for user ${userId}...`,
        );

        await invitationRef.delete();
        console.log(`✅ Invitation ${invitationToken} deleted successfully`);

        // Delete the associated notification (server-side = no client cache issues)
        await cleanupNotificationForInvitation(db, userId, invitationToken);

        return { success: true };
      }

      // ─── ACTION: REJECT ──────────────────────────────────────
      if (action === "reject") {
        console.log(
          `❌ Rejecting invitation ${invitationToken} for user ${userId}...`,
        );

        await invitationRef.delete();
        console.log(
          `✅ Invitation ${invitationToken} rejected and deleted successfully`,
        );

        // Delete the associated notification (server-side = no client cache issues)
        await cleanupNotificationForInvitation(db, userId, invitationToken);

        return { success: true };
      }

      // Should never reach here due to validation above
      throw new HttpsError("invalid-argument", "Invalid action");
    } catch (error) {
      // Re-throw HttpsErrors (they have structured error codes)
      if (error instanceof HttpsError) {
        // For claim-specific errors, return structured responses instead of throwing
        if (
          error.message === "INVITATION_NOT_FOUND" ||
          error.message === "INVITATION_ALREADY_PROCESSING" ||
          error.message === "CALLER_MISMATCH" ||
          error.message.startsWith("INVALID_STATUS:")
        ) {
          return {
            success: false,
            errorCode: error.message,
            error: error.message,
          };
        }
        throw error;
      }

      console.error("Error in updateInvitation:", error);
      throw new HttpsError("internal", "Failed to update invitation");
    }
  },
);

/**
 * Helper: Delete any notification document linked to the given invitation token.
 * Uses Admin SDK — no client-side cache issues, always reads/writes to server.
 */
async function cleanupNotificationForInvitation(
  db: admin.firestore.Firestore,
  userId: string,
  invitationToken: string,
): Promise<void> {
  try {
    const snapshot = await db
      .collection("users")
      .doc(userId)
      .collection("notifications")
      .where("invitationToken", "==", invitationToken)
      .get();

    if (snapshot.empty) {
      console.log(
        `ℹ️ No notification found for invitation ${invitationToken} (user ${userId})`,
      );
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    console.log(
      `🧹 Deleted ${snapshot.size} notification(s) for invitation ${invitationToken} (user ${userId})`,
    );
  } catch (error: any) {
    // Non-fatal: log but don't fail the main operation
    console.warn(
      `⚠️ Failed to cleanup notification for invitation ${invitationToken}:`,
      error.message,
    );
  }
}

/**
 * Helper: Convert Firestore Timestamps to ISO strings for JSON serialization.
 * Cloud Functions onCall automatically serializes responses, but Firestore
 * Timestamp objects need to be converted to a serializable format.
 */
function serializeFirestoreData(data: any): any {
  if (data === null || data === undefined) return data;

  // Handle Firestore Timestamp
  if (data && typeof data.toDate === "function") {
    return data.toDate().toISOString();
  }

  // Handle Date objects
  if (data instanceof Date) {
    return data.toISOString();
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => serializeFirestoreData(item));
  }

  // Handle objects
  if (typeof data === "object") {
    const serialized: any = {};
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = serializeFirestoreData(value);
    }
    return serialized;
  }

  return data;
}

// ─── BACKWARDS COMPATIBILITY ───────────────────────────────────
// Keep the old markInvitationUsed export so existing deployed clients
// and tests can still call it by name. It delegates to "delete" action.
export const markInvitationUsed = onCall(
  {
    region: config.region,
  },
  async (request) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const {
        invitationToken,
        userId: _userId,
        status: _status,
      } = request.data;

      validateRequiredFields(request.data, [
        "invitationToken",
        "userId",
        "status",
      ]);

      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      console.log(
        `[markInvitationUsed compat] Deleting invitation ${invitationToken}`,
      );

      const db = admin.firestore();
      await db.collection("invitations").doc(invitationToken).delete();

      return { success: true };
    } catch (error) {
      console.error("Error in markInvitationUsed:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to mark invitation as used");
    }
  },
);
