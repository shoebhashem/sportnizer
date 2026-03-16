/**
 * updateYouthProfile - Cloud Function (onCall)
 *
 * Allows a club-admin or group admin to update a youth player's
 * displayName and/or dateOfBirth.
 *
 * Updates the following denormalized locations:
 *   1. users/{youthUid} — primary document (displayName, dateOfBirth)
 *   2. allMembers arrays (club / group / subgroup) — members[].name
 *   3. Guardian dependents[] — users/{guardianUid}.dependents[].childName / dateOfBirth
 *
 * Permission: Caller must be club-admin for the given clubId,
 * OR have "admin" role in the given groupId.
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { isClubAdmin, isGroupAdmin } from "../utils/roleValidation";

interface UpdateYouthProfileRequest {
  youthUid: string;
  clubId: string;
  groupId?: string;
  displayName?: string;
  dateOfBirth?: string;
}

export const updateYouthProfile = onCall(
  { region: config.region },
  async (request) => {
    try {
      // 1. Auth check
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const callerId = request.auth.uid;
      const { youthUid, clubId, groupId, displayName, dateOfBirth } =
        request.data as UpdateYouthProfileRequest;

      // 2. Validate required fields
      if (!youthUid) {
        throw new HttpsError("invalid-argument", "youthUid is required");
      }
      if (!clubId) {
        throw new HttpsError("invalid-argument", "clubId is required");
      }

      if (displayName === undefined && dateOfBirth === undefined) {
        throw new HttpsError(
          "invalid-argument",
          "At least one of displayName or dateOfBirth must be provided",
        );
      }

      // 3. Validate displayName if provided
      if (displayName !== undefined) {
        const trimmed = displayName.trim();
        if (trimmed.length === 0) {
          throw new HttpsError(
            "invalid-argument",
            "displayName cannot be empty",
          );
        }
        if (trimmed.length > 100) {
          throw new HttpsError(
            "invalid-argument",
            "displayName is too long (max 100 characters)",
          );
        }
      }

      // 4. Permission check — club-admin OR group admin
      const hasClubAdmin = await isClubAdmin(callerId, clubId);
      if (!hasClubAdmin) {
        if (!groupId) {
          throw new HttpsError(
            "invalid-argument",
            "groupId is required when updating as group admin",
          );
        }
        const hasGroupAdmin = await isGroupAdmin(callerId, clubId, groupId);
        if (!hasGroupAdmin) {
          throw new HttpsError(
            "permission-denied",
            "You must be a club admin or group admin to update a youth profile",
          );
        }
      }

      const db = admin.firestore();

      // 5. Verify the target user is a youth member
      const youthDoc = await db.collection("users").doc(youthUid).get();
      if (!youthDoc.exists) {
        throw new HttpsError("not-found", "Youth member not found");
      }

      const youthData = youthDoc.data()!;
      if (!youthData.isYouth) {
        throw new HttpsError(
          "failed-precondition",
          "Target user is not a youth member",
        );
      }

      console.log(
        `[updateYouthProfile] Admin ${callerId} updating youth ${youthUid}`,
      );

      // 6. Build update for the youth's user document
      const youthUpdate: Record<string, any> = {
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (displayName !== undefined) {
        youthUpdate.displayName = displayName.trim();
      }
      if (dateOfBirth !== undefined) {
        youthUpdate.dateOfBirth = dateOfBirth;
      }

      await db.collection("users").doc(youthUid).update(youthUpdate);
      console.log(`[updateYouthProfile] Updated youth user doc ${youthUid}`);

      // 7. Sync name to allMembers arrays (club / group / subgroup)
      if (displayName !== undefined) {
        try {
          await syncNameToMemberArrays(youthUid, displayName.trim());
        } catch (syncErr) {
          // Non-fatal — primary update succeeded
          console.error(
            "[updateYouthProfile] Error syncing name to member arrays:",
            syncErr,
          );
        }
      }

      // 8. Sync to guardian dependents[] arrays
      try {
        await syncToGuardianDependents(
          youthUid,
          youthData.guardians || [],
          displayName?.trim(),
          dateOfBirth,
        );
      } catch (syncErr) {
        // Non-fatal — primary update succeeded
        console.error(
          "[updateYouthProfile] Error syncing to guardian dependents:",
          syncErr,
        );
      }

      return {
        success: true,
        message: "Youth profile updated successfully",
      };
    } catch (error) {
      console.error("[updateYouthProfile] Error:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to update youth profile");
    }
  },
);

/**
 * Sync updated name to all allMembers arrays where the youth appears.
 * Uses the emulator-safe pattern (no __name__ filter on collectionGroup).
 */
async function syncNameToMemberArrays(
  youthUid: string,
  newName: string,
): Promise<void> {
  const db = admin.firestore();

  const allMembersSnap = await db.collectionGroup("allMembers").get();
  const membersDocs = allMembersSnap.docs.filter((doc) => doc.id === "members");

  for (const doc of membersDocs) {
    const members: any[] = doc.data()?.members || [];
    let changed = false;

    const updatedMembers = members.map((m: any) => {
      if (m.userId === youthUid) {
        changed = true;
        return { ...m, name: newName };
      }
      return m;
    });

    if (changed) {
      await doc.ref.update({ members: updatedMembers });
      console.log(`[updateYouthProfile] Synced name in ${doc.ref.path}`);
    }
  }
}

/**
 * Sync updated displayName and/or dateOfBirth to each guardian's
 * users/{guardianUid}.dependents[] array entry for this youth.
 */
async function syncToGuardianDependents(
  youthUid: string,
  guardians: any[],
  newName?: string,
  newDateOfBirth?: string,
): Promise<void> {
  if (!guardians.length) return;

  const db = admin.firestore();

  for (const guardian of guardians) {
    const guardianUid = guardian.guardianUid;
    if (!guardianUid) continue;

    const guardianDoc = await db.collection("users").doc(guardianUid).get();
    if (!guardianDoc.exists) continue;

    const guardianData = guardianDoc.data()!;
    const dependents: any[] = guardianData.dependents || [];
    let changed = false;

    const updatedDependents = dependents.map((dep: any) => {
      if (dep.uid === youthUid) {
        changed = true;
        const patched = { ...dep };
        if (newName !== undefined) {
          patched.childName = newName;
        }
        if (newDateOfBirth !== undefined) {
          patched.dateOfBirth = newDateOfBirth;
        }
        return patched;
      }
      return dep;
    });

    if (changed) {
      await db
        .collection("users")
        .doc(guardianUid)
        .update({
          dependents: updatedDependents,
          version: FieldValue.increment(1),
          lastModified: FieldValue.serverTimestamp(),
        });
      console.log(
        `[updateYouthProfile] Synced dependents for guardian ${guardianUid}`,
      );
    }
  }
}
