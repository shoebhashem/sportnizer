/**
 * Event Cancellation & Recurring Events Integration Tests
 *
 * Tests: cancelEvent, createRecurringEvent, editRecurringEvent
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

  const db = getFirestore();

  // Seed admin in group allMembers (needed for event creation/cancellation)
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

  // Seed metadata/members docs (used by createRecurringEvent)
  await db.doc(`clubs/${clubId}/metadata/members`).set({
    memberIds: [admin.uid],
  });
  await db.doc(`clubs/${clubId}/groups/${groupId}/metadata/members`).set({
    memberIds: [admin.uid],
  });

  // Update admin's groupAccess so permission checks pass
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

/**
 * Create a second user who is a regular player (no admin rights).
 */
async function createPlayerUser(clubId: string, groupId: string) {
  const player = await createFullTestUser({ displayName: "Regular Player" });

  await seedUserDocument(player.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Event Club",
        role: "member",
        joinedAt: new Date(),
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

  return player;
}

/**
 * Create a second user who is a group coach.
 */
async function createCoachUser(clubId: string, groupId: string) {
  const coach = await createFullTestUser({ displayName: "Group Coach" });

  await seedUserDocument(coach.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Event Club",
        role: "member",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [
          {
            groupId,
            groupName: "Training Group",
            roles: ["coach"],
            isActive: true,
          },
        ],
      },
    ],
  });

  return coach;
}

// ─── Date Helpers ────────────────────────────────────────────

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split("T")[0];
}

function futureISO(daysAhead: number, hours: number = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
}

// ─── Helper: create a single (non-recurring) event ───────────

