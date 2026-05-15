import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createNotificationDirect } from "../notifications/createNotification";
import {
    EventResponse,
    SyncEventRecipientsRequest,
    SyncEventRecipientsResponse,
    SyncMemberDiff,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Sync event recipients with the current group/club membership.
 *
 * Two modes:
 *   "preview"  – returns the diff (added / removed / unchanged) without writing anything
 *   "confirm"  – applies the diff: appends new members, sends them notifications
 *
 * For recurring events an optional `scope` parameter controls whether only
 * the targeted occurrence ("single") or this + all future non-modified,
 * non-cancelled occurrences ("future") are synced.
 *
 * Removed members are reported but never deleted from the event document –
 * their historical response data is preserved.
 */
export const syncEventRecipients = onCall(
  { region: config.region, timeoutSeconds: 120 },
  async (request): Promise<SyncEventRecipientsResponse> => {
    try {
      // ======================================================================
      // STEP 1: Authentication & Validation
      // ======================================================================
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;
      const data: SyncEventRecipientsRequest = request.data;

      validateRequiredFields(data, ["clubId", "eventId", "mode"]);

      if (
        data.mode !== "preview" &&
        data.mode !== "confirm" &&
        data.mode !== "manual"
      ) {
        throw new HttpsError(
          "invalid-argument",
          "mode must be 'preview', 'confirm', or 'manual'",
        );
      }

      if (data.scope && data.scope !== "single" && data.scope !== "future") {
        throw new HttpsError(
          "invalid-argument",
          "scope must be 'single' or 'future'",
        );
      }

      const db = admin.firestore();
      const clubId = data.clubId;

      // ======================================================================
      // STEP 2: Fetch the event document
      // ======================================================================
      const eventRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("events")
        .doc(data.eventId);

      const eventDoc = await eventRef.get();
      if (!eventDoc.exists) {
        throw new HttpsError("not-found", "Event not found");
      }

      const eventData = eventDoc.data()!;

      // ======================================================================
      // STEP 3: Permission check – creator, club-admin, or group admin/coach
      // ======================================================================
      const isCreator = eventData.createdBy === userId;

      if (!isCreator) {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();
        if (!userData) {
          throw new HttpsError("permission-denied", "User profile not found");
        }

        const clubAccess = userData.clubAccess?.find(
          (ca: any) => ca.clubId === clubId,
        );
        if (!clubAccess) {
          throw new HttpsError(
            "permission-denied",
            "You are not a member of this club",
          );
        }

        const isClubAdmin = clubAccess.role === "club-admin";

        if (!isClubAdmin) {
          const eventGroupId =
            eventData.targetScope?.groupId || eventData.groupId;
          if (eventGroupId && clubAccess.groupAccess) {
            const groupAccess = clubAccess.groupAccess.find(
              (g: any) => g.groupId === eventGroupId,
            );
            const hasGroupPermission =
              groupAccess?.roles?.includes("admin") ||
              groupAccess?.roles?.includes("coach");
            if (!hasGroupPermission) {
              throw new HttpsError(
                "permission-denied",
                "Only event creator, club admin, or group admin/coach can sync recipients",
              );
            }
          } else {
            throw new HttpsError(
              "permission-denied",
              "Only event creator, club admin, or group admin/coach can sync recipients",
            );
          }
        }
      }

      // ======================================================================
      // STEP 4: Resolve targetScope (needed by all modes)
      // ======================================================================
      const targetScope = eventData.targetScope;
      if (!targetScope) {
        throw new HttpsError(
          "failed-precondition",
          "Event has no targetScope – cannot resolve membership",
        );
      }

      // ======================================================================
      // STEP 4-M: Manual mode – admin specifies the exact recipient list
      // ======================================================================
      if (data.mode === "manual") {
        if (!data.newInvitedUserIds || !Array.isArray(data.newInvitedUserIds)) {
          throw new HttpsError(
            "invalid-argument",
            "newInvitedUserIds is required for manual mode",
          );
        }

        const desiredIds = new Set<string>(data.newInvitedUserIds);
        const existingResponses: any[] = eventData.responses || [];

        // Kept responses: members still in the desired list
        const keptResponses = existingResponses.filter((r: any) =>
          desiredIds.has(r.userId),
        );
        const keptUserIds = new Set(keptResponses.map((r: any) => r.userId));

        // Members to add: desired IDs not already in responses
        const toAddIds = data.newInvitedUserIds.filter(
          (id: string) => !keptUserIds.has(id),
        );

        // Members removed (for reporting only)
        const removedMembers: SyncMemberDiff[] = existingResponses
          .filter((r: any) => !desiredIds.has(r.userId))
          .map((r: any) => ({
            userId: r.userId,
            userName: r.userName || "Unknown",
            photoUrl: r.photoUrl || null,
          }));

        // Fetch member lookup doc for new additions
        const lookupRef = targetScope.groupId
          ? db
              .collection("clubs")
              .doc(clubId)
              .collection("groups")
              .doc(targetScope.groupId)
              .collection("allMembers")
              .doc("members")
          : db
              .collection("clubs")
              .doc(clubId)
              .collection("allMembers")
              .doc("members");

        const lookupDoc = await lookupRef.get();
        const lookupList: any[] = lookupDoc.exists
          ? lookupDoc.data()?.members || []
          : [];
        const memberDataMap = new Map<string, any>(
          lookupList.map((m: any) => [m.userId, m]),
        );

        // Fall back to user docs for members not found in members doc
        const missingIds = toAddIds.filter(
          (id: string) => !memberDataMap.has(id),
        );
        if (missingIds.length > 0) {
          const userSnaps = await Promise.all(
            missingIds.map((id: string) =>
              db.collection("users").doc(id).get(),
            ),
          );
          userSnaps.forEach((snap, idx) => {
            if (snap.exists) {
              const d = snap.data()!;
              memberDataMap.set(missingIds[idx], {
                userId: missingIds[idx],
                name: d.displayName || d.name || "Unknown",
                photoURL: d.photoURL || null,
                needsGuardian: false,
              });
            }
          });
        }

        // Build new response entries and invitedUserIds for added members
        const addedResponses: EventResponse[] = [];
        const addedInvitedIds: string[] = [];
        const addedMembers: SyncMemberDiff[] = [];

        for (const uid of toAddIds) {
          const memberData = memberDataMap.get(uid);
          if (!memberData) {
            console.warn(`⚠️ Member ${uid} not found in lookup, skipping`);
            continue;
          }

          addedMembers.push({
            userId: uid,
            userName: memberData.name || "Unknown",
            photoUrl: memberData.photoURL || null,
          });

          if (
            memberData.needsGuardian &&
            memberData.guardiansContacts?.length > 0
          ) {
            // Youth member – invite guardians
            for (const guardian of memberData.guardiansContacts) {
              if (
                guardian.guardianUid &&
                !addedInvitedIds.includes(guardian.guardianUid)
              ) {
                addedInvitedIds.push(guardian.guardianUid);
              }
            }
            addedResponses.push({
              userId: uid,
              userName: memberData.name || "Unknown",
              photoUrl: memberData.photoURL || null,
              response: "pending",
              isYouthMember: true,
              guardianIds: memberData.guardiansContacts
                .map((g: any) => g.guardianUid)
                .filter((id: string) => id),
              guardianNames: memberData.guardiansContacts
                .map((g: any) => g.guardianName || g.guardianEmail)
                .filter((n: string) => n),
            });
          } else {
            // Regular adult member
            addedInvitedIds.push(uid);
            addedResponses.push({
              userId: uid,
              userName: memberData.name || "Unknown",
              photoUrl: memberData.photoURL || null,
              response: "pending",
            });
          }
        }

        // Rebuild invitedUserIds from kept responses
        const keptInvitedIds: string[] = [];
        for (const r of keptResponses) {
          if (r.isYouthMember && r.guardianIds?.length > 0) {
            for (const gid of r.guardianIds) {
              if (!keptInvitedIds.includes(gid)) keptInvitedIds.push(gid);
            }
          } else {
            if (!keptInvitedIds.includes(r.userId))
              keptInvitedIds.push(r.userId);
          }
        }

        const finalResponses: EventResponse[] = [
          ...keptResponses,
          ...addedResponses,
        ];
        const finalInvitedIds: string[] = [
          ...new Set([...keptInvitedIds, ...addedInvitedIds]),
        ];

        // Recalculate summary helper
        const calcSummary = (responses: EventResponse[]) => {
          let accepted = 0,
            declined = 0,
            pending = 0;
          for (const r of responses) {
            const resp =
              typeof r.response === "string"
                ? r.response.toLowerCase()
                : "pending";
            if (resp === "accepted") accepted++;
            else if (resp === "declined") declined++;
            else pending++;
          }
          return {
            totalInvited: responses.length,
            accepted,
            declined,
            pending,
          };
        };

        // Determine which events to update
        const manualEventIds: string[] = [data.eventId];
        if (
          data.scope === "future" &&
          eventData.isRecurring &&
          data.recurringEventId
        ) {
          const masterRef = db
            .collection("clubs")
            .doc(clubId)
            .collection("recurringEvents")
            .doc(data.recurringEventId);
          const masterDoc = await masterRef.get();
          if (masterDoc.exists) {
            const masterData = masterDoc.data()!;
            const occurrenceEventIds: string[] =
              masterData.occurrenceEventIds || [];
            const currentOccurrenceIndex = eventData.occurrenceIndex ?? 0;
            const futureIds = occurrenceEventIds.slice(currentOccurrenceIndex);
            for (const futureId of futureIds) {
              if (futureId === data.eventId) continue;
              const futureRef = db
                .collection("clubs")
                .doc(clubId)
                .collection("events")
                .doc(futureId);
              const futureDoc = await futureRef.get();
              if (!futureDoc.exists) continue;
              const futureData = futureDoc.data()!;
              if (
                futureData.status === "cancelled" ||
                futureData.status === "completed" ||
                futureData.isModified === true
              )
                continue;
              manualEventIds.push(futureId);
            }
          }
        }

        // Apply batch updates (full replacement)
        const manualBatchSize = 450;
        for (let i = 0; i < manualEventIds.length; i += manualBatchSize) {
          const batchIds = manualEventIds.slice(i, i + manualBatchSize);
          const batch = db.batch();
          for (const eid of batchIds) {
            const ref = db
              .collection("clubs")
              .doc(clubId)
              .collection("events")
              .doc(eid);
            batch.update(ref, {
              responses: finalResponses,
              invitedUserIds: finalInvitedIds,
              responseSummary: calcSummary(finalResponses),
              updatedAt: FieldValue.serverTimestamp(),
              version: FieldValue.increment(1),
            });
          }
          await batch.commit();
        }

        // Send notifications to newly added users
        const manualEventTitle = eventData.title || "Event";
        const manualClubName = targetScope.clubName || "Club";
        await Promise.all(
          addedInvitedIds.map(async (invitedUserId: string) => {
            try {
              await createNotificationDirect(invitedUserId, {
                type: "event",
                title: `New Event: ${manualEventTitle}`,
                message: `You've been invited to ${manualEventTitle}`,
                sourceId: data.eventId,
                sourceCollection: "events",
                clubId,
                clubName: manualClubName,
                ...(targetScope.groupId && { groupId: targetScope.groupId }),
                ...(targetScope.groupName && {
                  groupName: targetScope.groupName,
                }),
                priority: "normal",
                actionUrl: `/event-details?eventId=${data.eventId}&clubId=${clubId}`,
              });
            } catch (notifError: any) {
              console.error(
                `⚠️ Failed to send notification to ${invitedUserId}:`,
                notifError.message,
              );
            }
          }),
        );

        console.log(
          `✅ Manual update complete: +${addedMembers.length} added, -${removedMembers.length} removed across ${manualEventIds.length} event(s)`,
        );

        return {
          success: true,
          added: addedMembers,
          removed: removedMembers,
          unchanged: keptResponses.length,
          updatedOccurrences:
            data.scope === "future" ? manualEventIds.length : undefined,
          message: `Updated recipients: +${addedMembers.length} added, -${removedMembers.length} removed`,
        };
      }

      // ======================================================================
      // STEP 4: Resolve current membership for preview/confirm modes
      // ======================================================================
      let membersDocRef: admin.firestore.DocumentReference;
      let shouldFilterByIsActive = true;

      if (targetScope.level === "club") {
        membersDocRef = db
          .collection("clubs")
          .doc(clubId)
          .collection("allMembers")
          .doc("members");
      } else if (targetScope.level === "group") {
        membersDocRef = db
          .collection("clubs")
          .doc(clubId)
          .collection("groups")
          .doc(targetScope.groupId!)
          .collection("allMembers")
          .doc("members");
      } else if (targetScope.level === "subgroup") {
        membersDocRef = db
          .collection("clubs")
          .doc(clubId)
          .collection("groups")
          .doc(targetScope.groupId!)
          .collection("subgroups")
          .doc(targetScope.subgroupId!)
          .collection("allMembers")
          .doc("members");
        shouldFilterByIsActive = false;
      } else {
        throw new HttpsError("invalid-argument", "Invalid target scope level");
      }

      const membersDoc = await membersDocRef.get();
      if (!membersDoc.exists) {
        throw new HttpsError(
          "failed-precondition",
          `No members document found for this ${targetScope.level}`,
        );
      }

      const membersData = membersDoc.data();
      let allMembers: any[] = membersData?.members || [];

      // Apply isActive filter
      let currentMembers = shouldFilterByIsActive
        ? allMembers.filter((m: any) => m.isActive !== false)
        : allMembers;

      // Apply role filter if the original event used one
      const roleFilter = eventData.roleFilter;
      if (roleFilter && roleFilter.length > 0) {
        currentMembers = currentMembers.filter((m: any) =>
          m.roles?.some((role: any) => roleFilter.includes(role)),
        );
      }

      // ======================================================================
      // STEP 5: Compute the diff
      // ======================================================================
      const existingResponses: any[] = eventData.responses || [];
      const existingUserIds: Set<string> = new Set(
        existingResponses.map((r: any) => r.userId),
      );

      const currentMemberIds: Set<string> = new Set(
        currentMembers.map((m: any) => m.userId),
      );

      // --- Added members (in group, not in event) ---
      const addedMembers: SyncMemberDiff[] = [];
      const addedMemberDataMap: Map<string, any> = new Map();

      for (const member of currentMembers) {
        if (!existingUserIds.has(member.userId)) {
          addedMembers.push({
            userId: member.userId,
            userName: member.name || "Unknown",
            photoUrl: member.photoURL || null,
          });
          addedMemberDataMap.set(member.userId, member);
        }
      }

      // --- Removed members (in event, not in group) ---
      // Exclude the event creator — they may be a club-admin who is not in the
      // group but was legitimately added to the event at creation time.
      const creatorId = eventData.createdBy;
      const removedMembers: SyncMemberDiff[] = [];
      for (const r of existingResponses) {
        if (!currentMemberIds.has(r.userId) && r.userId !== creatorId) {
          removedMembers.push({
            userId: r.userId,
            userName: r.userName || "Unknown",
            photoUrl: r.photoUrl || null,
          });
        }
      }

      // --- Unchanged count ---
      const unchangedCount = existingResponses.filter((r: any) =>
        currentMemberIds.has(r.userId),
      ).length;

      console.log(
        `🔄 Sync preview for event ${data.eventId}: +${addedMembers.length} added, -${removedMembers.length} removed, ${unchangedCount} unchanged`,
      );

      // ======================================================================
      // STEP 6: If preview mode, return the diff now
      // ======================================================================
      if (data.mode === "preview") {
        return {
          success: true,
          added: addedMembers,
          removed: removedMembers,
          unchanged: unchangedCount,
          message:
            addedMembers.length === 0 && removedMembers.length === 0
              ? "All members are already in sync"
              : `${addedMembers.length} new member(s) to add, ${removedMembers.length} member(s) no longer in group`,
        };
      }

      // ======================================================================
      // STEP 7: Confirm mode – build new response entries for added members
      // ======================================================================
      if (addedMembers.length === 0) {
        return {
          success: true,
          added: [],
          removed: removedMembers,
          unchanged: unchangedCount,
          message: "No new members to add",
        };
      }

      const newResponses: EventResponse[] = [];
      const newInvitedUserIds: string[] = [];

      for (const added of addedMembers) {
        const memberData = addedMemberDataMap.get(added.userId);

        if (
          memberData?.needsGuardian &&
          memberData.guardiansContacts &&
          memberData.guardiansContacts.length > 0
        ) {
          // Youth member — invite guardians
          for (const guardian of memberData.guardiansContacts) {
            if (
              guardian.guardianUid &&
              !newInvitedUserIds.includes(guardian.guardianUid) &&
              !(eventData.invitedUserIds || []).includes(guardian.guardianUid)
            ) {
              newInvitedUserIds.push(guardian.guardianUid);
            }
          }

          newResponses.push({
            userId: memberData.userId,
            userName: memberData.name || "Unknown",
            photoUrl: memberData.photoURL || null,
            response: "pending",
            isYouthMember: true,
            guardianIds: memberData.guardiansContacts
              .map((g: any) => g.guardianUid)
              .filter((id: string) => id),
            guardianNames: memberData.guardiansContacts
              .map((g: any) => g.guardianName || g.guardianEmail)
              .filter((n: string) => n),
          });
        } else {
          // Regular adult member
          newInvitedUserIds.push(memberData.userId);

          newResponses.push({
            userId: memberData.userId,
            userName: memberData.name || "Unknown",
            photoUrl: memberData.photoURL || null,
            response: "pending",
          });
        }
      }

      // ======================================================================
      // STEP 8: Determine which event documents to update
      // ======================================================================
      const eventIdsToUpdate: string[] = [data.eventId];

      if (
        data.scope === "future" &&
        eventData.isRecurring &&
        data.recurringEventId
      ) {
        // Fetch the master document
        const masterRef = db
          .collection("clubs")
          .doc(clubId)
          .collection("recurringEvents")
          .doc(data.recurringEventId);
        const masterDoc = await masterRef.get();

        if (masterDoc.exists) {
          const masterData = masterDoc.data()!;
          const occurrenceEventIds: string[] =
            masterData.occurrenceEventIds || [];
          const currentOccurrenceIndex = eventData.occurrenceIndex ?? 0;

          // Get future occurrence IDs (after and including current)
          const futureEventIds = occurrenceEventIds.slice(
            currentOccurrenceIndex,
          );

          // Filter: only include scheduled, non-cancelled, non-modified events
          for (const futureId of futureEventIds) {
            if (futureId === data.eventId) continue; // Already included
            const futureRef = db
              .collection("clubs")
              .doc(clubId)
              .collection("events")
              .doc(futureId);
            const futureDoc = await futureRef.get();
            if (!futureDoc.exists) continue;
            const futureData = futureDoc.data()!;

            // Skip cancelled, completed, or individually-modified events
            if (
              futureData.status === "cancelled" ||
              futureData.status === "completed" ||
              futureData.isModified === true
            ) {
              continue;
            }

            eventIdsToUpdate.push(futureId);
          }
        }
      }

      console.log(
        `🔄 Syncing ${newResponses.length} new members to ${eventIdsToUpdate.length} event(s)`,
      );

      // ======================================================================
      // STEP 9: Apply updates to all target event documents
      // ======================================================================
      const batchSize = 450; // Firestore batch limit safety margin
      for (let i = 0; i < eventIdsToUpdate.length; i += batchSize) {
        const batchIds = eventIdsToUpdate.slice(i, i + batchSize);
        const batch = db.batch();

        for (const eid of batchIds) {
          const ref = db
            .collection("clubs")
            .doc(clubId)
            .collection("events")
            .doc(eid);

          // Read current document to get its existing arrays
          const currentDoc = await ref.get();
          if (!currentDoc.exists) continue;
          const currentData = currentDoc.data()!;
          const currentResponses: any[] = currentData.responses || [];
          const currentInvitedIds: string[] = currentData.invitedUserIds || [];
          const currentResponseUserIds = new Set(
            currentResponses.map((r: any) => r.userId),
          );
          const currentInvitedIdSet = new Set(currentInvitedIds);

          // Only add members not already in this specific occurrence
          const responsesToAdd = newResponses.filter(
            (r) => !currentResponseUserIds.has(r.userId),
          );
          const idsToAdd = newInvitedUserIds.filter(
            (id) => !currentInvitedIdSet.has(id),
          );

          if (responsesToAdd.length === 0 && idsToAdd.length === 0) continue;

          const updatedResponses = [...currentResponses, ...responsesToAdd];
          const updatedInvitedIds = [...currentInvitedIds, ...idsToAdd];

          // Recalculate summary
          let accepted = 0,
            declined = 0,
            pending = 0;
          for (const r of updatedResponses) {
            const resp =
              typeof r.response === "string"
                ? r.response.toLowerCase()
                : "pending";
            if (resp === "accepted") accepted++;
            else if (resp === "declined") declined++;
            else pending++;
          }

          batch.update(ref, {
            responses: updatedResponses,
            invitedUserIds: updatedInvitedIds,
            responseSummary: {
              totalInvited: updatedResponses.length,
              accepted,
              declined,
              pending,
              ...(currentData.responseSummary?.attended != null && {
                attended: currentData.responseSummary.attended,
              }),
            },
            updatedAt: FieldValue.serverTimestamp(),
            version: FieldValue.increment(1),
          });
        }

        await batch.commit();
      }

      // ======================================================================
      // STEP 10: Send notifications to newly added users (first event only)
      // ======================================================================
      console.log(
        `📬 Sending notifications to ${newInvitedUserIds.length} new users...`,
      );

      const eventTitle = eventData.title || "Event";
      const clubName = targetScope.clubName || "Club";

      const notificationPromises = newInvitedUserIds.map(
        async (invitedUserId: string) => {
          try {
            await createNotificationDirect(invitedUserId, {
              type: "event",
              title: `New Event: ${eventTitle}`,
              message: `You've been invited to ${eventTitle}`,
              sourceId: data.eventId,
              sourceCollection: "events",
              clubId,
              clubName,
              ...(targetScope.groupId && { groupId: targetScope.groupId }),
              ...(targetScope.groupName && {
                groupName: targetScope.groupName,
              }),
              priority: "normal",
              actionUrl: `/event-details?eventId=${data.eventId}&clubId=${clubId}`,
            });
          } catch (notifError: any) {
            console.error(
              `⚠️ Failed to send notification to user ${invitedUserId}:`,
              notifError.message,
            );
          }
        },
      );

      await Promise.all(notificationPromises);

      console.log("✅ Sync completed successfully");

      return {
        success: true,
        added: addedMembers,
        removed: removedMembers,
        unchanged: unchangedCount,
        updatedOccurrences:
          data.scope === "future" ? eventIdsToUpdate.length : undefined,
        message: `Added ${addedMembers.length} new member(s) to ${eventIdsToUpdate.length} event(s)`,
      };
    } catch (error: any) {
      console.error("❌ Error in syncEventRecipients:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Failed to sync event recipients: ${error.message}`,
      );
    }
  },
);
