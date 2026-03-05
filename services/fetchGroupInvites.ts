// /services/fetchGroupInvites.ts - Read group invitations via Firebase Functions
// Calls getUserProfile Firebase Function following three-layer architecture

import { httpsCallable } from "firebase/functions";
import { functions } from "./core/firebase";
import { addRegularMemberToGroupService } from "./orchestration/addRegularMemberToGroup";
import type { UserProfile } from "./types";

export interface GroupInviteInfo {
  inviteId: string;
  groupId: string;
  groupName: string;
  clubId: string;
  clubName: string;
  invitedBy: string;
  invitedByName?: string;
  createdAt: any; // Firestore timestamp
  status: "pending" | "accepted" | "rejected";
  message?: string;
  role?: string;
  invitationType?: string;
  youthData?: {
    childName: string;
    dateOfBirth: string;
    relationship: string;
  };
  existingYouthData?: {
    youthUid: string;
    youthName: string;
  };
  metadata?: {
    action?: "role_update" | "new_member";
    newRole?: string;
    existingRoles?: string[];
    [key: string]: any;
  };
}

export interface FetchGroupInvitesResponse {
  success: boolean;
  invites: GroupInviteInfo[];
  totalCount: number;
  error?: string;
}

/**
 * Fetches all pending group invitations for the current user from unified invitations collection
 * Uses Firebase Functions to query the invitations collection for this user's pending invites
 */
