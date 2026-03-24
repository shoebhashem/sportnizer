import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { STRIPE_CONFIG } from "../config/stripe";
import { config } from "../utils/config";
import { checkClubLimit, DEFAULT_LIMITS } from "../utils/limits";
import { validateRequiredFields } from "../utils/validation";

export const createClub = onCall(
  { region: config.region },
  async (
    request,
  ): Promise<{ success: boolean; clubId?: string; error?: string }> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      // 2. Extract and validate parameters
      const { clubData } = request.data;
      validateRequiredFields(request.data, ["clubData"]);
      validateRequiredFields(clubData, ["name"]);

      const trimmedName = clubData.name.trim();
      if (!trimmedName) {
        throw new HttpsError("invalid-argument", "Club name cannot be empty");
      }

      // 3. Check user's club creation limit
      const db = admin.firestore();
      const userRef = db.collection("users").doc(request.auth.uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User profile not found");
      }

      const userData = userDoc.data();
      const activeClubsAsAdmin = userData?.activeClubsAsAdmin || 0;
      const maxClubsAsAdmin =
        userData?.maxClubsAsAdmin || DEFAULT_LIMITS.maxClubsAsAdmin;

      // Validate club creation limit
      const limitCheck = checkClubLimit(
        activeClubsAsAdmin,
        maxClubsAsAdmin,
        "create",
      );
      if (!limitCheck.allowed) {
        throw new HttpsError("resource-exhausted", limitCheck.message);
      }

      // 4. Perform single atomic operation
      // Check if club with this name already exists (case-insensitive)
      const clubsRef = db.collection("clubs");
      const existingClubQuery = await clubsRef
        .where("name", "==", trimmedName)
        .get();

      if (!existingClubQuery.empty) {
        throw new HttpsError(
          "already-exists",
          `A club with the name "${trimmedName}" already exists.`,
        );
      }

      // Generate new club document
      const clubRef = clubsRef.doc();

      // Create club document with subscription limits
      await clubRef.set({
        id: clubRef.id,
        name: trimmedName,
        description: clubData.description || "",
        location: clubData.location || "",
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
        lastModifiedAt: FieldValue.serverTimestamp(),
        version: 1,
        // Subscription limits (usage tracking)
        activeGroupCount: 0, // No groups yet
        maxGroups: DEFAULT_LIMITS.maxGroups, // Free tier default: 10
        // Platform fee — defaults to global value; can be overridden per-club by Clubnizer support
        platformFeePercent: STRIPE_CONFIG.platformFeePercent,
      });

      // Initialize the allMembers document to ensure it exists for future operations
      const clubMemberRef = clubRef.collection("allMembers").doc("members");
      await clubMemberRef.set({
        members: [], // Empty array, will be populated when members are added
        memberCount: 0,
        lastUpdated: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        version: 1,
      });

      // Increment user's active clubs counter
      await userRef.update({
        activeClubsAsAdmin: FieldValue.increment(1),
      });

      console.log(
        `Created club ${clubRef.id} with initialized members document. User now has ${activeClubsAsAdmin + 1} active clubs.`,
      );

      // 5. Return consistent response
      return {
        success: true,
        clubId: clubRef.id,
      };
    } catch (error) {
      console.error("Error in createClub:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to create club");
    }
  },
);
