import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
    CreateSubGroupRequest,
    CreateSubGroupResponse,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Create a new subgroup within a group
 * Creates subgroup document with unique ID and initializes empty allMembers collection
 *
 * Architecture: /clubs/{clubId}/groups/{groupId}/subgroups/{subgroupId}
 * Permissions: admin, coach, group creator, or club admin
 */
export const createSubGroup = onCall(
  {
    region: config.region,
  },
  async (request): Promise<CreateSubGroupResponse> => {
    try {
      const { uid, clubId, groupId, subGroupName, description, color } =
        request.data as CreateSubGroupRequest;

      // Validate required fields
      validateRequiredFields(request.data, [
        "uid",
        "clubId",
        "groupId",
        "subGroupName",
      ]);

      // Verify user is authenticated
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      // Validate subgroup name
      const trimmedSubGroupName = subGroupName.trim();

      if (trimmedSubGroupName.length < 2) {
        return {
          success: false,
          error: "Subgroup name must be at least 2 characters long",
        };
      }

      if (trimmedSubGroupName.length > 50) {
        return {
          success: false,
          error: "Subgroup name cannot exceed 50 characters",
        };
      }

      const db = admin.firestore();

      // Verify group exists
      const groupRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        throw new HttpsError("not-found", "Group not found");
      }

      const groupData = groupDoc.data();
      if (!groupData) {
        throw new HttpsError("not-found", "Group data not found");
      }

      // Verify club exists
      const clubDoc = await db.collection("clubs").doc(clubId).get();
      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      // Check user permissions
      const groupMembersDoc = await db
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId)
        .collection("allMembers")
        .doc("members")
        .get();

      const clubMembersDoc = await db
        .collection("clubs")
        .doc(clubId)
        .collection("allMembers")
        .doc("members")
        .get();

      const isGroupCreator = groupData.createdBy === uid;

      // Check group membership and roles
      let isGroupAdminOrCoach = false;
      if (groupMembersDoc.exists) {
        const groupMembers = groupMembersDoc.data()?.members || [];
        const userGroupMembership = groupMembers.find(
          (member: any) => member.userId === uid,
        );
        const userRoles = userGroupMembership?.roles || [];
        isGroupAdminOrCoach =
          userRoles.includes("admin") || userRoles.includes("coach");
      }

      // Check club admin
      let isClubAdmin = false;
      if (clubMembersDoc.exists) {
        const clubMembers = clubMembersDoc.data()?.members || [];
        const userClubMembership = clubMembers.find(
          (member: any) => member.userId === uid,
        );
        isClubAdmin =
          userClubMembership?.roles?.includes("club-admin") || false;
      }

      if (!isGroupCreator && !isGroupAdminOrCoach && !isClubAdmin) {
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to create subgroups in this group",
        );
      }

      // Check if subgroup name already exists (case-insensitive)
      const existingSubgroupsQuery = await db
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId)
        .collection("subgroups")
        .get();

      const nameExists = existingSubgroupsQuery.docs.some(
        (doc) =>
          doc.data().name.toLowerCase() === trimmedSubGroupName.toLowerCase(),
      );

      if (nameExists) {
        return {
          success: false,
          error: "A subgroup with this name already exists",
        };
      }

      // Generate unique subgroup ID
      const subgroupRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId)
        .collection("subgroups")
        .doc(); // Auto-generate ID

      const subgroupId = subgroupRef.id;

      // Create batch write
      const batch = db.batch();

      // Update group document to add subgroup metadata
      batch.update(groupRef, {
        subGroups: admin.firestore.FieldValue.arrayUnion({
          id: subgroupId,
          name: trimmedSubGroupName,
        }),
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create subgroup document
      batch.set(subgroupRef, {
        name: trimmedSubGroupName,
        createdBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        description: description || "",
        color: color || "",
      });

      // Create empty allMembers/members document
      const subgroupMembersRef = subgroupRef
        .collection("allMembers")
        .doc("members");

      batch.set(subgroupMembersRef, {
        members: [],
        version: 1,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Commit batch
      await batch.commit();

      console.log(
        `✅ Subgroup created: ${subgroupId} (${trimmedSubGroupName}) in group ${groupId}`,
      );

      return {
        success: true,
        message: "Subgroup created successfully",
        subGroupId: subgroupId,
        subGroupName: trimmedSubGroupName,
      };
    } catch (error) {
      console.error("❌ Error creating subgroup:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Failed to create subgroup: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
);
