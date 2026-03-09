import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FunctionResponse } from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Updates the guardian's dependents array with the youth's club/group access.
 *
 * Supports 3 operation modes:
 *
 * 1. **"sync"** (default, legacy) — Overwrites the dependent's entire clubAccess
 *    with the youth's current clubAccess. Use when a full resync is needed.
 *
 * 2. **"addGroup"** (requires clubId + groupId) — Surgically adds/updates a
 *    single group entry from the youth's clubAccess into the guardian's
 *    dependents[].clubAccess[].groupAccess[]. Used when a youth joins a new
 *    group — only that group is copied, not all groups.
 *
 * 3. **"removeGroup"** (requires clubId + groupId) — Surgically removes a
 *    single group entry from the guardian's dependents[].clubAccess[].groupAccess[].
 *    Used when a group is deleted/deactivated.
 *
 * @param youthUid - The youth member's UID
 * @param guardianUid - The guardian's UID
 * @param clubId - (optional) Target club for surgical operations
 * @param groupId - (optional) Target group for surgical operations
 * @param operation - "sync" | "addGroup" | "removeGroup" (default: "sync")
 */
export const updateGuardianDependentAccess = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const {
        youthUid,
        guardianUid,
        clubId,
        groupId,
        operation = "sync",
      } = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ["youthUid", "guardianUid"]);

      // Validate surgical operations have required params
      if (
        (operation === "addGroup" || operation === "removeGroup") &&
        (!clubId || !groupId)
      ) {
        throw new HttpsError(
          "invalid-argument",
          `Operation '${operation}' requires both clubId and groupId`,
        );
      }

      console.log(
        `Updating dependent access for youth ${youthUid} in guardian ${guardianUid}'s profile (operation: ${operation})`,
      );

      // Get guardian's document
      const guardianRef = admin
        .firestore()
        .collection("users")
        .doc(guardianUid);
      const guardianDoc = await guardianRef.get();

      if (!guardianDoc.exists) {
        throw new HttpsError("not-found", "Guardian document not found");
      }

      const guardianData = guardianDoc.data();
      const dependents = guardianData?.dependents || [];

      // Find the dependent entry for this youth
      const dependentIndex = dependents.findIndex(
        (dep: any) => dep.uid === youthUid,
      );

      if (dependentIndex === -1) {
        throw new HttpsError(
          "not-found",
          "Youth member not found in guardian's dependents array",
        );
      }

      if (operation === "sync") {
        // ─── LEGACY FULL SYNC ───────────────────────────────────
        // Overwrites entire clubAccess from youth's current data
        const youthRef = admin.firestore().collection("users").doc(youthUid);
        const youthDoc = await youthRef.get();

        if (!youthDoc.exists) {
          throw new HttpsError("not-found", "Youth member document not found");
        }

        const youthData = youthDoc.data();
        const youthClubAccess = youthData?.clubAccess || [];

        dependents[dependentIndex] = {
          ...dependents[dependentIndex],
          clubAccess: youthClubAccess,
        };

        console.log(
          `Full sync: copied ${youthClubAccess.length} club(s) to guardian's dependent`,
        );
      } else if (operation === "addGroup") {
        // ─── SURGICAL ADD GROUP ─────────────────────────────────
        // Read only the target group from youth's clubAccess, merge into guardian's dependents
        const youthRef = admin.firestore().collection("users").doc(youthUid);
        const youthDoc = await youthRef.get();

        if (!youthDoc.exists) {
          throw new HttpsError("not-found", "Youth member document not found");
        }

        const youthData = youthDoc.data();
        const youthClubAccess = youthData?.clubAccess || [];

        // Find the target club + group in youth's clubAccess
        const youthClub = youthClubAccess.find(
          (ca: any) => ca.clubId === clubId,
        );
        if (!youthClub) {
          throw new HttpsError(
            "not-found",
            `Club ${clubId} not found in youth's clubAccess`,
          );
        }

        const youthGroup = (youthClub.groupAccess || []).find(
          (g: any) => g.groupId === groupId,
        );
        if (!youthGroup) {
          throw new HttpsError(
            "not-found",
            `Group ${groupId} not found in youth's clubAccess for club ${clubId}`,
          );
        }

        // Merge into guardian's dependents[].clubAccess
        const depClubAccess = dependents[dependentIndex].clubAccess || [];

        // Find or create the club entry in guardian's dependent
        let depClubIndex = depClubAccess.findIndex(
          (ca: any) => ca.clubId === clubId,
        );
        if (depClubIndex === -1) {
          // Club not yet in guardian's dependent — create it (copy club-level fields, empty groupAccess)
          depClubAccess.push({
            clubId: youthClub.clubId,
            clubName: youthClub.clubName,
            role: youthClub.role || "member",
            isActive: youthClub.isActive !== false,
            joinedAt: youthClub.joinedAt,
            lastModifiedAt: youthClub.lastModifiedAt || new Date(),
            groupAccess: [],
          });
          depClubIndex = depClubAccess.length - 1;
        }

        // Find or create the group entry
        const depGroupAccess = depClubAccess[depClubIndex].groupAccess || [];
        const depGroupIndex = depGroupAccess.findIndex(
          (g: any) => g.groupId === groupId,
        );

        if (depGroupIndex === -1) {
          // Group not present — add it
          depGroupAccess.push(youthGroup);
        } else {
          // Group already present — update it
          depGroupAccess[depGroupIndex] = youthGroup;
        }

        depClubAccess[depClubIndex].groupAccess = depGroupAccess;
        dependents[dependentIndex].clubAccess = depClubAccess;

        console.log(
          `Surgical addGroup: added group ${groupId} to guardian's dependent for club ${clubId}`,
        );
      } else if (operation === "removeGroup") {
        // ─── SURGICAL REMOVE GROUP ──────────────────────────────
        // Remove specific group from guardian's dependents (no youth read needed)
        const depClubAccess = dependents[dependentIndex].clubAccess || [];
        const depClubIndex = depClubAccess.findIndex(
          (ca: any) => ca.clubId === clubId,
        );

        if (depClubIndex !== -1) {
          const depGroupAccess = depClubAccess[depClubIndex].groupAccess || [];
          depClubAccess[depClubIndex].groupAccess = depGroupAccess.filter(
            (g: any) => g.groupId !== groupId,
          );

          // If no groups left in this club, remove the club entry too
          if (depClubAccess[depClubIndex].groupAccess.length === 0) {
            depClubAccess.splice(depClubIndex, 1);
          }

          dependents[dependentIndex].clubAccess = depClubAccess;
          console.log(
            `Surgical removeGroup: removed group ${groupId} from guardian's dependent for club ${clubId}`,
          );
        } else {
          console.log(
            `ℹ️ Club ${clubId} not found in guardian's dependent — nothing to remove`,
          );
        }
      } else {
        throw new HttpsError(
          "invalid-argument",
          `Invalid operation '${operation}'. Must be 'sync', 'addGroup', or 'removeGroup'`,
        );
      }

      // Write updated dependents back to guardian document
      await guardianRef.update({
        dependents: dependents,
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp(),
      });

      console.log(
        `Successfully updated dependent access for youth ${youthUid} in guardian ${guardianUid}'s profile`,
      );

      return {
        success: true,
        message: `Guardian dependent access updated successfully (${operation})`,
      };
    } catch (error) {
      console.error("Error in updateGuardianDependentAccess:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to update guardian dependent access",
      );
    }
  },
);
