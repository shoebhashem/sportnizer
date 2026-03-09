import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Check for existing youth member by name and date of birth
 *
 * This Cloud Function performs a global lookup across all youth user documents
 * to detect potential duplicates when a club admin is adding a youth player
 * whose guardian is a different person (not already linked to the youth).
 *
 * Used in the "add child member" screen after the admin enters the child's
 * name and date of birth, to prevent creating duplicate youth accounts.
 *
 * @param childName - Youth member's full name (case-insensitive match)
 * @param dateOfBirth - ISO format date string (e.g., "2015-06-15")
 * @param clubId - Club where the youth is being added (for context in response)
 *
 * @returns Object with match status, youth details, guardian names, and group info
 *
 * @throws HttpsError('unauthenticated') - Caller not authenticated
 * @throws HttpsError('invalid-argument') - Missing required fields
 */

export interface CheckExistingYouthRequest {
  childName: string;
  dateOfBirth: string;
  clubId: string;
}

export interface CheckExistingYouthResponse {
  success: boolean;
  found: boolean;
  youthUid?: string;
  youthName?: string;
  guardians?: {
    guardianName: string;
    guardianEmail: string;
    relationship: string;
  }[];
  currentGroups?: {
    groupId: string;
    groupName: string;
  }[];
  message?: string;
  error?: string;
}

export const checkExistingYouthByNameAndDob = onCall(
  {
    region: config.region,
  },
  async (request): Promise<CheckExistingYouthResponse> => {
    try {
      // 1. Verify caller is authenticated
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Must be authenticated to check for existing youth",
        );
      }

      const { childName, dateOfBirth, clubId }: CheckExistingYouthRequest =
        request.data;

      // 2. Validate required fields
      validateRequiredFields(request.data, [
        "childName",
        "dateOfBirth",
        "clubId",
      ]);

      const normalizedName = childName.trim().toLowerCase();

      console.log(
        `🔍 Checking for existing youth: "${childName}" (${dateOfBirth}) in club ${clubId}`,
      );

      const db = admin.firestore();

      // 3. Query users collection for matching youth
      // Uses composite index: (isYouth, dateOfBirth)
      // Then filters by displayName in code (Firestore doesn't support case-insensitive queries)
      const youthQuery = await db
        .collection("users")
        .where("isYouth", "==", true)
        .where("dateOfBirth", "==", dateOfBirth)
        .get();

      if (youthQuery.empty) {
        console.log("ℹ️ No youth members found with this date of birth");
        return {
          success: true,
          found: false,
          message: "No existing youth member found",
        };
      }

      // 4. Filter by name (case-insensitive)
      const matchingYouth = youthQuery.docs.find((doc) => {
        const data = doc.data();
        const docName = (data.displayName || "").trim().toLowerCase();
        return docName === normalizedName;
      });

      if (!matchingYouth) {
        console.log(
          `ℹ️ Found ${youthQuery.size} youth with DOB ${dateOfBirth} but none matching name "${childName}"`,
        );
        return {
          success: true,
          found: false,
          message: "No existing youth member found with this name and DOB",
        };
      }

      // 5. Match found — extract details
      const youthData = matchingYouth.data();
      const youthUid = matchingYouth.id;

      console.log(
        `✅ Found matching youth: ${youthUid} (${youthData.displayName})`,
      );

      // Extract guardian information
      const guardians = (youthData.guardians || []).map((g: any) => ({
        guardianName: g.guardianName || "Unknown",
        guardianEmail: g.guardianEmail || "",
        relationship: g.relationship || "guardian",
      }));
      [];
      // Extract current group information from clubAccess
      const currentGroups: { groupId: string; groupName: string }[] = [];
      const clubAccess = youthData.clubAccess || [];

      for (const club of clubAccess) {
        const groupAccess = club.groupAccess || [];
        for (const group of groupAccess) {
          if (group.isActive !== false) {
            currentGroups.push({
              groupId: group.groupId,
              groupName: group.groupName || "Unknown Group",
            });
          }
        }
      }

      console.log(
        `📋 Youth has ${guardians.length} guardian(s) and is in ${currentGroups.length} group(s)`,
      );

      return {
        success: true,
        found: true,
        youthUid,
        youthName: youthData.displayName,
        guardians,
        currentGroups,
        message: `Found existing youth member: ${youthData.displayName}`,
      };
    } catch (error) {
      console.error("Error in checkExistingYouthByNameAndDob:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Failed to check for existing youth member",
      );
    }
  },
);