async function createSingleEvent(
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

// ─── Helper: create a recurring event ────────────────────────

async function createRecurringEventHelper(
  adminToken: string,
  adminUid: string,
  clubId: string,
  groupId: string,
  overrides: Record<string, any> = {},
) {
  return callFunction("createRecurringEvent", adminToken, {
    clubId,
    clubName: "Event Club",
    eventType: "training",
    title: "Weekly Training",
    startDate: futureDate(7),
    startTime: futureISO(7, 18),
    endDate: futureDate(7),
    endTime: futureISO(7, 20),
    frequency: "weekly",
    endType: "occurrences",
    occurrenceCount: 4,
    targetScope: {
      level: "group",
      groupId,
      groupName: "Training Group",
    },
    createdBy: adminUid,
    createdByName: "Event Admin",
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════
// ██ CANCEL EVENT
// ═══════════════════════════════════════════════════════════════

describe("cancelEvent", () => {
  beforeEach(async () => {
    await clearAll();
  }, 30_000);

  // ─── Happy path ────────────────────────────────────────────

  it("should cancel a single event", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const ev = await createSingleEvent(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    const result = await callFunction("cancelEvent", admin.idToken, {
      clubId,
      eventId: ev.eventId,
      cancelledByName: "Event Admin",
    });

    expect(result.success).toBe(true);
    expect(result.cancelledCount).toBe(1);

    const doc = await getDocument(`clubs/${clubId}/events/${ev.eventId}`);
    expect(doc).toBeDefined();
    expect(doc!.status).toBe("cancelled");
    expect(doc!.cancelledBy).toBe(admin.uid);
  }, 30_000);

  it("should cancel with a cancellation reason", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const ev = await createSingleEvent(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    const result = await callFunction("cancelEvent", admin.idToken, {
      clubId,
      eventId: ev.eventId,
      cancellationReason: "Bad weather",
      cancelledByName: "Event Admin",
    });

    expect(result.success).toBe(true);

    const doc = await getDocument(`clubs/${clubId}/events/${ev.eventId}`);
    expect(doc!.cancellationReason).toBe("Bad weather");
  }, 30_000);

  // ─── State validations ─────────────────────────────────────

  it("should reject cancelling an already cancelled event", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const ev = await createSingleEvent(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    // Cancel once
    await callFunction("cancelEvent", admin.idToken, {
      clubId,
      eventId: ev.eventId,
      cancelledByName: "Event Admin",
    });

    // Try to cancel again
    await expectFunctionError(
      "cancelEvent",
      admin.idToken,
      { clubId, eventId: ev.eventId, cancelledByName: "Event Admin" },
      "failed-precondition",
    );
  }, 30_000);

  it("should reject cancelling a completed event", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const ev = await createSingleEvent(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    // Manually set event to completed
    const db = getFirestore();
    await db
      .doc(`clubs/${clubId}/events/${ev.eventId}`)
      .update({ status: "completed" });

    await expectFunctionError(
      "cancelEvent",
      admin.idToken,
      { clubId, eventId: ev.eventId, cancelledByName: "Event Admin" },
      "failed-precondition",
    );
  }, 30_000);

  it("should reject cancelling a non-existent event", async () => {
    const { admin, clubId } = await setupClubGroupAndAdmin();

    await expectFunctionError(
      "cancelEvent",
      admin.idToken,
      { clubId, eventId: "non-existent-id", cancelledByName: "Event Admin" },
      "not-found",
    );
  }, 30_000);

  // ─── Permission checks ─────────────────────────────────────

  it("should reject unauthenticated cancel request", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const ev = await createSingleEvent(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    await expectFunctionError(
      "cancelEvent",
      "", // no auth
      { clubId, eventId: ev.eventId, cancelledByName: "Nobody" },
      "unauthenticated",
    );
  }, 30_000);

  it("should reject cancel by a regular player", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const ev = await createSingleEvent(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    const player = await createPlayerUser(clubId, groupId);

    await expectFunctionError(
      "cancelEvent",
      player.idToken,
      { clubId, eventId: ev.eventId, cancelledByName: "Regular Player" },
      "permission-denied",
    );
  }, 30_000);

  it("should allow group coach to cancel event", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const ev = await createSingleEvent(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    const coach = await createCoachUser(clubId, groupId);

    const result = await callFunction("cancelEvent", coach.idToken, {
      clubId,
      eventId: ev.eventId,
      cancelledByName: "Group Coach",
    });

    expect(result.success).toBe(true);

    const doc = await getDocument(`clubs/${clubId}/events/${ev.eventId}`);
    expect(doc!.status).toBe("cancelled");
    expect(doc!.cancelledBy).toBe(coach.uid);
  }, 30_000);

  // ─── Missing required fields ───────────────────────────────

  it("should reject when missing required fields", async () => {
    const { admin, clubId } = await setupClubGroupAndAdmin();

    await expectFunctionError(
      "cancelEvent",
      admin.idToken,
      { clubId }, // missing eventId
      "invalid-argument",
    );
  }, 30_000);

  // ─── Recurring event cancellation (single scope) ───────────

  it("should cancel a single recurring occurrence (scope=single)", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    expect(recurring.success).toBe(true);
    const firstEventId = recurring.occurrenceEventIds[0];

    // Cancel only the first occurrence
    const result = await callFunction("cancelEvent", admin.idToken, {
      clubId,
      eventId: firstEventId,
      recurringEventId: recurring.recurringEventId,
      scope: "single",
      cancelledByName: "Event Admin",
    });

    expect(result.success).toBe(true);
    expect(result.cancelledCount).toBe(1);

    // First occurrence should be cancelled
    const firstDoc = await getDocument(
      `clubs/${clubId}/events/${firstEventId}`,
    );
    expect(firstDoc!.status).toBe("cancelled");

    // Second occurrence should still be scheduled
    const secondDoc = await getDocument(
      `clubs/${clubId}/events/${recurring.occurrenceEventIds[1]}`,
    );
    expect(secondDoc!.status).toBe("scheduled");
  }, 45_000);

  // ─── Recurring event cancellation (future scope) ───────────

  it("should cancel this and all future occurrences (scope=future)", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    expect(recurring.success).toBe(true);
    expect(recurring.occurrenceEventIds.length).toBe(4);

    // Cancel from the second occurrence onwards
    const secondEventId = recurring.occurrenceEventIds[1];

    const result = await callFunction("cancelEvent", admin.idToken, {
      clubId,
      eventId: secondEventId,
      recurringEventId: recurring.recurringEventId,
      scope: "future",
      cancelledByName: "Event Admin",
    });

    expect(result.success).toBe(true);
    // Should have cancelled occurrences 1, 2, 3 (future from index 1)
    expect(result.cancelledCount).toBeGreaterThanOrEqual(3);

    // First occurrence should still be scheduled (it's in the past relative to scope)
    const firstDoc = await getDocument(
      `clubs/${clubId}/events/${recurring.occurrenceEventIds[0]}`,
    );
    expect(firstDoc!.status).toBe("scheduled");

    // Second, third, fourth should all be cancelled
    for (let i = 1; i < 4; i++) {
      const doc = await getDocument(
        `clubs/${clubId}/events/${recurring.occurrenceEventIds[i]}`,
      );
      expect(doc!.status).toBe("cancelled");
    }
  }, 45_000);

  it("should skip individually modified occurrences in future scope", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    // Mark the third occurrence as individually modified
    const db = getFirestore();
    const thirdEventId = recurring.occurrenceEventIds[2];
    await db
      .doc(`clubs/${clubId}/events/${thirdEventId}`)
      .update({ isModified: true });

    // Cancel from the second occurrence onwards (future scope)
    const result = await callFunction("cancelEvent", admin.idToken, {
      clubId,
      eventId: recurring.occurrenceEventIds[1],
      recurringEventId: recurring.recurringEventId,
      scope: "future",
      cancelledByName: "Event Admin",
    });

    expect(result.success).toBe(true);

    // The third (modified) occurrence should NOT be cancelled — it was skipped
    const thirdDoc = await getDocument(
      `clubs/${clubId}/events/${thirdEventId}`,
    );
    expect(thirdDoc!.status).toBe("scheduled");
  }, 45_000);

  it("should update master status when all occurrences are cancelled from start", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    // Cancel from the very first occurrence (index 0) with future scope
    const result = await callFunction("cancelEvent", admin.idToken, {
      clubId,
      eventId: recurring.occurrenceEventIds[0],
      recurringEventId: recurring.recurringEventId,
      scope: "future",
      cancelledByName: "Event Admin",
    });

    expect(result.success).toBe(true);

    // Master document should be marked as cancelled
    const masterDoc = await getDocument(
      `clubs/${clubId}/recurringEvents/${recurring.recurringEventId}`,
    );
    expect(masterDoc).toBeDefined();
    expect(masterDoc!.status).toBe("cancelled");
  }, 45_000);

  it("event should remain visible (isActive=true) after cancellation", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const ev = await createSingleEvent(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    await callFunction("cancelEvent", admin.idToken, {
      clubId,
      eventId: ev.eventId,
      cancelledByName: "Event Admin",
    });

    const doc = await getDocument(`clubs/${clubId}/events/${ev.eventId}`);
    // Cancelled events stay visible (isActive: true) — status is the authority
    expect(doc!.isActive).toBe(true);
    expect(doc!.status).toBe("cancelled");
  }, 30_000);

  // ─── Recurring field contract ──────────────────────────────

  it("non-recurring event should NOT have isRecurring set in Firestore", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const ev = await createSingleEvent(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    const doc = await getDocument(`clubs/${clubId}/events/${ev.eventId}`);
    expect(doc).toBeDefined();
    // A standard event must not have isRecurring, so client knows the difference
    expect(doc!.isRecurring).toBeFalsy();
    expect(doc!.recurringEventId).toBeFalsy();
  }, 30_000);

  it("cancelling a recurring event without scope should only cancel that one event", async () => {
    // This replicates the real-world bug: the client omitted scope/recurringEventId
    // because event.isRecurring was not mapped from Firestore to the UI model.
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );
    expect(recurring.occurrenceEventIds.length).toBe(4);

    const firstEventId = recurring.occurrenceEventIds[0];

    // Cancel WITHOUT scope or recurringEventId — simulates the broken UI path
    const result = await callFunction("cancelEvent", admin.idToken, {
      clubId,
      eventId: firstEventId,
      cancelledByName: "Event Admin",
      // NO recurringEventId, NO scope
    });

    expect(result.success).toBe(true);
    expect(result.cancelledCount).toBe(1);

    // Only the targeted event should be cancelled
    const cancelledDoc = await getDocument(
      `clubs/${clubId}/events/${firstEventId}`,
    );
    expect(cancelledDoc!.status).toBe("cancelled");

    // All other occurrences must remain scheduled
    for (let i = 1; i < recurring.occurrenceEventIds.length; i++) {
      const doc = await getDocument(
        `clubs/${clubId}/events/${recurring.occurrenceEventIds[i]}`,
      );
      expect(doc!.status).toBe("scheduled");
    }

    // Master should NOT be marked cancelled (only one occurrence was hit)
    const master = await getDocument(
      `clubs/${clubId}/recurringEvents/${recurring.recurringEventId}`,
    );
    expect(master!.status).toBe("active");
  }, 45_000);
});

