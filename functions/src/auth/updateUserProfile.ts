import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

// Define the request interface for type safety
interface UpdateUserProfileRequest {
  userId: string;
  profileData: {
    displayName?: string;
    photoURL?: string;
    phoneNumber?: string | null;
    dateOfBirth?: Date | null;
  };
}

/**
 * Helper: update a member's fields inside an allMembers/members array doc.
 * Scans the array for a matching userId and patches the changed fields.
 */
async function updateMemberFieldsInArray(
  docRef: FirebaseFirestore.DocumentReference,
  userId: string,
  fieldsToSync: Record<string, any>,
): Promise<boolean> {
  const snap = await docRef.get();
  if (!snap.exists) return false;

  const data = snap.data();
  const members: any[] = data?.members || [];
  let updated = false;

  const updatedMembers = members.map((m: any) => {
    if (m.userId === userId) {
      const patched = { ...m };
      for (const [key, value] of Object.entries(fieldsToSync)) {
        if (value !== undefined) {
          patched[key] = value;
        }
      }
      updated = true;
      return patched;
    }
    return m;
  });

  if (updated) {
    await docRef.update({ members: updatedMembers });
  }
  return updated;
}

/**
 * Sync profile fields (displayName, phoneNumber) to all club, group,
 * and subgroup allMembers arrays where this user appears.
 */
async function syncProfileToMemberArrays(
  userId: string,
  fieldsToSync: Record<string, any>,
): Promise<void> {
  const db = getFirestore();

  // 1. Find all clubs where this user is a member
  const clubsSnap = await db
    .collectionGroup("allMembers")
    .where("__name__", "==", "members")
    .get();

  for (const doc of clubsSnap.docs) {
    const members: any[] = doc.data()?.members || [];
    const isMember = members.some((m: any) => m.userId === userId);
    if (!isMember) continue;

    // Update this document
    await updateMemberFieldsInArray(doc.ref, userId, fieldsToSync);
  }
}

/**
 * Atomic Firebase Function to update user profile document
 *
 * This function ensures:
 * 1. Atomic updates to user documents
 * 2. Version increment for cache invalidation
 * 3. Proper error handling and validation
 * 4. lastModified timestamp updates
 * 5. Syncs displayName/phoneNumber to club/group/subgroup member arrays
 *
 * Usage: Call from frontend services, never directly from UserContext
 * Cache Invalidation: Increments version to trigger UserContext refresh
 */
export const updateUserProfile = onCall(
  {
    region: config.region,
  },
  async (request) => {
    try {
      // Validate authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      // Type-safe request data
      const { userId, profileData } = request.data as UpdateUserProfileRequest;

      // Validate required fields
      if (!userId) {
        throw new HttpsError("invalid-argument", "userId is required");
      }

      if (!profileData || Object.keys(profileData).length === 0) {
        throw new HttpsError(
          "invalid-argument",
          "profileData is required and cannot be empty",
        );
      }

      // Ensure user can only update their own profile
      if (request.auth.uid !== userId) {
        throw new HttpsError(
          "permission-denied",
          "Users can only update their own profile",
        );
      }

      const db = getFirestore();
      const userRef = db.collection("users").doc(userId);

      // Check if user document exists
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        throw new HttpsError(
          "not-found",
          `User document not found for userId: ${userId}`,
        );
      }

      // Prepare update data with version increment and timestamp
      const updateData: any = {
        ...profileData,
        version: FieldValue.increment(1), // Critical for cache invalidation
        lastModified: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      // Perform atomic update on user document
      await userRef.update(updateData);

      // Sync relevant fields to club/group/subgroup member arrays
      const fieldsToSync: Record<string, any> = {};
      if (profileData.displayName !== undefined) {
        fieldsToSync.name = profileData.displayName;
      }
      if (profileData.phoneNumber !== undefined) {
        fieldsToSync.phoneNumber = profileData.phoneNumber;
      }

      if (Object.keys(fieldsToSync).length > 0) {
        try {
          await syncProfileToMemberArrays(userId, fieldsToSync);
          console.log(
            `Synced profile fields to member arrays for userId: ${userId}`,
          );
        } catch (syncError) {
          // Log but don't fail the main update
          console.error("Error syncing profile to member arrays:", syncError);
        }
      }

      // Get updated user data for response
      const updatedDoc = await userRef.get();
      const updatedData = updatedDoc.data();

      console.log(
        `Successfully updated user profile for userId: ${userId}, new version: ${updatedData?.version}`,
      );

      return {
        success: true,
        message: "User profile updated successfully",
        userId: userId,
        version: updatedData?.version,
        updatedFields: Object.keys(profileData),
      };
    } catch (error) {
      console.error("Error in updateUserProfile function:", error);

      // Re-throw HttpsError as-is, wrap other errors
      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Failed to update user profile: ${error}`,
      );
    }
  },
);
