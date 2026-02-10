import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

export interface GetUserByEmailRequest {
  email: string;
}

export interface GetUserByEmailResponse {
  success: boolean;
  userExists: boolean;
  userId?: string;
  userProfile?: any;
  error?: string;
}

export const getUserByEmail = onCall(
  {
    region: config.region,
  },
  async (request): Promise<GetUserByEmailResponse> => {
    try {
      const { email }: GetUserByEmailRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ["email"]);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      console.log(`Looking up user by email: ${email}`);

      const db = admin.firestore();

      // Query users collection by email
      const usersQuery = await db
        .collection("users")
        .where("email", "==", email.toLowerCase().trim())
        .limit(1)
        .get();

      if (usersQuery.empty) {
        console.log(`No user found with email: ${email}`);
        return {
          success: true,
          userExists: false,
        };
      }

      const userDoc = usersQuery.docs[0];
      const userProfile = userDoc.data();

      console.log(`User found: ${userDoc.id} for email: ${email}`);

      return {
        success: true,
        userExists: true,
        userId: userDoc.id,
        userProfile,
      };
    } catch (error) {
      console.error("Error in getUserByEmail:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError("internal", "Failed to lookup user by email");
    }
  },
);