// ═══════════════════════════════════════════════════════════════
// ██ CREATE RECURRING EVENT
// ═══════════════════════════════════════════════════════════════

describe("createRecurringEvent", () => {
  beforeEach(async () => {
    await clearAll();
  }, 30_000);

  // ─── Happy paths ───────────────────────────────────────────

  it("should create a weekly recurring event with 4 occurrences", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const result = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    expect(result.success).toBe(true);
    expect(result.recurringEventId).toBeDefined();
    expect(result.occurrenceEventIds).toHaveLength(4);
    expect(result.totalOccurrences).toBe(4);
    expect(result.totalRecipients).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("should create master document with correct fields", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const result = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    const master = await getDocument(
      `clubs/${clubId}/recurringEvents/${result.recurringEventId}`,
    );

    expect(master).toBeDefined();
    expect(master!.recurringEventId).toBe(result.recurringEventId);
    expect(master!.clubId).toBe(clubId);
    expect(master!.title).toBe("Weekly Training");
    expect(master!.frequency).toBe("weekly");
    expect(master!.endType).toBe("occurrences");
    expect(master!.totalOccurrences).toBe(4);
    expect(master!.isActive).toBe(true);
    expect(master!.status).toBe("active");
    expect(master!.createdBy).toBe(admin.uid);
    expect(master!.occurrenceEventIds).toHaveLength(4);
    expect(master!.targetScope.level).toBe("group");
    expect(master!.targetScope.groupId).toBe(groupId);
  }, 60_000);

  it("should create each occurrence with correct recurring fields", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const result = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    for (let i = 0; i < result.occurrenceEventIds.length; i++) {
      const occ = await getDocument(
        `clubs/${clubId}/events/${result.occurrenceEventIds[i]}`,
      );
      expect(occ).toBeDefined();
      expect(occ!.isRecurring).toBe(true);
      expect(occ!.recurringEventId).toBe(result.recurringEventId);
      expect(occ!.occurrenceIndex).toBe(i);
      expect(occ!.isModified).toBe(false);
      expect(occ!.status).toBe("scheduled");
      expect(occ!.title).toBe("Weekly Training");
      expect(occ!.eventType).toBe("training");
      expect(occ!.createdBy).toBe(admin.uid);
    }
  }, 60_000);

  it("should create occurrences with correct date spacing (weekly)", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const result = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    const dates: Date[] = [];
    for (const eid of result.occurrenceEventIds) {
      const occ = await getDocument(`clubs/${clubId}/events/${eid}`);
      // startDate is a Firestore Timestamp
      dates.push(occ!.startDate.toDate());
    }

    // Each occurrence should be ~7 days apart
    for (let i = 1; i < dates.length; i++) {
      const diffMs = dates[i].getTime() - dates[i - 1].getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(7, 0);
    }
  }, 60_000);

  it("should create biweekly recurring events", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const result = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
      { frequency: "biweekly", occurrenceCount: 3 },
    );

    expect(result.success).toBe(true);
    expect(result.totalOccurrences).toBe(3);

    // Check date spacing is ~14 days
    const dates: Date[] = [];
    for (const eid of result.occurrenceEventIds) {
      const occ = await getDocument(`clubs/${clubId}/events/${eid}`);
      dates.push(occ!.startDate.toDate());
    }

    for (let i = 1; i < dates.length; i++) {
      const diffMs = dates[i].getTime() - dates[i - 1].getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(14, 0);
    }
  }, 60_000);

  it("should create monthly recurring events", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const result = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
      { frequency: "monthly", occurrenceCount: 3 },
    );

    expect(result.success).toBe(true);
    expect(result.totalOccurrences).toBe(3);

    // Check date spacing is ~28-31 days
    const dates: Date[] = [];
    for (const eid of result.occurrenceEventIds) {
      const occ = await getDocument(`clubs/${clubId}/events/${eid}`);
      dates.push(occ!.startDate.toDate());
    }

    for (let i = 1; i < dates.length; i++) {
      const diffMs = dates[i].getTime() - dates[i - 1].getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThanOrEqual(28);
      expect(diffDays).toBeLessThanOrEqual(31);
    }
  }, 60_000);

  it("should include creator in invitedUserIds", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const result = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    const occ = await getDocument(
      `clubs/${clubId}/events/${result.occurrenceEventIds[0]}`,
    );
    expect(occ!.invitedUserIds).toContain(admin.uid);
  }, 60_000);

  // ─── Validation ────────────────────────────────────────────

  it("should reject unauthenticated request", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    await expectFunctionError(
      "createRecurringEvent",
      "", // no auth
      {
        clubId,
        clubName: "Event Club",
        eventType: "training",
        title: "Weekly Training",
        startDate: futureDate(7),
        startTime: futureISO(7, 18),
        endDate: futureDate(7),
        endTime: futureISO(7, 20),
        frequency: "weekly",
        endType: "occurrences",
        occurrenceCount: 4,
        targetScope: { level: "group", groupId, groupName: "Training Group" },
        createdBy: admin.uid,
        createdByName: "Event Admin",
      },
      "unauthenticated",
    );
  }, 30_000);

  it("should reject missing required fields", async () => {
    const { admin, clubId } = await setupClubGroupAndAdmin();

    await expectFunctionError(
      "createRecurringEvent",
      admin.idToken,
      { clubId }, // missing most required fields
      "invalid-argument",
    );
  }, 30_000);

  it("should reject invalid occurrenceCount (< 2)", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    await expectFunctionError(
      "createRecurringEvent",
      admin.idToken,
      {
        clubId,
        clubName: "Event Club",
        eventType: "training",
        title: "Weekly Training",
        startDate: futureDate(7),
        startTime: futureISO(7, 18),
        endDate: futureDate(7),
        endTime: futureISO(7, 20),
        frequency: "weekly",
        endType: "occurrences",
        occurrenceCount: 1, // Too few
        targetScope: {
          level: "group",
          groupId,
          groupName: "Training Group",
        },
        createdBy: admin.uid,
        createdByName: "Event Admin",
      },
      "invalid-argument",
    );
  }, 30_000);

  it("should reject invalid occurrenceCount (> 52)", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    await expectFunctionError(
      "createRecurringEvent",
      admin.idToken,
      {
        clubId,
        clubName: "Event Club",
        eventType: "training",
        title: "Weekly Training",
        startDate: futureDate(7),
        startTime: futureISO(7, 18),
        endDate: futureDate(7),
        endTime: futureISO(7, 20),
        frequency: "weekly",
        endType: "occurrences",
        occurrenceCount: 100, // Too many
        targetScope: {
          level: "group",
          groupId,
          groupName: "Training Group",
        },
        createdBy: admin.uid,
        createdByName: "Event Admin",
      },
      "invalid-argument",
    );
  }, 30_000);

  it("should require seriesEndDate when endType is 'date'", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    await expectFunctionError(
      "createRecurringEvent",
      admin.idToken,
      {
        clubId,
        clubName: "Event Club",
        eventType: "training",
        title: "Weekly Training",
        startDate: futureDate(7),
        startTime: futureISO(7, 18),
        endDate: futureDate(7),
        endTime: futureISO(7, 20),
        frequency: "weekly",
        endType: "date",
        // Missing seriesEndDate
        targetScope: {
          level: "group",
          groupId,
          groupName: "Training Group",
        },
        createdBy: admin.uid,
        createdByName: "Event Admin",
      },
      "invalid-argument",
    );
  }, 30_000);

  it("should require occurrenceCount when endType is 'occurrences'", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    await expectFunctionError(
      "createRecurringEvent",
      admin.idToken,
      {
        clubId,
        clubName: "Event Club",
        eventType: "training",
        title: "Weekly Training",
        startDate: futureDate(7),
        startTime: futureISO(7, 18),
        endDate: futureDate(7),
        endTime: futureISO(7, 20),
        frequency: "weekly",
        endType: "occurrences",
        // Missing occurrenceCount
        targetScope: {
          level: "group",
          groupId,
          groupName: "Training Group",
        },
        createdBy: admin.uid,
        createdByName: "Event Admin",
      },
      "invalid-argument",
    );
  }, 30_000);

  // ─── Permission checks ─────────────────────────────────────

  it("should reject a regular player creating recurring events", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const player = await createPlayerUser(clubId, groupId);

    await expectFunctionError(
      "createRecurringEvent",
      player.idToken,
      {
        clubId,
        clubName: "Event Club",
        eventType: "training",
        title: "Weekly Training",
        startDate: futureDate(7),
        startTime: futureISO(7, 18),
        endDate: futureDate(7),
        endTime: futureISO(7, 20),
        frequency: "weekly",
        endType: "occurrences",
        occurrenceCount: 4,
        targetScope: {
          level: "group",
          groupId,
          groupName: "Training Group",
        },
        createdBy: player.uid,
        createdByName: "Regular Player",
      },
      "permission-denied",
    );
  }, 30_000);

  it("should allow a group coach to create recurring events", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const coach = await createCoachUser(clubId, groupId);

    // Seed metadata members to include the coach
    const db = getFirestore();
    await db
      .doc(`clubs/${clubId}/groups/${groupId}/metadata/members`)
      .set({ memberIds: [admin.uid, coach.uid] });

    const result = await callFunction("createRecurringEvent", coach.idToken, {
      clubId,
      clubName: "Event Club",
      eventType: "training",
      title: "Coach Training",
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
        groupName: "Training Group",
      },
      createdBy: coach.uid,
      createdByName: "Group Coach",
    });

    expect(result.success).toBe(true);
    expect(result.totalOccurrences).toBe(3);
  }, 60_000);

  // ─── End type: date ────────────────────────────────────────

  it("should create occurrences based on seriesEndDate", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    // End date ~5 weeks from now — should get 5 weekly occurrences
    const seriesEndDate = new Date();
    seriesEndDate.setDate(seriesEndDate.getDate() + 7 + 4 * 7 + 1); // start + 4 more weeks + 1 day buffer

    const result = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
      {
        endType: "date",
        occurrenceCount: undefined,
        seriesEndDate: seriesEndDate.toISOString(),
      },
    );

    expect(result.success).toBe(true);
    // Should have ~5 occurrences (start + 4 more weekly)
    expect(result.totalOccurrences).toBeGreaterThanOrEqual(4);
    expect(result.totalOccurrences).toBeLessThanOrEqual(6);
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════
// ██ EDIT RECURRING EVENT
// ═══════════════════════════════════════════════════════════════

