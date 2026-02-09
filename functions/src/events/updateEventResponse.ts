import * as admin from "firebase-admin";
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

        // Find user's response object first (to check if it's a youth member)
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
        // PERMISSION CHECK: Allow user to update their own response OR guardians to update youth responses
        // ============================================================================
        let isGuardianResponding = false;
        let guardianName = "";

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
          guardianName =
            responseData.guardianNames?.[guardianIndex] || "Guardian";
          console.log(`✅ Guardian ${guardianName} updating youth response`);
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

        // ============================================================================
        // STEP 2A: Validate Response Timing
        // ============================================================================
        const now = admin.firestore.Timestamp.now();

        // Check if response deadline is set and has passed
        if (eventData.responseDeadline) {
          const deadline = eventData.responseDeadline;
          if (now.toMillis() > deadline.toMillis()) {
            throw new HttpsError(
              "failed-precondition",
              "Response deadline has passed. You can no longer respond to this event.",
            );
          }
        }
        // If no deadline, check if event has already started
        else if (eventData.startDate) {
          // startDate might be a Timestamp or a string
          const eventStart =
            typeof eventData.startDate === "string"
              ? admin.firestore.Timestamp.fromDate(
                  new Date(eventData.startDate),
                )
              : eventData.startDate;

          if (now.toMillis() > eventStart.toMillis()) {
            throw new HttpsError(
              "failed-precondition",
              "Event has already started. You can no longer respond.",
            );
          }
        }

        // Get old response to adjust counts
        const oldResponse = responses[responseIndex].response;
        const oldResponseData = responses[responseIndex];

        // Save response history if guardian is overriding a previous response
        let responseHistory = oldResponseData.responseHistory || [];
        if (isGuardianResponding && oldResponse !== "pending") {
          responseHistory.push({
            response: oldResponse,
            changedAt: admin.firestore.Timestamp.now(), // Use Timestamp.now() for array fields
            changedBy: authUid,
            changedByName: guardianName,
          });
        }

        // Update the response
        const updatedResponse: any = {
          ...responses[responseIndex],
          response: data.response,
          respondedAt: admin.firestore.Timestamp.now(), // Use Timestamp.now() for array fields
        };

        // If guardian is responding, track who responded
        if (isGuardianResponding) {
          updatedResponse.respondedBy = authUid;
          updatedResponse.respondedByName = guardianName;
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
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
