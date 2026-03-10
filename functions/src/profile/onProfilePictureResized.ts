/**
 * onProfilePictureResized - Cloud Function (Storage trigger)
 *
 * Triggered when the Firebase resize extension creates a resized profile picture
 * in the customProfilePictures/ path.
 *
 * Updates photoURL in all Firestore locations:
 * 1. users/{userId}.photoURL
 * 2. clubs/{clubId}/allMembers/members → matching entry in members array
 * 3. clubs/{clubId}/groups/{groupId}/allMembers/members → matching entry
 * 4. clubs/{clubId}/groups/{groupId}/subgroups/{subgroupId}/allMembers/members → matching entry
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onObjectFinalized } from "firebase-functions/v2/storage";

/**
 * Extract userId from the resized image path.
 * Actual path from resize extension: profilePictures/users/{userId}/customProfilePictures/profile_200x200.png
 */
function extractUserIdFromPath(filePath: string): string | null {
  const match = filePath.match(
    /^profilePictures\/users\/([^/]+)\/customProfilePictures\/profile_200x200\./,
  );
  return match ? match[1] : null;
}

/**
 * Build the public download URL for a Storage object.
 * Uses GCS public URL format (works because MAKE_PUBLIC=true on resize extension).
 */
function buildPublicUrl(bucket: string, filePath: string): string {
  const cacheBuster = Date.now();
  return `https://storage.googleapis.com/${bucket}/${filePath}?t=${cacheBuster}`;
}

export const onProfilePictureResized = onObjectFinalized(
  {
    // Storage trigger must be in the same region as the bucket (us-east1)
    region: "us-east1",
    bucket: "sportnizer.firebasestorage.app",
  },
  async (event) => {
    const filePath = event.data.name;
    const bucket = event.data.bucket;

    if (!filePath) {
      console.log("No file path in event, skipping.");
      return;
    }

    // Only process files in customProfilePictures/ under profilePictures/users/
    const userId = extractUserIdFromPath(filePath);
    if (!userId) {
      console.log(
        `File ${filePath} is not a resized profile picture, skipping.`,
      );
      return;
    }

    console.log(
      `🖼️ Resized profile picture detected for user ${userId}: ${filePath}`,
    );

    const photoURL = buildPublicUrl(bucket, filePath);
    const db = admin.firestore();

    try {
      // 1. Update user document
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        console.error(`User document not found for ${userId}`);
        return;
      }

      await userRef.update({ photoURL });
      console.log(`✅ Updated users/${userId}.photoURL`);

      // 2. Read user's clubAccess to find all clubs/groups/subgroups
      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];

      for (const club of clubAccess) {
        const clubId = club.clubId;
        if (!clubId) continue;

        // 2a. Update club allMembers
        await updateMemberPhotoInArray(
          db,
          `clubs/${clubId}/allMembers/members`,
          userId,
          photoURL,
        );

        // 2b. Update each group's allMembers
        const groupAccess = club.groupAccess || [];
        for (const group of groupAccess) {
          const groupId = group.groupId;
          if (!groupId) continue;

          await updateMemberPhotoInArray(
            db,
            `clubs/${clubId}/groups/${groupId}/allMembers/members`,
            userId,
            photoURL,
          );

          // 2c. Check for subgroups this user belongs to
          await updateSubgroupMemberPhoto(
            db,
            clubId,
            groupId,
            userId,
            photoURL,
          );
        }
      }

      console.log(`✅ All Firestore locations updated for user ${userId}`);
    } catch (error) {
      console.error(`❌ Error updating Firestore for user ${userId}:`, error);
    }
  },
);

/**
 * Update photoURL for a specific user in a members array document.
 * The document at docPath has a `members` field which is an array of member objects.
 */
async function updateMemberPhotoInArray(
  db: admin.firestore.Firestore,
  docPath: string,
  userId: string,
  photoURL: string,
): Promise<void> {
  try {
    const docRef = db.doc(docPath);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log(`Document ${docPath} does not exist, skipping.`);
      return;
    }

    const data = doc.data();
    const members = data?.members || [];

    const memberIndex = members.findIndex((m: any) => m.userId === userId);

    if (memberIndex === -1) {
      console.log(`User ${userId} not found in ${docPath}, skipping.`);
      return;
    }

    // Update the photoURL in the member entry
    members[memberIndex].photoURL = photoURL;

    await docRef.update({
      members,
      version: FieldValue.increment(1),
      lastModified: FieldValue.serverTimestamp(),
    });

    console.log(`✅ Updated photoURL in ${docPath}`);
  } catch (error) {
    console.error(`❌ Error updating ${docPath}:`, error);
  }
}

/**
 * Find and update subgroup member entries for a user within a group.
 * Queries all subgroups under the group and checks each allMembers/members doc.
 */
async function updateSubgroupMemberPhoto(
  db: admin.firestore.Firestore,
  clubId: string,
  groupId: string,
  userId: string,
  photoURL: string,
): Promise<void> {
  try {
    const subgroupsSnapshot = await db
      .collection(`clubs/${clubId}/groups/${groupId}/subgroups`)
      .get();

    for (const subgroupDoc of subgroupsSnapshot.docs) {
      const subgroupId = subgroupDoc.id;
      await updateMemberPhotoInArray(
        db,
        `clubs/${clubId}/groups/${groupId}/subgroups/${subgroupId}/allMembers/members`,
        userId,
        photoURL,
      );
    }
  } catch (error) {
    console.error(
      `❌ Error updating subgroup members for group ${groupId}:`,
      error,
    );
  }
}
