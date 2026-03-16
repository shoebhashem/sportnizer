import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

/**
 * Revoke all refresh tokens for the authenticated user.
 *
 * This forces every session (on any device) to re-authenticate.
 * Called after password change to ensure the old credentials can no
 * longer keep a session alive.
 *
 * - Requires authentication.
 * - Uses Admin SDK `revokeRefreshTokens` (not available client-side).
 */
export const revokeUserTokens = onCall(
  {
    region: config.region,
  },
  async (request) => {
    // ── Auth guard ──────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const uid = request.auth.uid;

    try {
      await admin.auth().revokeRefreshTokens(uid);

      console.log(`Successfully revoked refresh tokens for user: ${uid}`);

      return { success: true };
    } catch (error: any) {
      console.error(`Error revoking tokens for user ${uid}:`, error);
      throw new HttpsError(
        "internal",
        `Failed to revoke tokens: ${error.message}`,
      );
    }
  },
);
