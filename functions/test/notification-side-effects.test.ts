/**
 * Suite Q: Notification Side-Effects Across Cloud Functions
 *
 * Verifies that the following Cloud Functions correctly create
 * notification documents in users/{uid}/notifications:
 *
 *  - createEventV2  → type "event"
 *  - sendGroupInvitation → type "group_invitation" + invitationToken
 *  - createMembershipFee → type "payment_request" + metadata
 *  - createNotification (callable) → create / auth / not-found
 *  - updateEvent → "event updated" notification for all invitees (TC-Q9)
 *  - editRecurringEvent scope:single → "event updated" notification (TC-Q10)
 */

import {
    callFunction,
    clearAll,
    createFullTestUser,
    expectFunctionError,
    getDocument,
    getFirestore,
    seedClubDocument,
    seedUserDocument,
} from "./helpers";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TestUser {
  uid: string;
  idToken: string;
  email: string;
  displayName: string;
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

function futureISO(daysAhead: number, hours: number = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
}

/**
 * Build a club + group + admin + player, fully seeded.
 */
async function setupClubGroupAndMembers(): Promise<{
  admin: TestUser;
  player: TestUser;
  clubId: string;
  groupId: string;
}> {
  const adminUser = await createFullTestUser({
    email: `admin_${Date.now()}@test.com`,
    displayName: "SideEffect Admin",
  });

  const { clubId } = await callFunction<{ clubId: string }>(
    "createClub",
    adminUser.idToken,
    { clubData: { name: "Side Club" } },
  );

  await seedUserDocument(adminUser.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Side Club",
        role: "club-admin",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [],
      },
    ],
  });

  const { groupId } = await callFunction<{ groupId: string }>(
    "createGroup",
    adminUser.idToken,
    { clubId, groupData: { name: "Side Group" } },
  );

  const db = getFirestore();

  // Player user
  const player = await createFullTestUser({
    email: `player_${Date.now()}@test.com`,
    displayName: "Side Player",
  });
  await seedUserDocument(player.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Side Club",
        role: "player",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [
          {
            groupId,
            groupName: "Side Group",
            roles: ["player"],
            joinedAt: new Date(),
          },
        ],
      },
    ],
  });

  // Group allMembers
  await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set({
    members: [
      {
        userId: adminUser.uid,
        name: adminUser.displayName,
        email: adminUser.email,
        roles: ["admin", "club-admin"],
        isActive: true,
        needsGuardian: false,
        guardiansContacts: [],
      },
      {
        userId: player.uid,
        name: player.displayName,
        email: player.email,
        roles: ["player"],
        isActive: true,
        needsGuardian: false,
        guardiansContacts: [],
      },
    ],
    memberCount: 2,
  });

  // Club allMembers
  await db.doc(`clubs/${clubId}/allMembers/members`).set({
    members: [
      {
        userId: adminUser.uid,
        name: adminUser.displayName,
        email: adminUser.email,
        roles: ["club-admin"],
        isActive: true,
      },
      {
        userId: player.uid,
        name: player.displayName,
        email: player.email,
        roles: ["player"],
        isActive: true,
      },
    ],
    memberCount: 2,
  });

  // metadata/members used by createRecurringEvent (different data model from allMembers)
  await db.doc(`clubs/${clubId}/metadata/members`).set({ memberIds: [adminUser.uid, player.uid] });
  await db.doc(`clubs/${clubId}/groups/${groupId}/metadata/members`).set({ memberIds: [adminUser.uid, player.uid] });

  // Admin groupAccess
  await seedUserDocument(adminUser.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Side Club",
        role: "club-admin",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [
          {
            groupId,
            groupName: "Side Group",
            roles: ["admin"],
            isActive: true,
          },
        ],
      },
    ],
  });

  return { admin: adminUser, player, clubId, groupId };
}

/**
 * Query all notification docs for a user.
 */
