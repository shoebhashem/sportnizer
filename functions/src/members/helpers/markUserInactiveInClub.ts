import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { flatArrayFieldsFromClubAccess } from "../../utils/flatArrayHelpers";

/**
 * Marks a user as inactive in a specific club
 * Updates the user's clubAccess array to set isActive=false for the specified club
 *
 * @param userId - The user ID
 * @param clubId - The club ID where user should be marked inactive
 * @returns Result with success status
 */
export async function markUserInactiveInClub(params: {
  userId: string;
  clubId: string;
}): Promise<{
  success: boolean;
  wasAlreadyInactive: boolean;
  error?: string;
}> {
  const { userId, clubId } = params;

  try {
    console.log(`🔒 Marking user ${userId} as inactive in club ${clubId}`);

    const db = admin.firestore();
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(`⚠️ User document not found: ${userId}`);
      return {
        success: false,
        wasAlreadyInactive: false,
        error: "User document not found",
      };
    }

    const userData = userDoc.data();
    const clubAccess = userData?.clubAccess || [];
    const clubIndex = clubAccess.findIndex((c: any) => c.clubId === clubId);

    if (clubIndex === -1) {
      console.warn(`⚠️ Club ${clubId} not found in user's clubAccess`);
      return {
        success: false,
        wasAlreadyInactive: false,
        error: "Club not found in user clubAccess",
      };
    }

    // Check if already inactive
    const wasAlreadyInactive = clubAccess[clubIndex].isActive === false;

    if (wasAlreadyInactive) {
      console.log(
        `ℹ️ User ${userId} already marked inactive in club ${clubId}`,
      );
      return {
        success: true,
        wasAlreadyInactive: true,
      };
    }

    // Mark as inactive
    clubAccess[clubIndex].isActive = false;
    clubAccess[clubIndex].inactiveSince = new Date();

    // Update user document
    await userRef.update({
      clubAccess,
      ...flatArrayFieldsFromClubAccess(clubAccess),
      lastModifiedAt: FieldValue.serverTimestamp(),
    });

    console.log(
      `✅ Successfully marked user ${userId} as inactive in club ${clubId}`,
    );

    return {
      success: true,
      wasAlreadyInactive: false,
    };
  } catch (error) {
    console.error(`❌ Error marking user inactive in club:`, error);
    return {
      success: false,
      wasAlreadyInactive: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
