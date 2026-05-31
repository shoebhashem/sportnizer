/**
 * Suite S: Event Notification System
 *
 * Tests for:
 *  - notificationHelpers.ts — buildPendingNotificationJobs (pending-gate, guardian mapping)
 *  - createEventV2   — notification sent to pending invitees at creation
 *  - updateEvent     — "event updated" notification sent to all invitees after edit
 *  - createRecurringEvent — notification sent to pending invitees at creation
 *  - editRecurringEvent   — "event updated" notification after scope:single and scope:future edits
 *  - sendDailyEventNotifications — 24h reminder, deadline nudge, idempotency, window boundary
 *
 * S1  buildPendingNotificationJobs — adult pending → 1 job
 * S2  buildPendingNotificationJobs — adult accepted → 0 jobs (pending-gate)
 * S3  buildPendingNotificationJobs — adult declined → 0 jobs (pending-gate)
 * S4  buildPendingNotificationJobs — youth pending, 2 guardians → 2 jobs
 * S5  buildPendingNotificationJobs — youth declined → 0 jobs
 * S6  buildPendingNotificationJobs — mixed list (2 pending, 1 accepted) → 2 jobs
 * S7  buildPendingNotificationJobs — recurring opts → message contains series info
 * S8  createEventV2 — notification document created for pending invitee
 * S9  updateEvent — notification document created for all invitees after edit
 * S10 createRecurringEvent — notification document created for pending invitee
 * S11 editRecurringEvent (scope:single) — notification sent to invitees
 * S12 editRecurringEvent (scope:future) — notification sent to invitees
 * S13 sendDailyEventNotifications — event starting within 25h, pending → notified, notificationSentAt set
 * S14 sendDailyEventNotifications — event starting within 25h, all accepted → no notifications, guard still set
 * S15 sendDailyEventNotifications — event with notificationSentAt already set → skipped (idempotency)
 * S16 sendDailyEventNotifications — event starting in 48h → not notified
 * S17 sendDailyEventNotifications — responseDeadline within 25h → deadline nudge sent, deadlineReminderSentAt set
 * S18 sendDailyEventNotifications — deadlineReminderSentAt already set → skipped (idempotency)
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import {
  buildAllInviteesNotificationJobs,
  buildPendingNotificationJobs,
} from "../src/utils/notificationHelpers";
import { sendDailyEventNotifications } from "../src/scheduled/sendDailyEventNotifications";
import {
  callFunction,
  clearAll,
  createFullTestUser,
  getDocument,
  getFirestore,
  seedUserDocument,
} from "./helpers";

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function futureISO(daysAhead: number, hours = 18): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
}

function pastISO(daysBack: number, hours = 18): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
}

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Shared full club/group/admin setup (mirrors events.test.ts pattern)
// ---------------------------------------------------------------------------

async function setupClubGroupAndAdmin() {
  const admin = await createFullTestUser({ displayName: "NotifSuite Admin" });

  const { clubId } = await callFunction("createClub", admin.idToken, {
    clubData: { name: `NotifClub ${Date.now()}` },
  });

  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "NotifClub",
        role: "club-admin",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [],
      },
    ],
  });

  const { groupId } = await callFunction("createGroup", admin.idToken, {
    clubId,
    groupData: { name: "Notif Group" },
  });

  const db = getFirestore();

  await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set({
    members: [
      {
        userId: admin.uid,
        name: admin.displayName,
        email: admin.email,
        roles: ["admin"],
        isActive: true,
        needsGuardian: false,
        guardiansContacts: [],
      },
    ],
    memberCount: 1,
  });

  await db.doc(`clubs/${clubId}/allMembers/members`).set({
    members: [
      {
        userId: admin.uid,
        name: admin.displayName,
        email: admin.email,
        roles: ["club-admin"],
        isActive: true,
      },
    ],
    memberCount: 1,
  });

  // metadata/members used by createRecurringEvent (different data model from allMembers)
  await db.doc(`clubs/${clubId}/metadata/members`).set({ memberIds: [admin.uid] });
  await db.doc(`clubs/${clubId}/groups/${groupId}/metadata/members`).set({ memberIds: [admin.uid] });

  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "NotifClub",
        role: "club-admin",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [
          {
            groupId,
            groupName: "Notif Group",
            roles: ["admin"],
            isActive: true,
          },
        ],
      },
    ],
  });

  return { admin, clubId, groupId };
}

async function setupClubGroupAndAdminWithPlayer() {
  const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
  const db = getFirestore();

  const player = await createFullTestUser({
    displayName: "Notif Player",
    email: `player_notif_${Date.now()}@test.com`,
  });

  await seedUserDocument(player.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "NotifClub",
        role: "player",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [
          {
            groupId,
            groupName: "Notif Group",
            roles: ["player"],
            isActive: true,
          },
        ],
      },
    ],
  });

  // Add player to group allMembers
  const membersRef = db.doc(
    `clubs/${clubId}/groups/${groupId}/allMembers/members`,
  );
  const snap = await membersRef.get();
  const existing = snap.data()?.members || [];
  await membersRef.set({
    members: [
      ...existing,
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
    memberCount: existing.length + 1,
  });

  // Update metadata/members to include the player (for createRecurringEvent)
  await db.doc(`clubs/${clubId}/metadata/members`).set({ memberIds: [admin.uid, player.uid] });
  await db.doc(`clubs/${clubId}/groups/${groupId}/metadata/members`).set({ memberIds: [admin.uid, player.uid] });

  return { admin, player, clubId, groupId };
}

// ---------------------------------------------------------------------------
// Helper to get notification docs for a user
// ---------------------------------------------------------------------------

async function getNotificationsForUser(userId: string) {
  const db = getFirestore();
  const snap = await db
    .collection("users")
    .doc(userId)
    .collection("notifications")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// Seed a raw event document directly (bypasses Cloud Functions, for scheduler tests)
// ---------------------------------------------------------------------------

async function seedEventDocument(
  clubId: string,
  eventData: Record<string, any>,
): Promise<string> {
  const db = getFirestore();
  const { Timestamp } = await import("firebase-admin/firestore");
  const ref = await db.collection(`clubs/${clubId}/events`).add({
    status: "scheduled",
    isActive: true,
    version: 1,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...eventData,
  });
  return ref.id;
}

// ===========================================================================
// Before / After
// ===========================================================================

beforeAll(async () => {
  // nothing — helpers handle emulator connection
});

afterAll(async () => {
  await clearAll();
});

beforeEach(async () => {
  await clearAll();
});

// ===========================================================================
// Suite S: Unit tests for notificationHelpers (no Firebase needed)
// ===========================================================================

describe("Suite S: notificationHelpers — buildPendingNotificationJobs", () => {
  // S1
  it("S1: adult member with response=pending → 1 job targeting themselves", () => {
    const jobs = buildPendingNotificationJobs(
      [
        {
          userId: "uid_adult",
          userName: "Alice",
          response: "pending",
        },
      ],
      "Training",
      "01/01/2027",
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0].targetUserId).toBe("uid_adult");
    expect(jobs[0].inviteeUserId).toBe("uid_adult");
    expect(jobs[0].message).toContain("Training");
  });

  // S2
  it("S2: adult member with response=Accepted → 0 jobs (pending-gate)", () => {
    const jobs = buildPendingNotificationJobs(
      [{ userId: "uid_accepted", userName: "Bob", response: "Accepted" }],
      "Match",
      "01/01/2027",
    );

    expect(jobs).toHaveLength(0);
  });

  // S3
  it("S3: adult member with response=declined → 0 jobs (pending-gate)", () => {
    const jobs = buildPendingNotificationJobs(
      [{ userId: "uid_declined", userName: "Carol", response: "declined" }],
      "Match",
      "01/01/2027",
    );

    expect(jobs).toHaveLength(0);
  });

  // S4
  it("S4: youth member with response=pending and 2 guardians → 2 jobs targeting guardians", () => {
    const jobs = buildPendingNotificationJobs(
      [
        {
          userId: "uid_youth",
          userName: "Young Dave",
          response: "pending",
          isYouthMember: true,
          guardianIds: ["guardian_1", "guardian_2"],
          guardianNames: ["Parent A", "Parent B"],
        },
      ],
      "Practice",
      "01/01/2027",
    );

    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.targetUserId)).toEqual(
      expect.arrayContaining(["guardian_1", "guardian_2"]),
    );
    // inviteeUserId should be the youth's UID, not the guardian's
    expect(jobs[0].inviteeUserId).toBe("uid_youth");
    expect(jobs[1].inviteeUserId).toBe("uid_youth");
    expect(jobs[0].message).toContain("Young Dave");
  });

  // S5
  it("S5: youth member with response=declined → 0 jobs (pending-gate respected for youth too)", () => {
    const jobs = buildPendingNotificationJobs(
      [
        {
          userId: "uid_youth",
          userName: "Young Eve",
          response: "declined",
          isYouthMember: true,
          guardianIds: ["guardian_3"],
        },
      ],
      "Cup",
      "01/01/2027",
    );

    expect(jobs).toHaveLength(0);
  });

  // S6
  it("S6: mixed list with 2 pending and 1 accepted → 2 jobs", () => {
    const jobs = buildPendingNotificationJobs(
      [
        { userId: "u1", userName: "P1", response: "pending" },
        { userId: "u2", userName: "P2", response: "Accepted" },
        { userId: "u3", userName: "P3", response: "pending" },
      ],
      "Meeting",
      "01/01/2027",
    );

    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.targetUserId)).toEqual(
      expect.arrayContaining(["u1", "u3"]),
    );
  });

  // S7
  it("S7: recurring opts → message contains frequency and occurrence count", () => {
    const jobs = buildPendingNotificationJobs(
      [{ userId: "uid_r", userName: "Rita", response: "pending" }],
      "Weekly Training",
      "01/06/2027",
      { isRecurring: true, occurrenceCount: 12, frequency: "weekly" },
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0].message).toContain("weekly");
    expect(jobs[0].message).toContain("12");
    expect(jobs[0].message).toContain("Weekly Training");
  });
});

describe("Suite S: notificationHelpers — buildAllInviteesNotificationJobs", () => {
  it("S7b: buildAllInviteesNotificationJobs — accepted member receives job (no pending-gate)", () => {
    const jobs = buildAllInviteesNotificationJobs(
      [{ userId: "uid_acc", userName: "Sam", response: "Accepted" }],
      "Match Day",
      "01/01/2027",
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0].targetUserId).toBe("uid_acc");
    expect(jobs[0].message).toContain("Match Day");
  });

  it("S7c: buildAllInviteesNotificationJobs — youth member, accepted → guardian job created", () => {
    const jobs = buildAllInviteesNotificationJobs(
      [
        {
          userId: "youth_uid",
          userName: "Young Sam",
          response: "Accepted",
          isYouthMember: true,
          guardianIds: ["guardian_x"],
        },
      ],
      "Cup Final",
      "01/01/2027",
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0].targetUserId).toBe("guardian_x");
    expect(jobs[0].inviteeUserId).toBe("youth_uid");
  });
});

// ===========================================================================
// Integration tests — Cloud Functions
// ===========================================================================

describe("Suite S: createEventV2 — notifications", () => {
  // S8
  it("S8: pending invitee receives a notification document when event is created", async () => {
    const { admin, player, clubId, groupId } =
      await setupClubGroupAndAdminWithPlayer();

    const result = await callFunction("createEventV2", admin.idToken, {
      clubId,
      clubName: "NotifClub",
      title: "Notification Test Event",
      eventType: "training",
      startDate: futureISO(2),
      startTime: futureISO(2, 18),
      endDate: futureISO(2),
      endTime: futureISO(2, 19),
      targetScope: { level: "group", groupId, groupName: "Notif Group" },
      createdBy: admin.uid,
      createdByName: admin.displayName,
    });

    expect(result.success).toBe(true);

    // Player should have received a notification
    const notifications = await getNotificationsForUser(player.uid);
    const eventNotif = notifications.find((n: any) => n.type === "event");

    expect(eventNotif).toBeDefined();
    expect((eventNotif as any).title).toContain("Notification Test Event");
    expect((eventNotif as any).read).toBe(false);
  });
});

describe("Suite S: updateEvent — edit notifications", () => {
  // S9
  it("S9: all invitees (including accepted) receive a notification when event is updated", async () => {
    const { admin, player, clubId, groupId } =
      await setupClubGroupAndAdminWithPlayer();

    // Create event
    const createResult: any = await callFunction(
      "createEventV2",
      admin.idToken,
      {
        clubId,
        clubName: "NotifClub",
        title: "Update Notif Event",
        eventType: "training",
        startDate: futureISO(3),
        startTime: futureISO(3, 18),
        endDate: futureISO(3),
        endTime: futureISO(3, 19),
        targetScope: { level: "group", groupId, groupName: "Notif Group" },
        createdBy: admin.uid,
        createdByName: admin.displayName,
      },
    );

    const eventId = createResult.eventId;

    // Manually mark player as Accepted (so we can verify edit notif ignores pending-gate)
    const db = getFirestore();
    const eventRef = db.doc(`clubs/${clubId}/events/${eventId}`);
    const eventSnap = await eventRef.get();
    const responses = eventSnap.data()?.responses ?? [];
    const updatedResponses = responses.map((r: any) =>
      r.userId === player.uid ? { ...r, response: "Accepted" } : r,
    );
    await eventRef.update({ responses: updatedResponses });

    // Clear existing notifications so we can check only the edit one
    const notifRef = db
      .collection("users")
      .doc(player.uid)
      .collection("notifications");
    const existingSnap = await notifRef.get();
    await Promise.all(existingSnap.docs.map((d) => d.ref.delete()));

    // Update the event
    await callFunction("updateEvent", admin.idToken, {
      clubId,
      eventId,
      eventData: { title: "Update Notif Event (Rescheduled)" },
    });

    // Even though player accepted, they should still receive an edit notification
    const notifications = await getNotificationsForUser(player.uid);
    const editNotif = notifications.find(
      (n: any) =>
        n.type === "event" &&
        (n.title as string).toLowerCase().includes("updated"),
    );

    expect(editNotif).toBeDefined();
  });
});

describe("Suite S: createRecurringEvent — notifications", () => {
  // S10
  it("S10: pending invitee receives a notification when recurring event is created", async () => {
    const { admin, player, clubId, groupId } =
      await setupClubGroupAndAdminWithPlayer();

    const result: any = await callFunction(
      "createRecurringEvent",
      admin.idToken,
      {
        clubId,
        clubName: "NotifClub",
        title: "Weekly Training Recurring",
        eventType: "training",
        startDate: futureISO(7),
        startTime: futureISO(7, 18),
        endDate: futureISO(7),
        endTime: futureISO(7, 19),
        frequency: "weekly",
        endType: "occurrences",
        occurrenceCount: 4,
        targetScope: { level: "group", groupId, groupName: "Notif Group" },
        createdBy: admin.uid,
        createdByName: admin.displayName,
      },
    );

    expect(result.success).toBe(true);

    // Player should have received a notification
    const notifications = await getNotificationsForUser(player.uid);
    const eventNotif = notifications.find((n: any) => n.type === "event");

    expect(eventNotif).toBeDefined();
    expect((eventNotif as any).title).toContain("Weekly Training Recurring");
  });
});

describe("Suite S: editRecurringEvent — edit notifications", () => {
  async function createRecurringAndGetIds(
    adminToken: string,
    adminUid: string,
    clubId: string,
    groupId: string,
    adminDisplayName: string,
  ) {
    const result: any = await callFunction(
      "createRecurringEvent",
      adminToken,
      {
        clubId,
        clubName: "NotifClub",
        title: "Recurring Edit Test",
        eventType: "training",
        startDate: futureISO(7),
        startTime: futureISO(7, 18),
        endDate: futureISO(7),
        endTime: futureISO(7, 19),
        frequency: "weekly",
        endType: "occurrences",
        occurrenceCount: 3,
        targetScope: { level: "group", groupId, groupName: "Notif Group" },
        createdBy: adminUid,
        createdByName: adminDisplayName,
      },
    );
    return {
      recurringEventId: result.recurringEventId,
      occurrenceEventIds: result.occurrenceEventIds,
    };
  }

  // S11
  it("S11: editRecurringEvent scope:single — notification sent to invitees", async () => {
    const { admin, player, clubId, groupId } =
      await setupClubGroupAndAdminWithPlayer();

    const { recurringEventId, occurrenceEventIds } =
      await createRecurringAndGetIds(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
        admin.displayName,
      );

    // Clear any creation notifications
    const db = getFirestore();
    const notifRef = db
      .collection("users")
      .doc(player.uid)
      .collection("notifications");
    const existing = await notifRef.get();
    await Promise.all(existing.docs.map((d) => d.ref.delete()));

    // Edit single occurrence
    await callFunction("editRecurringEvent", admin.idToken, {
      clubId,
      eventId: occurrenceEventIds[0],
      recurringEventId,
      scope: "single",
      title: "Recurring Edit Test (Single Changed)",
    });

    const notifications = await getNotificationsForUser(player.uid);
    const editNotif = notifications.find(
      (n: any) =>
        n.type === "event" &&
        (n.title as string).toLowerCase().includes("updated"),
    );

    expect(editNotif).toBeDefined();
  });

  // S12
  it("S12: editRecurringEvent scope:future — notification sent to invitees", async () => {
    const { admin, player, clubId, groupId } =
      await setupClubGroupAndAdminWithPlayer();

    const { recurringEventId, occurrenceEventIds } =
      await createRecurringAndGetIds(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
        admin.displayName,
      );

    // Clear creation notifications
    const db = getFirestore();
    const notifRef = db
      .collection("users")
      .doc(player.uid)
      .collection("notifications");
    const existing = await notifRef.get();
    await Promise.all(existing.docs.map((d) => d.ref.delete()));

    await callFunction("editRecurringEvent", admin.idToken, {
      clubId,
      eventId: occurrenceEventIds[0],
      recurringEventId,
      scope: "future",
      title: "Recurring Edit Test (Future Changed)",
    });

    const notifications = await getNotificationsForUser(player.uid);
    const editNotif = notifications.find(
      (n: any) =>
        n.type === "event" &&
        (n.title as string).toLowerCase().includes("updated"),
    );

    expect(editNotif).toBeDefined();
  });
});

// ===========================================================================
// Suite S: sendDailyEventNotifications — scheduler tests
// ===========================================================================

describe("Suite S: sendDailyEventNotifications — scheduler", () => {
  const { Timestamp } = require("firebase-admin/firestore");

  // S13
  it("S13: event starting within 25h with pending invitee → reminder sent, notificationSentAt written", async () => {
    const { admin, player, clubId } = await setupClubGroupAndAdminWithPlayer();

    // Seed event starting in 4 hours
    const startDate = hoursFromNow(4);
    const eventId = await seedEventDocument(clubId, {
      title: "Upcoming Event",
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(new Date(startDate.getTime() + 3600000)),
      targetScope: { level: "club", clubId, clubName: "NotifClub" },
      invitedUserIds: [admin.uid, player.uid],
      responses: [
        {
          userId: admin.uid,
          userName: admin.displayName,
          response: "pending",
        },
        {
          userId: player.uid,
          userName: player.displayName,
          response: "pending",
        },
      ],
      responseSummary: { totalInvited: 2, accepted: 0, declined: 0, pending: 2 },
    });

    // Run the scheduler
    await (sendDailyEventNotifications as any).run();

    // Both users should have reminder notifications
    const adminNotifs = await getNotificationsForUser(admin.uid);
    expect(
      adminNotifs.some(
        (n: any) =>
          n.type === "event" &&
          (n.title as string).toLowerCase().includes("reminder"),
      ),
    ).toBe(true);

    const playerNotifs = await getNotificationsForUser(player.uid);
    expect(
      playerNotifs.some(
        (n: any) =>
          n.type === "event" &&
          (n.title as string).toLowerCase().includes("reminder"),
      ),
    ).toBe(true);

    // notificationSentAt must be written on the event document
    const db = getFirestore();
    const eventSnap = await db.doc(`clubs/${clubId}/events/${eventId}`).get();
    expect(eventSnap.data()?.notificationSentAt).toBeDefined();
  });

  // S14
  it("S14: event within 25h but all invitees accepted → no notification docs, notificationSentAt still written", async () => {
    const { admin, clubId } = await setupClubGroupAndAdmin();

    const startDate = hoursFromNow(6);
    const eventId = await seedEventDocument(clubId, {
      title: "Already RSVP Event",
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(new Date(startDate.getTime() + 3600000)),
      targetScope: { level: "club", clubId, clubName: "NotifClub" },
      invitedUserIds: [admin.uid],
      responses: [
        { userId: admin.uid, userName: admin.displayName, response: "Accepted" },
      ],
      responseSummary: { totalInvited: 1, accepted: 1, declined: 0, pending: 0 },
    });

    await (sendDailyEventNotifications as any).run();

    const notifications = await getNotificationsForUser(admin.uid);
    expect(
      notifications.some(
        (n: any) =>
          n.type === "event" &&
          (n.title as string).toLowerCase().includes("reminder"),
      ),
    ).toBe(false);

    // idempotency guard must still be written
    const db = getFirestore();
    const eventSnap = await db.doc(`clubs/${clubId}/events/${eventId}`).get();
    expect(eventSnap.data()?.notificationSentAt).toBeDefined();
  });

  // S15
  it("S15: notificationSentAt already set → event is skipped (idempotency)", async () => {
    const { admin, player, clubId } = await setupClubGroupAndAdminWithPlayer();

    const startDate = hoursFromNow(3);
    const eventId = await seedEventDocument(clubId, {
      title: "Already Notified Event",
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(new Date(startDate.getTime() + 3600000)),
      targetScope: { level: "club", clubId, clubName: "NotifClub" },
      invitedUserIds: [player.uid],
      responses: [
        { userId: player.uid, userName: player.displayName, response: "pending" },
      ],
      responseSummary: { totalInvited: 1, accepted: 0, declined: 0, pending: 1 },
      // Pre-set the idempotency guard
      notificationSentAt: Timestamp.now(),
    });

    await (sendDailyEventNotifications as any).run();

    // No reminder notification should have been created
    const notifications = await getNotificationsForUser(player.uid);
    expect(
      notifications.some(
        (n: any) =>
          n.type === "event" &&
          (n.title as string).toLowerCase().includes("reminder"),
      ),
    ).toBe(false);
  });

  // S16
  it("S16: event starting in 48h → not within window, no notification sent", async () => {
    const { admin, player, clubId } = await setupClubGroupAndAdminWithPlayer();

    const startDate = hoursFromNow(48);
    await seedEventDocument(clubId, {
      title: "Far Future Event",
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(new Date(startDate.getTime() + 3600000)),
      targetScope: { level: "club", clubId, clubName: "NotifClub" },
      invitedUserIds: [player.uid],
      responses: [
        { userId: player.uid, userName: player.displayName, response: "pending" },
      ],
      responseSummary: { totalInvited: 1, accepted: 0, declined: 0, pending: 1 },
    });

    await (sendDailyEventNotifications as any).run();

    const notifications = await getNotificationsForUser(player.uid);
    expect(
      notifications.some(
        (n: any) =>
          n.type === "event" &&
          (n.title as string).toLowerCase().includes("reminder"),
      ),
    ).toBe(false);
  });

  // S17
  it("S17: responseDeadline within 25h, pending invitee → deadline nudge sent, deadlineReminderSentAt written", async () => {
    const { admin, player, clubId } = await setupClubGroupAndAdminWithPlayer();

    // Start date is 3 days from now; deadline is in 3 hours
    const startDate = hoursFromNow(72);
    const deadline = hoursFromNow(3);

    const eventId = await seedEventDocument(clubId, {
      title: "RSVP Deadline Event",
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(new Date(startDate.getTime() + 3600000)),
      responseDeadline: Timestamp.fromDate(deadline),
      targetScope: { level: "club", clubId, clubName: "NotifClub" },
      invitedUserIds: [player.uid],
      responses: [
        { userId: player.uid, userName: player.displayName, response: "pending" },
      ],
      responseSummary: { totalInvited: 1, accepted: 0, declined: 0, pending: 1 },
    });

    await (sendDailyEventNotifications as any).run();

    // Deadline nudge notification should exist
    const notifications = await getNotificationsForUser(player.uid);
    expect(
      notifications.some(
        (n: any) =>
          n.type === "event" &&
          (n.title as string).toLowerCase().includes("rsvp"),
      ),
    ).toBe(true);

    // deadlineReminderSentAt must be written
    const db = getFirestore();
    const eventSnap = await db.doc(`clubs/${clubId}/events/${eventId}`).get();
    expect(eventSnap.data()?.deadlineReminderSentAt).toBeDefined();
  });

  // S18
  it("S18: deadlineReminderSentAt already set → deadline nudge skipped (idempotency)", async () => {
    const { player, clubId } = await setupClubGroupAndAdminWithPlayer();

    const startDate = hoursFromNow(72);
    const deadline = hoursFromNow(3);

    await seedEventDocument(clubId, {
      title: "Already Nudged Deadline",
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(new Date(startDate.getTime() + 3600000)),
      responseDeadline: Timestamp.fromDate(deadline),
      targetScope: { level: "club", clubId, clubName: "NotifClub" },
      invitedUserIds: [player.uid],
      responses: [
        { userId: player.uid, userName: player.displayName, response: "pending" },
      ],
      responseSummary: { totalInvited: 1, accepted: 0, declined: 0, pending: 1 },
      // Pre-set the idempotency guard
      deadlineReminderSentAt: Timestamp.now(),
    });

    await (sendDailyEventNotifications as any).run();

    // No RSVP notification should have been created
    const notifications = await getNotificationsForUser(player.uid);
    expect(
      notifications.some(
        (n: any) =>
          n.type === "event" &&
          (n.title as string).toLowerCase().includes("rsvp"),
      ),
    ).toBe(false);
  });
});
