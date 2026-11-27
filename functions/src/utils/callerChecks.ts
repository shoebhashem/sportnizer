import { HttpsError } from "firebase-functions/v2/https";
import { isClubAdmin, isGroupAdmin } from "./roleValidation";

/**
 * Authorization checks for the callable functions that edit ANOTHER user's
 * clubAccess (updateUserClubDeletion, updateUserClubRemoval,
 * updateUserGroupDeletion, updateUserGroupRemoval).
 *
 * Before these checks, any signed-in user could call them to change any
 * other user's club/group access.
 */

function requireAuth(auth: { uid: string } | undefined): string {
  if (!auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  return auth.uid;
}

/** Caller must be a club-admin of the club (optionally: or the user themself). */
export async function assertClubAdminOrSelf(
  auth: { uid: string } | undefined,
  params: { userId: string; clubId: string; allowSelf: boolean },
): Promise<void> {
  const callerId = requireAuth(auth);
  if (params.allowSelf && callerId === params.userId) return;
  if (await isClubAdmin(callerId, params.clubId)) return;
  throw new HttpsError(
    "permission-denied",
    "Only a club admin can update another member's club access",
  );
}

/**
 * Caller must be an admin of the group or a club-admin of its club
 * (optionally: or the user themself).
 */
export async function assertGroupAdminOrSelf(
  auth: { uid: string } | undefined,
  params: { userId: string; clubId: string; groupId: string; allowSelf: boolean },
): Promise<void> {
  const callerId = requireAuth(auth);
  if (params.allowSelf && callerId === params.userId) return;
  if (await isGroupAdmin(callerId, params.clubId, params.groupId)) return;
  throw new HttpsError(
    "permission-denied",
    "Only a group admin or club admin can update another member's group access",
  );
}
