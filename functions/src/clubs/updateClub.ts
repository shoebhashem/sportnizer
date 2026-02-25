import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

export const updateClub = onCall(
  { region: config.region },
  async (request): Promise<{ success: boolean; error?: string }> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      // 2. Extract and validate parameters
      const { clubId, clubData } = request.data;
      validateRequiredFields(request.data, ["clubId", "clubData"]);

      // 3. Perform single atomic operation
      const db = admin.firestore();
      const clubRef = db.collection("clubs").doc(clubId);

      // Verify club exists and user has permission
      const clubDoc = await clubRef.get();
      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      const club = clubDoc.data();
      if (!club?.admins?.includes(request.auth.uid)) {
        throw new HttpsError(
          "permission-denied",
          "Only club admins can update club details",
        );
      }

      // Update only the provided fields
      const updateData: any = {
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1),
      };

      if (clubData.name) updateData.name = clubData.name.trim();
      if (clubData.description !== undefined)
        updateData.description = clubData.description;
      if (clubData.sport) updateData.sport = clubData.sport;
      if (clubData.location !== undefined)
        updateData.location = clubData.location;
      if (clubData.address !== undefined) updateData.address = clubData.address;
      if (clubData.phoneNumber !== undefined)
        updateData.phoneNumber = clubData.phoneNumber;
      if (clubData.logoUrl !== undefined) updateData.logoUrl = clubData.logoUrl;

      await clubRef.update(updateData);

      // 4. Return consistent response
      return {
        success: true,
      };
    } catch (error) {
      console.error("Error in updateClub:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to update club");
    }
  },
);
