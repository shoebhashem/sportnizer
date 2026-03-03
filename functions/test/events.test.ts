/**
 * Events & Attendance Integration Tests
 *
 * Tests: createEventV2, getEvent, updateEvent, deleteEvent,
 *        updateEventResponse (RSVP), recordAttendance, getStatistics
 * Runs against Firebase Emulators.
 */

import {
    callFunction,
    clearAll,
    createFullTestUser,
    expectFunctionError,
    getDocument,
    getFirestore,
    seedUserDocument,
} from "./helpers";

// ─── Shared Setup ────────────────────────────────────────────

async function setupClubGroupAndAdmin() {
  const admin = await createFullTestUser({ displayName: "Event Admin" });

  const { clubId } = await callFunction("createClub", admin.idToken, {
    clubData: { name: `Event Club ${Date.now()}` },
  });

  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Event Club",
        role: "club-admin",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [],
      },
    ],
  });

  const { groupId } = await callFunction("createGroup", admin.idToken, {
    clubId,
    groupData: { name: "Training Group" },
  });

  // Seed admin in group members (needed for event creation)
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
      },
    ],
    memberCount: 1,
  });

  // Seed admin in club allMembers
  await db.doc(`clubs/${clubId}/allMembers/members`).set(
    {
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
    },
    { merge: true },
  );

  // Update admin's groupAccess so event creation sees it
  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Event Club",
        role: "club-admin",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [
          {
            groupId,
            groupName: "Training Group",
            roles: ["admin"],
            isActive: true,
          },
        ],
      },
    ],
  });

  return { admin, clubId, groupId };
}

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

// ─── Helper: create a standard event ─────────────────────────