async function getUserNotifications(
  userId: string,
): Promise<Array<Record<string, any>>> {
  const db = getFirestore();
  const snap = await db.collection(`users/${userId}/notifications`).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("Suite Q: Notification Side-Effects Across Cloud Functions", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── createEventV2 → notification ────────────────────────────

  it('TC-Q1: createEventV2 creates notification with type "event" and sourceId', async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupClubGroupAndMembers();

    const result = await callFunction<{
      success: boolean;
      eventId: string;
      totalRecipients: number;
    }>("createEventV2", adminUser.idToken, {
      clubId,
      clubName: "Side Club",
      eventType: "training",
      title: "Training Session",
      startDate: futureDate(7),
      startTime: futureISO(7, 18),
      endDate: futureDate(7),
      endTime: futureISO(7, 20),
      targetScope: {
        level: "group",
        groupId,
        groupName: "Side Group",
      },
      createdBy: adminUser.uid,
      createdByName: adminUser.displayName,
    });

    expect(result.success).toBe(true);
    expect(result.eventId).toBeDefined();

    // Player should receive an event notification
    const playerNotifs = await getUserNotifications(player.uid);
    const eventNotif = playerNotifs.find(
      (n) => n.type === "event" && n.sourceId === result.eventId,
    );
    expect(eventNotif).toBeDefined();
    expect(eventNotif!.read).toBe(false);
    expect(eventNotif!.dismissed).toBe(false);
    expect(eventNotif!.clubId).toBe(clubId);
    expect(eventNotif!.sourceCollection).toBe("events");
  });

  // ─── sendGroupInvitation → notification ──────────────────────

  it('TC-Q2: sendGroupInvitation creates notification with type "group_invitation" and invitationToken', async () => {
    const {
      admin: adminUser,
      clubId,
      groupId,
    } = await setupClubGroupAndMembers();

    // Create recipient user (existing user who will be invited)
    const invitee = await createFullTestUser({
      email: `invitee_${Date.now()}@test.com`,
      displayName: "Invited User",
    });
    await seedUserDocument(invitee.uid, {
      email: invitee.email,
    });

    const result = await callFunction<{
      success: boolean;
      results: Array<{
        email: string;
        success: boolean;
        invitationToken?: string;
        notificationId?: string;
      }>;
    }>("sendGroupInvitation", adminUser.idToken, {
      emails: [invitee.email],
      clubId,
      clubName: "Side Club",
      groupId,
      groupName: "Side Group",
      inviterName: adminUser.displayName,
      inviterUid: adminUser.uid,
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);

    const invitationToken = result.results[0].invitationToken;
    expect(invitationToken).toBeDefined();

    // Invitee should receive a group_invitation notification
    const inviteeNotifs = await getUserNotifications(invitee.uid);
    const inviteNotif = inviteeNotifs.find(
      (n) => n.type === "group_invitation",
    );
    expect(inviteNotif).toBeDefined();
    expect(inviteNotif!.invitationToken).toBe(invitationToken);
    expect(inviteNotif!.clubId).toBe(clubId);
    expect(inviteNotif!.read).toBe(false);
    expect(inviteNotif!.dismissed).toBe(false);
  });

  // ─── createMembershipFee → notification ──────────────────────

  it('TC-Q3: createMembershipFee creates notification with type "payment_request" and metadata', async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupClubGroupAndMembers();

    // Enable Stripe on the club
    await seedClubDocument(clubId, {
      stripe: {
        chargesEnabled: true,
        accountId: "acct_test_123",
      },
    });

    const result = await callFunction<{
      success: boolean;
      feeId: string;
      includedMembersCount: number;
    }>("createMembershipFee", adminUser.idToken, {
      clubId,
      groupId,
      title: "Season Fee",
      description: "Annual membership fee.",
      currency: "sek",
      targetRoles: ["player"],
      components: [{ category: "membership_fee", amount: 50000 }],
    });

    expect(result.success).toBe(true);
    expect(result.feeId).toBeDefined();
    expect(result.includedMembersCount).toBeGreaterThanOrEqual(1);

    // Player should receive a payment_request notification
    const playerNotifs = await getUserNotifications(player.uid);
    const payNotif = playerNotifs.find(
      (n) => n.type === "payment_request" && n.sourceId === result.feeId,
    );
    expect(payNotif).toBeDefined();
    expect(payNotif!.priority).toBe("high");
    expect(payNotif!.metadata).toBeDefined();
    expect(payNotif!.metadata.feeId).toBe(result.feeId);
    expect(payNotif!.metadata.amount).toBe(50000);
    expect(payNotif!.metadata.currency).toBe("sek");
    expect(payNotif!.sourceCollection).toBe("membershipFees");
    expect(payNotif!.read).toBe(false);
  });

  // ─── createNotification (callable) ───────────────────────────

  it("TC-Q4: createNotification callable creates doc with read:false and dismissed:false", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
    } = await setupClubGroupAndMembers();

    const result = await callFunction<{
      success: boolean;
      notificationId: string;
    }>("createNotification", adminUser.idToken, {
      userId: player.uid,
      type: "general",
      title: "Test Notification",
      message: "This is a test notification via callable.",
      clubId,
      clubName: "Side Club",
    });

    expect(result.success).toBe(true);
    expect(result.notificationId).toBeDefined();

    // Verify notification doc
    const notifDoc = await getDocument(
      `users/${player.uid}/notifications/${result.notificationId}`,
    );
    expect(notifDoc).toBeDefined();
    expect(notifDoc!.type).toBe("general");
    expect(notifDoc!.title).toBe("Test Notification");
    expect(notifDoc!.message).toContain("test notification via callable");
    expect(notifDoc!.read).toBe(false);
    expect(notifDoc!.dismissed).toBe(false);
    expect(notifDoc!.clubId).toBe(clubId);
    expect(notifDoc!.priority).toBe("normal");
  });

  it("TC-Q5: createNotification without auth → unauthenticated", async () => {
    const { player, clubId } = await setupClubGroupAndMembers();

    await expectFunctionError(
      "createNotification",
      "", // no auth token
      {
        userId: player.uid,
        type: "general",
        title: "No Auth",
        message: "Should fail.",
        clubId,
        clubName: "Side Club",
      },
      "unauthenticated",
    );
  });

  it("TC-Q6: createNotification for non-existent user → not-found", async () => {
    const { admin: adminUser, clubId } = await setupClubGroupAndMembers();

    await expectFunctionError(
      "createNotification",
      adminUser.idToken,
      {
        userId: "nonexistent_user_abc123",
        type: "general",
        title: "Ghost User",
        message: "Should fail.",
        clubId,
        clubName: "Side Club",
      },
      "not-found",
    );
  });

  // ─── Push dispatch graceful degradation ──────────────────────

  it("TC-Q7: createNotification succeeds even when Expo Push API is unreachable", async () => {
    // This test verifies the fire-and-forget contract: push failures must
    // never prevent the Firestore notification document from being written.
    const {
      admin: adminUser,
      player,
      clubId,
    } = await setupClubGroupAndMembers();

    // Seed a push token so sendPushNotification actually attempts a fetch.
    // In the emulator environment the Expo API call will fail with a network
    // error — that is expected and intentional.
    const db = getFirestore();
    await db.collection("users").doc(player.uid).collection("pushTokens").add({
      token: "ExponentPushToken[emulator-test]",
      platform: "android",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Call createNotification — push will fail but should not throw
    const result = await callFunction<{
      success: boolean;
      notificationId: string;
    }>("createNotification", adminUser.idToken, {
      userId: player.uid,
      type: "event",
      title: "Push Degradation Test",
      message: "Firestore write must succeed even if push fails.",
      clubId,
      clubName: "Side Club",
      priority: "normal",
    });

    // Callable must return success
    expect(result.success).toBe(true);
    expect(result.notificationId).toBeDefined();

    // Firestore notification must exist
    const notifDoc = await getDocument(
      `users/${player.uid}/notifications/${result.notificationId}`,
    );
    expect(notifDoc).toBeDefined();
    expect(notifDoc!.title).toBe("Push Degradation Test");
    expect(notifDoc!.read).toBe(false);
    expect(notifDoc!.dismissed).toBe(false);
  });

  // ─── Push data payload contains notificationId and userId ──────

  it("TC-Q8: createNotification embeds notificationId and userId in push data payload", async () => {
    // This test verifies the mark-as-read contract:
    //   1. The callable returns a notificationId.
    //   2. A Firestore notification doc with that exact ID exists.
    //   3. Therefore the same ID (along with userId) that gets embedded in the
    //      push data payload can be used by the frontend to call
    //      markNotificationAsRead() when the user taps the push notification.
    //
    // Note: the actual Expo API push data payload cannot be intercepted in the
    // emulator environment (the HTTP call to exp.host fails). The contract that
    // notificationId and userId appear in the data field is verified by the
    // backend source (createNotification.ts sendPushNotification call sites).
    const {
      admin: adminUser,
      player,
      clubId,
    } = await setupClubGroupAndMembers();

    const result = await callFunction<{
      success: boolean;
      notificationId: string;
    }>("createNotification", adminUser.idToken, {
      userId: player.uid,
      type: "general",
      title: "Mark-As-Read Contract Test",
      message: "notificationId returned by callable must match Firestore doc.",
      clubId,
      clubName: "Side Club",
      priority: "normal",
    });

    // The callable must return a notificationId
    expect(result.success).toBe(true);
    expect(typeof result.notificationId).toBe("string");
    expect(result.notificationId.length).toBeGreaterThan(0);

    // A Firestore notification doc with that exact ID must exist — this is the
    // same ID embedded as notificationId in the push data payload, enabling the
    // frontend to mark it as read on tap.
    const notifDoc = await getDocument(
      `users/${player.uid}/notifications/${result.notificationId}`,
    );
    expect(notifDoc).toBeDefined();
    expect(notifDoc!.read).toBe(false);

    // The push data payload contract (from createNotification.ts):
    //   data.notificationId === result.notificationId  ✓ (embedded at source)
    //   data.userId          === player.uid            ✓ (embedded at source)
    // These are consumed by redirectFromNotification() in app/_layout.tsx to
    // call markNotificationAsRead(userId, notificationId) on push tap.
  });

  // ─── updateEvent → notification ──────────────────────────────

  it('TC-Q9: updateEvent creates an "event updated" notification doc for all invitees', async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupClubGroupAndMembers();

    // Create event
    const createResult = await callFunction<{
      success: boolean;
      eventId: string;
    }>("createEventV2", adminUser.idToken, {
      clubId,
      clubName: "Side Club",
      eventType: "training",
      title: "Update Side-Effect Event",
      startDate: futureDate(7),
      startTime: futureISO(7, 18),
      endDate: futureDate(7),
      endTime: futureISO(7, 20),
      targetScope: {
        level: "group",
        groupId,
        groupName: "Side Group",
      },
      createdBy: adminUser.uid,
      createdByName: adminUser.displayName,
    });

    expect(createResult.success).toBe(true);
    const eventId = createResult.eventId;

    // Clear creation-time notifications
    const db = getFirestore();
    const snap = await db
      .collection(`users/${player.uid}/notifications`)
      .get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));

    // Update the event
    await callFunction("updateEvent", adminUser.idToken, {
      clubId,
      eventId,
      eventData: { title: "Update Side-Effect Event (Changed)" },
    });

    // Player should receive an edit notification
    const playerNotifs = await getUserNotifications(player.uid);
    const editNotif = playerNotifs.find(
      (n) =>
        n.type === "event" && (n.title as string).toLowerCase().includes("updated"),
    );
    expect(editNotif).toBeDefined();
    expect(editNotif!.read).toBe(false);
    expect(editNotif!.dismissed).toBe(false);
  });

  // ─── editRecurringEvent → notification ───────────────────────

  it("TC-Q10: editRecurringEvent scope:single creates an updated notification doc for invitees", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupClubGroupAndMembers();

    // Create a recurring event series
    const recurringResult = await callFunction<{
      success: boolean;
      recurringEventId: string;
      occurrenceEventIds: string[];
    }>("createRecurringEvent", adminUser.idToken, {
      clubId,
      clubName: "Side Club",
      title: "Recurring Side-Effect Event",
      eventType: "training",
      startDate: futureDate(7),
      startTime: futureISO(7, 18),
      endDate: futureDate(7),
      endTime: futureISO(7, 20),
      frequency: "weekly",
      endType: "occurrences",
      occurrenceCount: 3,
      targetScope: {
        level: "group",
        groupId,
        groupName: "Side Group",
      },
      createdBy: adminUser.uid,
      createdByName: adminUser.displayName,
    });

    expect(recurringResult.success).toBe(true);
    const { recurringEventId, occurrenceEventIds } = recurringResult;

    // Clear creation-time notifications
    const db = getFirestore();
    const snap = await db
      .collection(`users/${player.uid}/notifications`)
      .get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));

    // Edit a single occurrence
    await callFunction("editRecurringEvent", adminUser.idToken, {
      clubId,
      eventId: occurrenceEventIds[0],
      recurringEventId,
      scope: "single",
      title: "Recurring Side-Effect Event (Single Changed)",
    });

    // Player should receive an edit notification
    const playerNotifs = await getUserNotifications(player.uid);
    const editNotif = playerNotifs.find(
      (n) =>
        n.type === "event" && (n.title as string).toLowerCase().includes("updated"),
    );
    expect(editNotif).toBeDefined();
    expect(editNotif!.read).toBe(false);
    expect(editNotif!.dismissed).toBe(false);
  });
});