export const fetchGroupInvites = async (
  userId: string,
): Promise<FetchGroupInvitesResponse> => {
  try {
    console.log(`📬 Fetching group invitations for user: ${userId}`);

    // Get user profile to get their email for invitation lookup
    const getUserProfileFn = httpsCallable(functions, "getUserProfile");
    const result = await getUserProfileFn({ uid: userId });

    const response = result.data as {
      success: boolean;
      userProfile?: UserProfile;
      error?: string;
    };

    if (!response.success || !response.userProfile) {
      console.log(`No user profile found for userId ${userId}`);
      return { success: true, invites: [], totalCount: 0 };
    }

    const userEmail = response.userProfile.email;
    if (!userEmail) {
      console.log(`No email found for user ${userId}`);
      return { success: true, invites: [], totalCount: 0 };
    }

    // 🎯 UNIFIED: Query invitations collection for this user's pending invites
    // Look for invitations where:
    // - email matches user's email AND status is 'pending' (existing user flow)
    // - OR userId matches AND status is 'accepted_pending_signup' (new user flow - though this shouldn't happen in this context)
    const { getDocs, query, where, collection, or } =
      await import("firebase/firestore");
    const { db } = await import("./core/firebase");

    const invitationsQuery = query(
      collection(db, "invitations"),
      or(
        where("email", "==", userEmail.toLowerCase()),
        where("userId", "==", userId),
      ),
    );

    const invitationsSnapshot = await getDocs(invitationsQuery);
    const allInvites: GroupInviteInfo[] = [];

    invitationsSnapshot.forEach((doc) => {
      const inviteData = doc.data();

      // Only include pending invitations for existing users
      // Now includes youth invitations - guardians need to see and accept these via modal
      if (inviteData.status === "pending") {
        allInvites.push({
          inviteId: doc.id, // Use document ID as invitation token
          groupId: inviteData.groupId,
          groupName: inviteData.groupName,
          clubId: inviteData.clubId,
          clubName: inviteData.clubName,
          invitedBy: inviteData.inviterUid,
          invitedByName: inviteData.inviterName,
          createdAt: inviteData.createdAt,
          status: inviteData.status,
          message: inviteData.message,
          role: inviteData.role,
          invitationType: inviteData.invitationType,
          youthData: inviteData.youthData,
          existingYouthData: inviteData.existingYouthData,
          metadata: inviteData.metadata,
        });
      }
    });

    // Sort by creation date (newest first)
    allInvites.sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });

    console.log(
      `✅ Found ${allInvites.length} pending group invitations from unified collection`,
    );

    return {
      success: true,
      invites: allInvites,
      totalCount: allInvites.length,
    };
  } catch (error) {
    console.error("❌ Error fetching group invites:", error);
    return {
      success: false,
      invites: [],
      totalCount: 0,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};

/**
 * Fetches a specific invitation by token for notification clicks
 * Unlike fetchGroupInvites, this does NOT filter out youth invitations
 * Used when user clicks on a notification to view/accept invitation details
 *
 * @param userId - The user ID (for logging/context)
 * @param invitationToken - The invitation document ID
 * @returns Promise with the invitation details or null if not found
 */
export const fetchInvitationByToken = async (
  userId: string,
  invitationToken: string,
): Promise<GroupInviteInfo | null> => {
  try {
    console.log(
      `📬 Fetching invitation by token: ${invitationToken} for user: ${userId}`,
    );

    const { getDoc, doc } = await import("firebase/firestore");
    const { db } = await import("./core/firebase");

    const inviteDoc = await getDoc(doc(db, "invitations", invitationToken));

    if (!inviteDoc.exists()) {
      console.log(`❌ Invitation not found: ${invitationToken}`);
      return null;
    }

    const inviteData = inviteDoc.data();

    // ✅ Safety check: Only return pending invitations
    if (inviteData.status !== "pending") {
      console.log(
        `⚠️ Invitation ${invitationToken} is not pending (status: ${inviteData.status})`,
      );
      return null;
    }

    console.log(
      `✅ Found invitation: ${invitationToken} (type: ${inviteData.invitationType || "regular"})`,
    );

    // Return invitation regardless of type (includes youth invitations)
    return {
      inviteId: inviteDoc.id,
      groupId: inviteData.groupId,
      groupName: inviteData.groupName,
      clubId: inviteData.clubId,
      clubName: inviteData.clubName,
      invitedBy: inviteData.inviterUid,
      invitedByName: inviteData.inviterName,
      createdAt: inviteData.createdAt,
      status: inviteData.status,
      message: inviteData.message,
      invitationType: inviteData.invitationType,
      youthData: inviteData.youthData,
      existingYouthData: inviteData.existingYouthData,
      metadata: inviteData.metadata,
    };
  } catch (error: any) {
    console.error("❌ Error fetching invitation by token:", error);
    return null;
  }
};

/**
 * Accepts a group invitation (uses unified orchestration service for both user types)
 */
export const acceptGroupInvite = async (
  inviteId: string,
  clubId: string,
  groupId: string,
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    console.log(`✅ Accepting invitation ${inviteId} for group ${groupId}`);

    // 🎯 UNIFIED: Call unified orchestration service for both new and existing users
    // This uses the same processInvitationAfterUserResponse that handles signup flow

    // Get current user ID (required for the unified function)
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth();

    if (!auth.currentUser) {
      return {
        success: false,
        error: "User must be authenticated",
      };
    }

    const result =
      await addRegularMemberToGroupService.processInvitationAfterUserResponse(
        inviteId, // invitation token (works for both flows)
        auth.currentUser.uid, // user ID (existing user ID for this case)
        "accept", // action: accept the invitation
      );

    if (result.success) {
      console.log(`✅ Successfully accepted invitation: ${result.message}`);
      return {
        success: true,
        message: result.message,
      };
    } else {
      console.error("❌ Failed to accept invitation:", result.error);
      return {
        success: false,
        error: result.error || "Failed to accept invitation",
      };
    }
  } catch (error) {
    console.error("❌ Error accepting invitation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};

/**
 * Rejects a group invitation (uses unified orchestration service for both user types)
 */
export const rejectGroupInvite = async (
  inviteId: string,
  clubId: string,
  groupId: string,
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    console.log(`❌ Rejecting invitation ${inviteId} for group ${groupId}`);

    // 🎯 UNIFIED: Call unified orchestration service for both new and existing users
    // This uses the same processInvitationAfterUserResponse that handles signup flow

    // Get current user ID (required for the unified function)
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth();

    if (!auth.currentUser) {
      return {
        success: false,
        error: "User must be authenticated",
      };
    }

    const result =
      await addRegularMemberToGroupService.processInvitationAfterUserResponse(
        inviteId, // invitation token (works for both flows)
        auth.currentUser.uid, // user ID (existing user ID for this case)
        "reject", // action: reject the invitation
      );

    if (result.success) {
      console.log(`✅ Successfully rejected invitation: ${result.message}`);
      return {
        success: true,
        message: result.message,
      };
    } else {
      console.error("❌ Failed to reject invitation:", result.error);
      return {
        success: false,
        error: result.error || "Failed to reject invitation",
      };
    }
  } catch (error) {
    console.error("❌ Error rejecting invitation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};
