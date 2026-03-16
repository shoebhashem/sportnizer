/**
 * updateGuardianContactInfo - Cloud Function (onCall)
 *
 * Allows a guardian to update their own contact info (phone).
 * Also allows a club-admin or group admin to update any guardian's
 * phone number for a youth player in their club/group.
 *
 * Updates:
 *   1. The guardian's own users/{guardianUid} document
 *   2. The youth's users/{youthUid}.guardians[] entry for this guardian
 *   3. guardiansContacts[] in allMembers arrays where the youth appears
 *
 * Permission:
 *   - The caller is listed in the youth's guardians[] array, OR
 *   - The caller is a club-admin for the given clubId, OR
 *   - The caller is a group admin for the given groupId.
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { isClubAdmin, isGroupAdmin } from "../utils/roleValidation";

interface UpdateGuardianContactRequest {
  youthUid: string;
  phoneNumber?: string | null;
  /** Required when an admin is updating on behalf of the guardian */
  guardianUid?: string;
  /** Required for admin permission verification */
  clubId?: string;
  /** Required for admin permission verification */
  groupId?: string;
}

export const updateGuardianContactInfo = onCall(
  { region: config.region },
  async (request) => {
    try {
      // 1. Auth check
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const callerUid = request.auth.uid;
      const {
        youthUid,
        phoneNumber,
        guardianUid: targetGuardianUid,
        clubId,
        groupId,
      } = request.data as UpdateGuardianContactRequest;

      if (!youthUid) {
        throw new HttpsError("invalid-argument", "youthUid is required");
      }

      if (phoneNumber === undefined) {
        throw new HttpsError(
          "invalid-argument",
          "phoneNumber must be provided",
        );
      }

      const db = admin.firestore();

      // 2. Verify the youth exists
      const youthDoc = await db.collection("users").doc(youthUid).get();
      if (!youthDoc.exists) {
        throw new HttpsError("not-found", "Youth member not found");
      }

      const youthData = youthDoc.data()!;
      const guardians: any[] = youthData.guardians || [];

      // 3. Determine who the guardian target is, and verify permission
      let guardianUid: string;

      if (targetGuardianUid && targetGuardianUid !== callerUid) {
        // Admin updating on behalf of a guardian
        if (!clubId) {
          throw new HttpsError(
            "invalid-argument",
            "clubId is required when updating as admin",
          );
        }

        const hasClubAdmin = await isClubAdmin(callerUid, clubId);
        if (!hasClubAdmin) {
          if (!groupId) {
            throw new HttpsError(
              "invalid-argument",
              "groupId is required when updating as group admin",
            );
          }
          const hasGroupAdmin = await isGroupAdmin(callerUid, clubId, groupId);
          if (!hasGroupAdmin) {
            throw new HttpsError(
              "permission-denied",
              "You must be a club admin or group admin to update another guardian's contact",
            );
          }
        }

        guardianUid = targetGuardianUid;
      } else {
        // Guardian updating their own contact
        guardianUid = callerUid;
      }

      // 4. Verify the guardian exists in the youth's guardians[] array
      const guardianIndex = guardians.findIndex(
        (g: any) => g.guardianUid === guardianUid,
      );

      if (guardianIndex === -1) {
        throw new HttpsError(
          "permission-denied",
          "The specified user is not a guardian of this youth member",
        );
      }

      console.log(
        `[updateGuardianContactInfo] Guardian ${guardianUid} updating contact for youth ${youthUid}`,
      );

      // 3. Build update for guardian's own user doc
      const guardianUpdate: Record<string, any> = {
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        phoneNumber: phoneNumber,
      };

      // 4. Update the guardian's own user document
      await db.collection("users").doc(guardianUid).update(guardianUpdate);
      console.log(
        `[updateGuardianContactInfo] Updated guardian user doc ${guardianUid}`,
      );

      // 5. Update the guardian entry in the youth's guardians[] array
      const updatedGuardians = [...guardians];
      updatedGuardians[guardianIndex] = {
        ...updatedGuardians[guardianIndex],
        phoneNumber: phoneNumber,
      };

      await db
        .collection("users")
        .doc(youthUid)
        .update({
          guardians: updatedGuardians,
          version: FieldValue.increment(1),
          lastModified: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

      console.log(
        `[updateGuardianContactInfo] Updated youth doc ${youthUid} guardians array`,
      );

      // 6. Also update guardiansContacts in allMembers arrays where the youth appears
      // This keeps the denormalized data in sync
      try {
        await syncGuardianContactInMemberArrays(
          youthUid,
          guardianUid,
          phoneNumber,
        );
      } catch (syncErr) {
        // Log but don't fail — the primary update succeeded
        console.error(
          "[updateGuardianContactInfo] Error syncing to member arrays:",
          syncErr,
        );
      }

      return { success: true };
    } catch (error) {
      console.error("[updateGuardianContactInfo] Error:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to update guardian contact info",
      );
    }
  },
);

/**
 * Sync updated guardian contact info to guardiansContacts[] in allMembers arrays
 * where the youth member appears.
 */
async function syncGuardianContactInMemberArrays(
  youthUid: string,
  guardianUid: string,
  phoneNumber?: string | null,
): Promise<void> {
  const db = admin.firestore();

  // Find all allMembers docs where this youth appears
  const allMembersSnap = await db
    .collectionGroup("allMembers")
    .where("__name__", "==", "members")
    .get();

  for (const doc of allMembersSnap.docs) {
    const members: any[] = doc.data()?.members || [];
    const memberIndex = members.findIndex((m: any) => m.userId === youthUid);
    if (memberIndex === -1) continue;

    const member = members[memberIndex];
    const guardiansContacts: any[] = member.guardiansContacts || [];
    let updated = false;

    const updatedContacts = guardiansContacts.map((gc: any) => {
      if (gc.guardianUid === guardianUid) {
        updated = true;
        const patched = { ...gc };
        if (phoneNumber !== undefined) patched.phone = phoneNumber;
        return patched;
      }
      return gc;
    });

    if (updated) {
      const updatedMembers = [...members];
      updatedMembers[memberIndex] = {
        ...member,
        guardiansContacts: updatedContacts,
      };
      await doc.ref.update({ members: updatedMembers });
      console.log(
        `[updateGuardianContactInfo] Synced guardian contact in ${doc.ref.path}`,
      );
    }
  }
}
