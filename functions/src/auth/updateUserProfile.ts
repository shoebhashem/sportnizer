import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

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
 * Atomic Firebase Function to update user profile document
 * 
 * This function ensures:
 * 1. Atomic updates to user documents
 * 2. Version increment for cache invalidation
 * 3. Proper error handling and validation
 * 4. lastModified timestamp updates
 * 
 * Usage: Call from frontend services, never directly from UserContext
 * Cache Invalidation: Increments version to trigger UserContext refresh
 */
export const updateUserProfile = onCall(
  { 
    region: 'us-central1',
    enforceAppCheck: true, // Enable App Check for security
  },
  async (request) => {
    try {
      // Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Type-safe request data
      const { userId, profileData } = request.data as UpdateUserProfileRequest;

      // Validate required fields
      if (!userId) {
        throw new HttpsError('invalid-argument', 'userId is required');
      }

      if (!profileData || Object.keys(profileData).length === 0) {
        throw new HttpsError('invalid-argument', 'profileData is required and cannot be empty');
      }

      // Ensure user can only update their own profile
      if (request.auth.uid !== userId) {
        throw new HttpsError('permission-denied', 'Users can only update their own profile');
      }

      const db = getFirestore();
      const userRef = db.collection('users').doc(userId);

      // Check if user document exists
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', `User document not found for userId: ${userId}`);
      }

      // Prepare update data with version increment and timestamp
      const updateData: any = {
        ...profileData,
        version: FieldValue.increment(1), // Critical for cache invalidation
        lastModified: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      // Perform atomic update
      await userRef.update(updateData);

      // Get updated user data for response
      const updatedDoc = await userRef.get();
      const updatedData = updatedDoc.data();

      console.log(`Successfully updated user profile for userId: ${userId}, new version: ${updatedData?.version}`);

      return {
        success: true,
        message: 'User profile updated successfully',
        userId: userId,
        version: updatedData?.version,
        updatedFields: Object.keys(profileData),
      };

    } catch (error) {
      console.error('Error in updateUserProfile function:', error);
      
      // Re-throw HttpsError as-is, wrap other errors
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to update user profile: ${error}`);
    }
  }
);
