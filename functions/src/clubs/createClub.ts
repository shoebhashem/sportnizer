import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { seedClubAccountingConfig } from "../accounting/chartOfAccounts";
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

      // Validate country (optional at creation — defaults to SE)
      const country = (clubData.country || "SE").toUpperCase();
      // Derive default currency from country using a simple static map
      const COUNTRY_CURRENCY: Record<string, string> = {
        SE: "sek",
        NO: "nok",
        DK: "dkk",
        FI: "eur",
        US: "usd",
        GB: "gbp",
        AU: "aud",
        CA: "cad",
        CH: "chf",
        HU: "huf",
        PL: "pln",
        CZ: "czk",
        RO: "ron",
        BG: "bgn",
        HK: "hkd",
        IN: "inr",
        JP: "jpy",
        MY: "myr",
        NZ: "nzd",
        SG: "sgd",
        TH: "thb",
        AE: "aed",
        ZA: "zar",
        BR: "brl",
        MX: "mxn",
      };
      const defaultCurrency = COUNTRY_CURRENCY[country] ?? "eur";

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
        country,
        currency: defaultCurrency,
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

      // Seed the chart of accounts and accounting config for this club
      try {
        await seedClubAccountingConfig(db, clubRef.id, country);
      } catch (accountingErr) {
        // Non-critical: log but don't fail club creation
        console.error("Failed to seed accounting config:", accountingErr);
      }

      // Initialize default role-visibility permissions for the new club.
      // All event/news domains default to: club-admins=true, group-admins=true, coaches=false.
      try {
        await clubRef
          .collection("settings")
          .doc("permissions")
          .set({
            events: {
              visibility: { clubAdmin: true, groupAdmin: true, coach: false },
            },
            news: {
              visibility: { clubAdmin: true, groupAdmin: true, coach: false },
            },
            members: {},
            fees: {},
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: request.auth.uid,
          });
      } catch (permErr) {
        // Non-critical: existing clubs without this doc fall back to DEFAULT_PERMISSIONS
        console.error("Failed to init permissions settings:", permErr);
      }

      // Auto-enable RF/LOK integration for Swedish clubs
      if (country === "SE") {
        try {
          await clubRef.update({
            rf: {
              integrationEnabled: true,
              integrationStatus: "pending",
              organizationNumber: "",
              rfOrganizationId: "",
              districtId: "",
              kommunKod: "",
              defaultSport: "",
            },
          });
        } catch (rfErr) {
          // Non-critical: log but don't fail club creation
          console.error("Failed to initialize RF settings:", rfErr);
        }
      }

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