describe("editRecurringEvent", () => {
  beforeEach(async () => {
    await clearAll();
  }, 30_000);

  // ─── Single scope ──────────────────────────────────────────

  it("should edit a single occurrence and mark it as modified", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    const targetEventId = recurring.occurrenceEventIds[1]; // 2nd occurrence

    const result = await callFunction("editRecurringEvent", admin.idToken, {
      clubId,
      eventId: targetEventId,
      recurringEventId: recurring.recurringEventId,
      scope: "single",
      title: "Modified Training",
    });

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);

    // Edited occurrence should have new title and be marked as modified
    const edited = await getDocument(`clubs/${clubId}/events/${targetEventId}`);
    expect(edited!.title).toBe("Modified Training");
    expect(edited!.isModified).toBe(true);

    // Other occurrences should be unchanged
    const otherDoc = await getDocument(
      `clubs/${clubId}/events/${recurring.occurrenceEventIds[0]}`,
    );
    expect(otherDoc!.title).toBe("Weekly Training");
    expect(otherDoc!.isModified).toBe(false);
  }, 60_000);

  it("should edit description of a single occurrence", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    const targetEventId = recurring.occurrenceEventIds[0];

    const result = await callFunction("editRecurringEvent", admin.idToken, {
      clubId,
      eventId: targetEventId,
      recurringEventId: recurring.recurringEventId,
      scope: "single",
      description: "Bring extra gear",
    });

    expect(result.success).toBe(true);

    const doc = await getDocument(`clubs/${clubId}/events/${targetEventId}`);
    expect(doc!.description).toBe("Bring extra gear");
    expect(doc!.isModified).toBe(true);
  }, 60_000);

  it("should edit location of a single occurrence", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    const targetEventId = recurring.occurrenceEventIds[2];

    const result = await callFunction("editRecurringEvent", admin.idToken, {
      clubId,
      eventId: targetEventId,
      recurringEventId: recurring.recurringEventId,
      scope: "single",
      location: "Indoor Arena",
    });

    expect(result.success).toBe(true);

    const doc = await getDocument(`clubs/${clubId}/events/${targetEventId}`);
    expect(doc!.location).toBe("Indoor Arena");
  }, 60_000);

  // ─── Future scope ──────────────────────────────────────────

  it("should edit this and all future occurrences (scope=future)", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    // Edit from the second occurrence onwards
    const secondEventId = recurring.occurrenceEventIds[1];

    const result = await callFunction("editRecurringEvent", admin.idToken, {
      clubId,
      eventId: secondEventId,
      recurringEventId: recurring.recurringEventId,
      scope: "future",
      title: "Updated Series Title",
    });

    expect(result.success).toBe(true);
    // Should update occurrences 1, 2, 3
    expect(result.updatedCount).toBe(3);

    // First occurrence (index 0) should be unchanged
    const firstDoc = await getDocument(
      `clubs/${clubId}/events/${recurring.occurrenceEventIds[0]}`,
    );
    expect(firstDoc!.title).toBe("Weekly Training");

    // Second, third, fourth should have new title
    for (let i = 1; i < 4; i++) {
      const doc = await getDocument(
        `clubs/${clubId}/events/${recurring.occurrenceEventIds[i]}`,
      );
      expect(doc!.title).toBe("Updated Series Title");
    }
  }, 60_000);

  it("should skip individually modified occurrences in future scope", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    // Mark the third occurrence as individually modified
    const db = getFirestore();
    const thirdEventId = recurring.occurrenceEventIds[2];
    await db
      .doc(`clubs/${clubId}/events/${thirdEventId}`)
      .update({ isModified: true, title: "Custom Session" });

    // Edit from the first occurrence onwards with future scope
    const result = await callFunction("editRecurringEvent", admin.idToken, {
      clubId,
      eventId: recurring.occurrenceEventIds[0],
      recurringEventId: recurring.recurringEventId,
      scope: "future",
      title: "New Series Name",
    });

    expect(result.success).toBe(true);

    // Third occurrence should keep its custom title (was modified)
    const thirdDoc = await getDocument(
      `clubs/${clubId}/events/${thirdEventId}`,
    );
    expect(thirdDoc!.title).toBe("Custom Session");

    // Other non-modified occurrences should have new title
    const firstDoc = await getDocument(
      `clubs/${clubId}/events/${recurring.occurrenceEventIds[0]}`,
    );
    expect(firstDoc!.title).toBe("New Series Name");
  }, 60_000);

  it("should update master document when using future scope", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    await callFunction("editRecurringEvent", admin.idToken, {
      clubId,
      eventId: recurring.occurrenceEventIds[0],
      recurringEventId: recurring.recurringEventId,
      scope: "future",
      title: "Brand New Title",
      location: "New Venue",
    });

    const master = await getDocument(
      `clubs/${clubId}/recurringEvents/${recurring.recurringEventId}`,
    );
    expect(master!.title).toBe("Brand New Title");
    expect(master!.location).toBe("New Venue");
  }, 60_000);

  it("should skip cancelled occurrences in future scope", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    // Cancel the third occurrence first
    await callFunction("cancelEvent", admin.idToken, {
      clubId,
      eventId: recurring.occurrenceEventIds[2],
      recurringEventId: recurring.recurringEventId,
      scope: "single",
      cancelledByName: "Event Admin",
    });

    // Now edit all from first occurrence with future scope
    const result = await callFunction("editRecurringEvent", admin.idToken, {
      clubId,
      eventId: recurring.occurrenceEventIds[0],
      recurringEventId: recurring.recurringEventId,
      scope: "future",
      title: "Updated After Cancel",
    });

    expect(result.success).toBe(true);
    // Should have updated 3 (skipped the cancelled one)
    expect(result.updatedCount).toBe(3);

    // The cancelled one should still be cancelled and have old title
    const cancelledDoc = await getDocument(
      `clubs/${clubId}/events/${recurring.occurrenceEventIds[2]}`,
    );
    expect(cancelledDoc!.status).toBe("cancelled");
    expect(cancelledDoc!.title).toBe("Weekly Training");
  }, 60_000);

  // ─── Validation ────────────────────────────────────────────

  it("should reject invalid scope value", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    await expectFunctionError(
      "editRecurringEvent",
      admin.idToken,
      {
        clubId,
        eventId: recurring.occurrenceEventIds[0],
        recurringEventId: recurring.recurringEventId,
        scope: "all", // invalid
      },
      "invalid-argument",
    );
  }, 30_000);

  it("should reject when event does not exist", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    await expectFunctionError(
      "editRecurringEvent",
      admin.idToken,
      {
        clubId,
        eventId: "non-existent",
        recurringEventId: recurring.recurringEventId,
        scope: "single",
      },
      "not-found",
    );
  }, 30_000);

  it("should reject when recurring master does not exist", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    await expectFunctionError(
      "editRecurringEvent",
      admin.idToken,
      {
        clubId,
        eventId: recurring.occurrenceEventIds[0],
        recurringEventId: "fake-master-id",
        scope: "single",
      },
      "not-found",
    );
  }, 30_000);

  it("should reject missing required fields", async () => {
    const { admin } = await setupClubGroupAndAdmin();

    await expectFunctionError(
      "editRecurringEvent",
      admin.idToken,
      {
        // missing clubId, eventId, recurringEventId, scope
      },
      "invalid-argument",
    );
  }, 30_000);

  it("should reject unauthenticated request", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    await expectFunctionError(
      "editRecurringEvent",
      "",
      {
        clubId,
        eventId: recurring.occurrenceEventIds[0],
        recurringEventId: recurring.recurringEventId,
        scope: "single",
        title: "Should Fail",
      },
      "unauthenticated",
    );
  }, 30_000);

  // ─── Permission checks ─────────────────────────────────────

  it("should reject edit by regular player", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const player = await createPlayerUser(clubId, groupId);

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    await expectFunctionError(
      "editRecurringEvent",
      player.idToken,
      {
        clubId,
        eventId: recurring.occurrenceEventIds[0],
        recurringEventId: recurring.recurringEventId,
        scope: "single",
        title: "Hacked Title",
      },
      "permission-denied",
    );
  }, 30_000);

  it("should allow group coach to edit recurring events", async () => {
    const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
    const coach = await createCoachUser(clubId, groupId);

    const recurring = await createRecurringEventHelper(
      admin.idToken,
      admin.uid,
      clubId,
      groupId,
    );

    const result = await callFunction("editRecurringEvent", coach.idToken, {
      clubId,
      eventId: recurring.occurrenceEventIds[0],
      recurringEventId: recurring.recurringEventId,
      scope: "single",
      title: "Coach Updated Title",
    });

    expect(result.success).toBe(true);

    const doc = await getDocument(
      `clubs/${clubId}/events/${recurring.occurrenceEventIds[0]}`,
    );
    expect(doc!.title).toBe("Coach Updated Title");
  }, 60_000);
});