async function createTestEvent(
  adminToken: string,
  adminUid: string,
  clubId: string,
  groupId: string,
  overrides: Record<string, any> = {},
) {
  return callFunction("createEventV2", adminToken, {
    clubId,
    clubName: "Event Club",
    eventType: "training",
    title: "Test Training",
    startDate: futureDate(7),
    startTime: futureISO(7, 18),
    endDate: futureDate(7),
    endTime: futureISO(7, 20),
    targetScope: { level: "group", groupId, groupName: "Training Group" },
    createdBy: adminUid,
    createdByName: "Event Admin",
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════

describe("Event Lifecycle", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── createEventV2 ─────────────────────────────────────────

  describe("createEventV2", () => {
    it("should create a group-level event", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const result = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      expect(result.success).toBe(true);
      expect(result.eventId).toBeDefined();
      expect(result.totalRecipients).toBeGreaterThanOrEqual(1);

      // Verify event document
      const event = await getDocument(
        `clubs/${clubId}/events/${result.eventId}`,
      );
      expect(event).toBeDefined();
      expect(event!.title).toBe("Test Training");
      expect(event!.eventType).toBe("training");
      expect(event!.isActive).toBe(true);
      expect(event!.createdBy).toBe(admin.uid);
    });

    it("should create different event types", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      for (const eventType of ["match", "meeting", "other"]) {
        const result = await createTestEvent(
          admin.idToken,
          admin.uid,
          clubId,
          groupId,
          { eventType, title: `${eventType} event` },
        );
        expect(result.success).toBe(true);
        const event = await getDocument(
          `clubs/${clubId}/events/${result.eventId}`,
        );
        expect(event!.eventType).toBe(eventType);
      }
    });

    it("should reject missing required fields", async () => {
      const { admin, clubId } = await setupClubGroupAndAdmin();

      await expectFunctionError(
        "createEventV2",
        admin.idToken,
        { clubId, clubName: "Event Club" }, // missing title, dates, scope, etc.
        "invalid-argument",
      );
    });

    it("should reject unauthenticated calls", async () => {
      await expectFunctionError(
        "createEventV2",
        "", // no auth
        { clubId: "fake", title: "Test" },
        "unauthenticated",
      );
    });

    it("should reject creation from non-admin/non-coach", async () => {
      const { clubId, groupId } = await setupClubGroupAndAdmin();
      const player = await createFullTestUser({ email: "player@test.com" });

      // Give player basic club access but no admin/coach group role
      await seedUserDocument(player.uid, {
        clubAccess: [
          {
            clubId,
            clubName: "Event Club",
            role: "member",
            isActive: true,
            groupAccess: [
              {
                groupId,
                groupName: "Training Group",
                roles: ["player"],
                isActive: true,
              },
            ],
          },
        ],
      });

      await expectFunctionError(
        "createEventV2",
        player.idToken,
        {
          clubId,
          clubName: "Event Club",
          eventType: "training",
          title: "Unauthorized Event",
          startDate: futureDate(7),
          startTime: futureISO(7, 18),
          endDate: futureDate(7),
          endTime: futureISO(7, 20),
          targetScope: { level: "group", groupId, groupName: "Training Group" },
          createdBy: player.uid,
          createdByName: "Player",
        },
        "permission-denied",
      );
    });

    it("should include event responses for invited members", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      // Add a second member to the group
      const player = await createFullTestUser({
        email: "invitee@test.com",
        displayName: "Invitee",
      });
      const db = getFirestore();
      const membersRef = db.doc(
        `clubs/${clubId}/groups/${groupId}/allMembers/members`,
      );
      const membersDoc = await membersRef.get();
      const existing = membersDoc.data()?.members || [];
      await membersRef.update({
        members: [
          ...existing,
          {
            userId: player.uid,
            name: player.displayName,
            email: player.email,
            roles: ["player"],
            isActive: true,
            needsGuardian: false,
          },
        ],
        memberCount: existing.length + 1,
      });

      const result = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      expect(result.totalRecipients).toBeGreaterThanOrEqual(2);

      // Event should have responses array with entries
      const event = await getDocument(
        `clubs/${clubId}/events/${result.eventId}`,
      );
      expect(event!.responses).toBeDefined();
      expect(event!.responses.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── getEvent ──────────────────────────────────────────────

  describe("getEvent", () => {
    it("should return event data", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      const result = await callFunction("getEvent", admin.idToken, {
        clubId,
        eventId,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.title).toBe("Test Training");
    });

    it("should return not-found for nonexistent event", async () => {
      const { admin, clubId } = await setupClubGroupAndAdmin();

      await expectFunctionError(
        "getEvent",
        admin.idToken,
        { clubId, eventId: "nonexistent" },
        "not-found",
      );
    });
  });

  // ─── updateEvent ───────────────────────────────────────────

  describe("updateEvent", () => {
    it("should allow event creator to update", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      const result = await callFunction("updateEvent", admin.idToken, {
        clubId,
        eventId,
        eventData: {
          title: "Updated Training",
          description: "New description",
          location: "New Venue",
        },
      });

      expect(result.success).toBe(true);

      const event = await getDocument(`clubs/${clubId}/events/${eventId}`);
      expect(event!.title).toBe("Updated Training");
      expect(event!.description).toBe("New description");
    });

    it("should reject update from non-creator", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      const stranger = await createFullTestUser({ email: "stranger@test.com" });

      await expectFunctionError(
        "updateEvent",
        stranger.idToken,
        {
          clubId,
          eventId,
          eventData: { title: "Hacked" },
        },
        "permission-denied",
      );

      // Verify title unchanged
      const event = await getDocument(`clubs/${clubId}/events/${eventId}`);
      expect(event!.title).toBe("Test Training");
    });

    it("should reject missing eventData", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      await expectFunctionError(
        "updateEvent",
        admin.idToken,
        { clubId, eventId }, // no eventData
        "invalid-argument",
      );
    });
  });

  // ─── deleteEvent ───────────────────────────────────────────

  describe("deleteEvent", () => {
    it("should soft-delete an event (creator only)", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      const result = await callFunction("deleteEvent", admin.idToken, {
        clubId,
        eventId,
      });

      expect(result.success).toBe(true);

      const event = await getDocument(`clubs/${clubId}/events/${eventId}`);
      expect(event!.isActive).toBe(false);
    });

    it("should reject deletion from non-creator", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      const stranger = await createFullTestUser({ email: "stranger@test.com" });

      await expectFunctionError(
        "deleteEvent",
        stranger.idToken,
        { clubId, eventId },
        "permission-denied",
      );
    });
  });

  // ─── updateEventResponse (RSVP) ───────────────────────────

  describe("updateEventResponse", () => {
    it("should allow a member to accept an event", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      // Admin is also an invited member — accept the event
      const result = await callFunction("updateEventResponse", admin.idToken, {
        eventId,
        clubId,
        userId: admin.uid,
        response: "accepted",
      });

      expect(result.success).toBe(true);

      // Verify the response was recorded
      const event = await getDocument(`clubs/${clubId}/events/${eventId}`);
      const userResponse = event!.responses.find(
        (r: any) => r.userId === admin.uid,
      );
      expect(userResponse.response).toBe("accepted");
    });

    it("should allow a member to decline an event", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      const result = await callFunction("updateEventResponse", admin.idToken, {
        eventId,
        clubId,
        userId: admin.uid,
        response: "declined",
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid response value", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      await expectFunctionError(
        "updateEventResponse",
        admin.idToken,
        {
          eventId,
          clubId,
          userId: admin.uid,
          response: "maybe", // invalid
        },
        "invalid-argument",
      );
    });
  });

  // ─── recordAttendance ──────────────────────────────────────

  describe("recordAttendance", () => {
    it("should record attendance and complete event", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      const result = await callFunction("recordAttendance", admin.idToken, {
        eventId,
        clubId,
        attendanceRecords: [{ userId: admin.uid, attended: true }],
        recordedBy: admin.uid,
      });

      expect(result.success).toBe(true);

      // Event should be marked as completed
      const event = await getDocument(`clubs/${clubId}/events/${eventId}`);
      expect(event!.status).toBe("completed");
      expect(event!.completedBy).toBe(admin.uid);
    });

    it("should reject attendance from non-admin/coach", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      const player = await createFullTestUser({ email: "player@test.com" });
      await seedUserDocument(player.uid, {
        clubAccess: [
          {
            clubId,
            clubName: "Event Club",
            role: "member",
            isActive: true,
            groupAccess: [
              {
                groupId,
                groupName: "Training Group",
                roles: ["player"],
                isActive: true,
              },
            ],
          },
        ],
      });

      await expectFunctionError(
        "recordAttendance",
        player.idToken,
        {
          eventId,
          clubId,
          attendanceRecords: [{ userId: admin.uid, attended: true }],
          recordedBy: player.uid,
        },
        "permission-denied",
      );
    });

    it("should reject recording on already-completed event", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      // Complete the event first
      await callFunction("recordAttendance", admin.idToken, {
        eventId,
        clubId,
        attendanceRecords: [{ userId: admin.uid, attended: true }],
        recordedBy: admin.uid,
      });

      // Try to record again
      await expectFunctionError(
        "recordAttendance",
        admin.idToken,
        {
          eventId,
          clubId,
          attendanceRecords: [{ userId: admin.uid, attended: false }],
          recordedBy: admin.uid,
        },
        "failed-precondition",
      );
    });

    it("should reject empty attendance records", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      await expectFunctionError(
        "recordAttendance",
        admin.idToken,
        {
          eventId,
          clubId,
          attendanceRecords: [],
          recordedBy: admin.uid,
        },
        "invalid-argument",
      );
    });
  });

  // ─── getStatistics ─────────────────────────────────────────

  describe("getStatistics", () => {
    it("should return empty stats for year with no events", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const result = await callFunction("getStatistics", admin.idToken, {
        clubId,
        groupId,
        year: 2025,
      });

      // Returns success: false with message when no stats exist
      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });

    it("should reject missing fields", async () => {
      const { admin, clubId } = await setupClubGroupAndAdmin();

      await expectFunctionError(
        "getStatistics",
        admin.idToken,
        { clubId }, // missing groupId and year
        "invalid-argument",
      );
    });

    it("should reject access from non-club-member", async () => {
      const { clubId, groupId } = await setupClubGroupAndAdmin();
      const stranger = await createFullTestUser({ email: "stranger@test.com" });

      await expectFunctionError(
        "getStatistics",
        stranger.idToken,
        { clubId, groupId, year: 2026 },
        "permission-denied",
      );
    });
  });
});
