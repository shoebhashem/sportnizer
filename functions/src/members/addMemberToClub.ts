import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { AddMemberToClubRequest, FunctionResponse } from "../types/interfaces";
import { config } from "../utils/config";
import { checkClubMemberLimit, getClubSubscriptionTier } from "../utils/limits";
import { validateRequiredFields } from "../utils/validation";

export const addMemberToClub = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const { clubId, memberData }: AddMemberToClubRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ["clubId", "memberData"]);

      // For youth members, email is optional; for regular members, email is required
      // Check if needsGuardian is explicitly true (not just truthy)
      const requiredMemberFields =
        memberData.needsGuardian === true
          ? ["userId", "roles", "name", "addedBy"] // Youth members don't need email
          : ["userId", "roles", "name", "email", "addedBy"]; // Regular members need email

      validateRequiredFields(memberData, requiredMemberFields);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      console.log(`Adding member ${memberData.userId} to club ${clubId}`);

      // Get club document to check subscription limits
      const clubRef = admin.firestore().collection("clubs").doc(clubId);
      const clubDoc = await clubRef.get();

      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      const clubData = clubDoc.data() || null;
      const currentTotalMembers = clubData?.totalCounts || 0;
      const subscriptionTier = getClubSubscriptionTier(clubData);

      // Check if club can add more members based on subscription tier
      const limitCheck = checkClubMemberLimit(
        currentTotalMembers,
        subscriptionTier,
      );
      if (!limitCheck.allowed) {
        console.log(
          `❌ Club ${clubId} has reached member limit: ${currentTotalMembers}/${limitCheck.maxLimit} (tier: ${subscriptionTier})`,
        );
        throw new HttpsError("resource-exhausted", limitCheck.message);
      }

      // Get current club allMembers document
      const clubMemberRef = admin
        .firestore()
        .collection("clubs")
        .doc(clubId)
        .collection("allMembers")
        .doc("members");

      const clubMembersDoc = await clubMemberRef.get();
      if (!clubMembersDoc.exists) {
        throw new HttpsError("not-found", "Club members document not found");
      }

      const clubMembersData = clubMembersDoc.data();
      const currentMembers = clubMembersData?.members || [];

      // 🆕 REACTIVATION & ROLE ACCUMULATION LOGIC: Check if user already exists (including inactive)
      const existingMemberIndex = currentMembers.findIndex(
        (m: any) => m.userId === memberData.userId,
      );

      if (existingMemberIndex !== -1) {
        const existingMember = currentMembers[existingMemberIndex];

        // Check if member is inactive and reactivate
        if (existingMember.isActive === false) {
          const now = new Date();
          const scheduledDeletion = existingMember.scheduledForDeletion
            ? existingMember.scheduledForDeletion.toDate
              ? existingMember.scheduledForDeletion.toDate()
              : new Date(existingMember.scheduledForDeletion)
            : null;

          if (scheduledDeletion && now < scheduledDeletion) {
            console.log(
              `♻️ Reactivating club member ${memberData.userId} - within grace period`,
            );

            // Merge roles (avoid duplicates within new roles, but allow accumulation)
            const existingRoles = existingMember.roles || [];
            const newRoles = memberData.roles || [];
            const mergedRoles = [...existingRoles, ...newRoles];

            currentMembers[existingMemberIndex] = {
              ...existingMember,
              ...memberData,
              roles: mergedRoles,
              isActive: true,
              inactiveSince: null,
              scheduledForDeletion: null,
              reactivatedAt: now,
              reactivationCount: (existingMember.reactivationCount || 0) + 1,
              lastModifiedAt: now,
            };
          } else {
            console.log(
              `♻️ Reactivating club member ${memberData.userId} - grace period expired`,
            );

            currentMembers[existingMemberIndex] = {
              ...memberData,
              isActive: true,
              inactiveSince: null,
              scheduledForDeletion: null,
              reactivatedAt: now,
              reactivationCount: (existingMember.reactivationCount || 0) + 1,
              lastModifiedAt: now,
            };
          }

          // Update with modified array
          await clubMemberRef.update({
            members: currentMembers,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            memberCount: admin.firestore.FieldValue.increment(1),
            version: admin.firestore.FieldValue.increment(1),
            lastModified: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(
            `✅ Club member reactivated with roles: [${currentMembers[existingMemberIndex].roles.join(", ")}]`,
          );
        } else {
          // Member is already active - add roles (role accumulation)
          console.log(
            `📊 Member ${memberData.userId} already active - adding roles`,
          );

          const existingRoles = existingMember.roles || [];
          const newRoles = memberData.roles || [];
          const accumulatedRoles = [...existingRoles, ...newRoles];

          currentMembers[existingMemberIndex].roles = accumulatedRoles;
          currentMembers[existingMemberIndex].lastModifiedAt = new Date();

          // Update with modified array
          await clubMemberRef.update({
            members: currentMembers,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            version: admin.firestore.FieldValue.increment(1),
            lastModified: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(
            `✅ Roles added to existing member: [${accumulatedRoles.join(", ")}]`,
          );
        }
      } else {
        // New member - add to club
        await clubMemberRef.update({
          members: admin.firestore.FieldValue.arrayUnion({
            ...memberData,
            isActive: true,
            lastModifiedAt: new Date(),
          }),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          memberCount: admin.firestore.FieldValue.increment(1),
          version: admin.firestore.FieldValue.increment(1),
          lastModified: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(
          `✅ New member added to club with roles: [${memberData.roles.join(", ")}]`,
        );
      }

      // Update club total count
      await admin
        .firestore()
        .collection("clubs")
        .doc(clubId)
        .update({
          totalCounts: admin.firestore.FieldValue.increment(1),
          version: admin.firestore.FieldValue.increment(1), // Increment version
          lastModified: admin.firestore.FieldValue.serverTimestamp(),
        });

      console.log(
        `Successfully added member ${memberData.userId} to club ${clubId}`,
      );

      return {
        success: true,
        message: `Member added to club successfully`,
      };
    } catch (error) {
      console.error("Error in addMemberToClub:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to add member to club");
    }
  },
);
