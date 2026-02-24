import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

export interface GetMemberContactDetailsRequest {
  userId: string; // The member whose details we want
  clubId: string;
  groupId?: string; // Optional - if not provided, only club-admin can access
}

export interface GuardianContactDetails {
  guardianUid: string;
  displayName: string;
  email: string;
  phoneNumber: string | null;
  relationship: string;
}

export interface MemberContactDetails {
  displayName: string;
  email: string;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  photoURL: string | null;
  isYouth: boolean;
}

export interface GetMemberContactDetailsResponse {
  success: boolean;
  member: MemberContactDetails;
  guardians?: GuardianContactDetails[];
  error?: string;
}

/**
 * Get contact details for a group member
 * Permission:
 * - If groupId provided: Caller must be club-admin, admin, or coach in the group
 * - If groupId NOT provided: Caller must be club-admin (club-level access only)
 * For youth members, also fetches guardian contact details from their user documents
 */
export const getMemberContactDetails = onCall(
  {
    region: config.region,
  },
  async (request): Promise<GetMemberContactDetailsResponse> => {
    try {
      const { userId, clubId, groupId }: GetMemberContactDetailsRequest =
        request.data;

      // Validate required fields (groupId is optional)
      validateRequiredFields(request.data, ["userId", "clubId"]);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const callerUid = request.auth.uid;
      const db = admin.firestore();

      console.log(
        `[getMemberContactDetails] Caller ${callerUid} requesting details for ${userId} in club ${clubId}${groupId ? `, group ${groupId}` : " (club-level)"}`,
      );

      // ---- Permission Check ----
      // Check if caller is club-admin
      const callerDoc = await db.collection("users").doc(callerUid).get();
      if (!callerDoc.exists) {
        throw new HttpsError("permission-denied", "Caller user not found");
      }

      const callerData = callerDoc.data();
      const callerClubAccess = callerData?.clubAccess?.find(
        (ca: any) => ca.clubId === clubId,
      );

      let hasPermission = false;

      // Check club-admin role (always valid)
      if (callerClubAccess?.role === "club-admin") {
        hasPermission = true;
        console.log(`[getMemberContactDetails] Caller is club-admin`);
      }

      // Check group-level roles (admin or coach) - only if groupId is provided
      if (!hasPermission && groupId && callerClubAccess?.groupAccess) {
        const groupAccess = callerClubAccess.groupAccess.find(
          (ga: any) => ga.groupId === groupId,
        );
        if (groupAccess?.roles) {
          const roles = groupAccess.roles as string[];
          if (roles.includes("admin") || roles.includes("coach")) {
            hasPermission = true;
            console.log(
              `[getMemberContactDetails] Caller has group role: ${roles.join(", ")}`,
            );
          }
        }
      }

      // If no groupId provided, only club-admin can access
      if (!groupId && !hasPermission) {
        throw new HttpsError(
          "permission-denied",
          "Only club administrators can view member contact details at club level",
        );
      }

      if (!hasPermission) {
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to view member contact details",
        );
      }

      // ---- Fetch Member Data ----
      const memberDoc = await db.collection("users").doc(userId).get();
      if (!memberDoc.exists) {
        throw new HttpsError("not-found", "Member not found");
      }

      const memberData = memberDoc.data()!;
      const isYouth = memberData.isYouth === true;

      const member: MemberContactDetails = {
        displayName: memberData.displayName || "Unknown",
        email: memberData.email || "",
        phoneNumber: memberData.phoneNumber || null,
        dateOfBirth: memberData.dateOfBirth || null,
        photoURL: memberData.photoURL || null,
        isYouth,
      };

      console.log(
        `[getMemberContactDetails] Found member: ${member.displayName}, isYouth: ${isYouth}`,
      );

      // ---- For Youth: Fetch Guardian Details ----
      let guardians: GuardianContactDetails[] | undefined;

      if (isYouth && memberData.guardians && memberData.guardians.length > 0) {
        console.log(
          `[getMemberContactDetails] Fetching ${memberData.guardians.length} guardian(s)`,
        );

        guardians = [];

        for (const guardian of memberData.guardians) {
          const guardianUid = guardian.guardianUid;
          if (!guardianUid) continue;

          try {
            const guardianDoc = await db
              .collection("users")
              .doc(guardianUid)
              .get();

            if (guardianDoc.exists) {
              const guardianData = guardianDoc.data()!;
              guardians.push({
                guardianUid,
                displayName:
                  guardianData.displayName ||
                  guardian.guardianName ||
                  "Unknown",
                email: guardianData.email || guardian.guardianEmail || "",
                phoneNumber: guardianData.phoneNumber || null,
                relationship: guardian.relationship || "Guardian",
              });
              console.log(
                `[getMemberContactDetails] Fetched guardian: ${guardianData.displayName}`,
              );
            } else {
              // Fallback to denormalized data if guardian doc doesn't exist
              guardians.push({
                guardianUid,
                displayName: guardian.guardianName || "Unknown",
                email: guardian.guardianEmail || "",
                phoneNumber: null,
                relationship: guardian.relationship || "Guardian",
              });
            }
          } catch (err) {
            console.error(
              `[getMemberContactDetails] Error fetching guardian ${guardianUid}:`,
              err,
            );
            // Fallback to denormalized data
            guardians.push({
              guardianUid,
              displayName: guardian.guardianName || "Unknown",
              email: guardian.guardianEmail || "",
              phoneNumber: null,
              relationship: guardian.relationship || "Guardian",
            });
          }
        }
      }

      return {
        success: true,
        member,
        guardians,
      };
    } catch (error) {
      console.error("[getMemberContactDetails] Error:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError("internal", "Failed to get member contact details");
    }
  },
);
