import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
    UpdateEventResponseRequest,
    UpdateEventResponseResponse,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Updates a user's response to an event invitation (Accept/Decline)
 *
 * Features:
 * - Validates user is invited to the event
 * - Updates response status and timestamp
 * - Recalculates responseSummary counts
 * - Atomic transaction to prevent race conditions
 *
 * @param request - Response update data
 * @returns Promise with success status
 *
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('invalid-argument') - Missing required fields
 * @throws HttpsError('not-found') - Event not found
 * @throws HttpsError('permission-denied') - User not invited to event
 */
export const updateEventResponse = onCall(
  { region: config.region },
  async (request): Promise<UpdateEventResponseResponse> => {
    try {
      // ============================================================================
      // STEP 1: Authentication & Validation
      // ============================================================================
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const data: UpdateEventResponseRequest = request.data;

      console.log(
        "🔍 DEBUG [updateEventResponse] - Request received:",
        JSON.stringify({
          eventId: data.eventId,
          clubId: data.clubId,
          userId: data.userId,
          response: data.response,
        }),
      );

      validateRequiredFields(data, ["eventId", "clubId", "userId", "response"]);

      // Validate response value
      if (!["accepted", "declined"].includes(data.response)) {
        throw new HttpsError(
          "invalid-argument",
          'Response must be "accepted" or "declined"',
        );
      }

      // Validate optional comment (max 100 characters)
      if (data.comment !== undefined && data.comment !== null) {
        if (typeof data.comment !== "string") {
          throw new HttpsError("invalid-argument", "Comment must be a string");
        }
        if (data.comment.length > 100) {
          throw new HttpsError(
            "invalid-argument",
            "Comment must be 100 characters or less",
          );
        }
      }

      const db = admin.firestore();

      console.log(
        "🔍 DEBUG [updateEventResponse] - Constructing Firestore path:",
        `clubs/${data.clubId}/events/${data.eventId}`,
      );

      const eventRef = db
        .collection("clubs")
        .doc(data.clubId)
        .collection("events")
        .doc(data.eventId);

      console.log(
        `📝 User ${request.auth.uid} updating response to "${data.response}" for userId ${data.userId} in event ${data.eventId}`,
      );

      // ============================================================================
      // STEP 2: Update Response Using Transaction
      // ============================================================================
      await db.runTransaction(async (transaction) => {
        const eventDoc = await transaction.get(eventRef);

        console.log(
          "🔍 DEBUG [updateEventResponse] - Event document read result:",
          JSON.stringify({
            exists: eventDoc.exists,
            hasData: !!eventDoc.data(),
            path: `clubs/${data.clubId}/events/${data.eventId}`,
          }),
        );

        if (!eventDoc.exists) {
          console.error(
            "❌ ERROR [updateEventResponse] - Event not found at path:",
            `clubs/${data.clubId}/events/${data.eventId}`,
          );
          throw new HttpsError("not-found", "Event not found");
        }

        const eventData = eventDoc.data()!; // Assert non-null after exists check
        const authUid = request.auth!.uid; // Assert non-null (checked at function start)

        // ============================================================================
        // DEADLINE CHECK: Enforce response deadline with role-based override
        // ============================================================================
        if (eventData.responseDeadline) {
          const deadline = eventData.responseDeadline.toDate();
          const now = new Date();

          if (deadline < now) {
            console.log(
              `⏰ Deadline passed for event ${data.eventId}. Checking permissions...`,
            );

            // Deadline passed - check if user has permission to override
            const userDoc = await db.collection("users").doc(authUid).get();
            const userData = userDoc.data();

            if (!userData) {
              throw new HttpsError("not-found", "User profile not found");
            }

            const clubAccess = userData.clubAccess?.find(
              (ca: any) => ca.clubId === data.clubId,
            );

            let canOverrideDeadline = false;

            // Check if user is club-admin
            if (clubAccess?.role === "club-admin") {
              canOverrideDeadline = true;
              console.log(
                `✅ User ${authUid} is club-admin, allowing post-deadline response`,
              );
            }

            // Check if user is admin/coach in the event's group
            if (
              !canOverrideDeadline &&
              eventData.targetScope?.groupId &&
              clubAccess?.groupAccess
            ) {
              const groupAccess = clubAccess.groupAccess.find(
                (ga: any) => ga.groupId === eventData.targetScope.groupId,
              );

              if (
                groupAccess?.roles?.includes("admin") ||
                groupAccess?.roles?.includes("coach")
              ) {
                canOverrideDeadline = true;
                console.log(
                  `✅ User ${authUid} is group admin/coach, allowing post-deadline response`,
                );
              }
            }

            if (!canOverrideDeadline) {
              console.log(
                `❌ User ${authUid} does not have permission to respond after deadline`,
              );
              throw new HttpsError(
                "permission-denied",
                "Response deadline has passed. Please contact your coach or admin for assistance.",
              );
            }
          }
        }

        // ============================================================================
        // STEP 2.5: Retrieve Response Data First (needed for permission checks)
        // ============================================================================
        const responses = eventData.responses || [];
        const responseIndex = responses.findIndex(
          (r: any) => r.userId === data.userId,
        );

        if (responseIndex === -1) {
          throw new HttpsError(
            "not-found",
            "Response record not found for this user",
          );
        }

        const responseData = responses[responseIndex];

        // ============================================================================
        // RESPOND FOR OTHERS: Validate permission when respondedBy is different from userId
        // ============================================================================
        if (data.respondedBy && data.respondedBy !== data.userId) {
          console.log(
            `🔍 User ${data.respondedBy} attempting to respond for user ${data.userId}`,
          );

          let canRespondForOthers = false;

          // Check if responder is a guardian of this youth member
          if (
            responseData.isYouthMember &&
            responseData.guardianIds?.includes(data.respondedBy)
          ) {
            canRespondForOthers = true;
            const guardianIndex = responseData.guardianIds.indexOf(
              data.respondedBy,
            );
            const guardianName =
              responseData.guardianNames?.[guardianIndex] || "Guardian";
            console.log(
              `✅ User ${data.respondedBy} is guardian (${guardianName}) of youth member, allowing respond-for-youth`,
            );
          }

          // If not a guardian, check for admin/coach permissions
          if (!canRespondForOthers) {
            // Fetch responder's user profile to check permissions
            const responderDoc = await db
              .collection("users")
              .doc(data.respondedBy)
              .get();

            if (!responderDoc.exists) {
              throw new HttpsError("not-found", "Responder profile not found");
            }

            const responderData = responderDoc.data()!;
            const clubAccess = responderData.clubAccess?.find(
              (ca: any) => ca.clubId === data.clubId,
            );

            // Check if responder is club-admin
            if (clubAccess?.role === "club-admin") {
              canRespondForOthers = true;
              console.log(
                `✅ User ${data.respondedBy} is club-admin, allowing respond-for-others`,
              );
            }

            // Check if responder is admin/coach in the event's group
            if (
              !canRespondForOthers &&
              eventData.targetScope?.groupId &&
              clubAccess?.groupAccess
            ) {
              const groupAccess = clubAccess.groupAccess.find(
                (ga: any) => ga.groupId === eventData.targetScope.groupId,
              );

              if (
                groupAccess?.roles?.includes("admin") ||
                groupAccess?.roles?.includes("coach")
              ) {
                canRespondForOthers = true;
                console.log(
                  `✅ User ${data.respondedBy} is group admin/coach, allowing respond-for-others`,
                );
              }
            }
          }

          if (!canRespondForOthers) {
            console.log(
              `❌ User ${data.respondedBy} does not have permission to respond for others`,
            );
            throw new HttpsError(
              "permission-denied",
              "You do not have permission to respond for other users",
            );
          }

          // Permission granted - will record respondedBy later
        }

        // ============================================================================
        // CAPACITY CHECK: Prevent accepting if event is full
        // ============================================================================
        if (
          data.response.toLowerCase() === "accepted" &&
          eventData.capacity?.max
        ) {
          const currentAccepted = eventData.responseSummary?.accepted || 0;

          // Find current user's response to check if they're already accepted
          const currentUserResponse = eventData.responses?.find(
            (r: any) => r.userId === data.userId,
          );
          const isCurrentlyAccepted =
            currentUserResponse?.response === "accepted" ||
            currentUserResponse?.response === "Accepted";

          // Only block if at capacity AND user isn't already accepted
          if (
            currentAccepted >= eventData.capacity.max &&
            !isCurrentlyAccepted
          ) {
            throw new HttpsError(
              "resource-exhausted",
              `Event is full. Maximum capacity of ${eventData.capacity.max} participants has been reached.`,
            );
          }
        }

        // ============================================================================
        // FINAL PERMISSION CHECK: Determine responder type and name for audit trail
        // ============================================================================
        let isGuardianResponding = false;
        let isAdminCoachResponding = false;
        let responderName = "";

        if (authUid === data.userId) {
          // User updating their own response
          console.log("✅ User updating their own response");
        } else if (
          responseData.isYouthMember &&
          responseData.guardianIds?.includes(authUid)
        ) {
          // Guardian updating youth member's response
          isGuardianResponding = true;
          const guardianIndex = responseData.guardianIds.indexOf(authUid);
          responderName =
            responseData.guardianNames?.[guardianIndex] || "Guardian";
          console.log(`✅ Guardian ${responderName} updating youth response`);
        } else if (data.respondedBy && data.respondedBy === authUid) {
          // Admin/Coach responding for another user (already validated above)
          isAdminCoachResponding = true;
          const responderDoc = await db.collection("users").doc(authUid).get();
          const responderData = responderDoc.data();
          responderName = responderData?.name || "Admin/Coach";
          console.log(
            `✅ Admin/Coach ${responderName} responding for user ${data.userId}`,
          );
        } else if (!eventData.invitedUserIds?.includes(authUid)) {
          throw new HttpsError(
            "permission-denied",
            "You are not invited to this event",
          );
        } else {
          throw new HttpsError(
            "permission-denied",
            "You can only update your own event response",
          );
        }

        // Get old response to adjust counts
        const oldResponse = responses[responseIndex].response;
        const oldResponseData = responses[responseIndex];

        // Save response history if guardian is overriding a previous response
        let responseHistory = oldResponseData.responseHistory || [];
        if (
          (isGuardianResponding || isAdminCoachResponding) &&
          oldResponse !== "pending"
        ) {
          responseHistory.push({
            response: oldResponse,
            changedAt: Timestamp.now(), // Use Timestamp.now() for array fields
            changedBy: authUid,
            changedByName: responderName,
          });
        }

        // Update the response
        const updatedResponse: any = {
          ...responses[responseIndex],
          response: data.response,
          respondedAt: Timestamp.now(), // Use Timestamp.now() for array fields
        };

        // Store optional comment (trim whitespace, allow clearing with empty string)
        if (data.comment !== undefined && data.comment !== null) {
          const trimmed = data.comment.trim();
          updatedResponse.comment = trimmed || null; // Store null if empty after trim
        }

        // If guardian or admin/coach is responding, track who responded
        if (isGuardianResponding || isAdminCoachResponding) {
          updatedResponse.respondedBy = authUid;
          updatedResponse.respondedByName = responderName;
          updatedResponse.responseHistory = responseHistory;
        }

        responses[responseIndex] = updatedResponse;

        // Recalculate responseSummary
        const responseSummary = {
          totalInvited:
            eventData.responseSummary?.totalInvited || responses.length,
          accepted: 0,
          declined: 0,
          pending: 0,
          ...(eventData.responseSummary?.attended && {
            attended: eventData.responseSummary.attended,
          }),
        };

        responses.forEach((r: any) => {
          if (r.response === "accepted") responseSummary.accepted++;
          else if (r.response === "declined") responseSummary.declined++;
          else if (r.response === "pending") responseSummary.pending++;
        });

        // Update event document
        transaction.update(eventRef, {
          responses,
          responseSummary,
          updatedAt: FieldValue.serverTimestamp(),
          version: FieldValue.increment(1),
        });

        console.log(`✅ Response updated: ${oldResponse} → ${data.response}`);
      });

      // ============================================================================
      // STEP 3: Return Success Response
      // ============================================================================
      return {
        success: true,
        message: `Your response has been updated to "${data.response}"`,
      };
    } catch (error: any) {
      console.error("❌ Error in updateEventResponse:", error);

      // Re-throw HttpsError instances
      if (error instanceof HttpsError) {
        throw error;
      }

      // Wrap other errors
      throw new HttpsError(
        "internal",
        `Failed to update event response: ${error.message}`,
      );
    }
  },
);
