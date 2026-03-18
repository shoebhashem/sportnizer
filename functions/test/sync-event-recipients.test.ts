/**
 * Sync Event Recipients — Integration Tests
 *
 * Tests the syncEventRecipients Cloud Function which allows admins/coaches
 * to synchronise an event's invitees with the current group membership.
 *
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
  const admin = await createFullTestUser({ displayName: "Sync Admin" });

  const { clubId } = await callFunction("createClub", admin.idToken, {
    clubData: { name: `Sync Club ${Date.now()}` },
  });

  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Sync Club",
        role: "club-admin",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [],
      },
    ],
  });

  const { groupId } = await callFunction("createGroup", admin.idToken, {
    clubId,
    groupData: { name: "Sync Group" },
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
      },
    ],
    memberCount: 1,
  });

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

  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Sync Club",
        role: "club-admin",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [
          {
            groupId,
            groupName: "Sync Group",
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
  return d.toISOString().split("T")[0];
}

function futureISO(daysAhead: number, hours: number = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
}

async function createTestEvent(
  adminToken: string,
  adminUid: string,
  clubId: string,
  groupId: string,
  overrides: Record<string, any> = {},
) {
  return callFunction("createEventV2", adminToken, {
    clubId,
    clubName: "Sync Club",
    eventType: "training",
    title: "Sync Test Event",
    startDate: futureDate(7),
    startTime: futureISO(7, 18),
    endDate: futureDate(7),
    endTime: futureISO(7, 20),
    targetScope: {
      level: "group",
      groupId,
      groupName: "Sync Group",
      clubId,
      clubName: "Sync Club",
    },
    createdBy: adminUid,
    createdByName: "Sync Admin",
    ...overrides,
  });
}

async function addMemberToGroup(
  clubId: string,
  groupId: string,
  member: {
    userId: string;
    name: string;
    email: string;
    roles: string[];
    isActive?: boolean;
    needsGuardian?: boolean;
    guardiansContacts?: any[];
  },
) {
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
        isActive: true,
        needsGuardian: false,
        ...member,
      },
    ],
    memberCount: existing.length + 1,
  });
}

// ═══════════════════════════════════════════════════════════════

describe("syncEventRecipients", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── Preview Mode ──────────────────────────────────────────

  describe("preview mode", () => {
    it("should return empty diff when all members are in sync", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      const result = await callFunction("syncEventRecipients", admin.idToken, {
        clubId,
        eventId,
        mode: "preview",
      });

      expect(result.success).toBe(true);
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.unchanged).toBeGreaterThanOrEqual(1); // at least admin
    });

    it("should detect newly added group member as 'added'", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      // Create event with only admin
      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      // Now add a new player to the group (after event was created)
      const newPlayer = await createFullTestUser({
        email: "newplayer@test.com",
        displayName: "New Player",
      });
      await addMemberToGroup(clubId, groupId, {
        userId: newPlayer.uid,
        name: "New Player",
        email: "newplayer@test.com",
        roles: ["player"],
      });

      const result = await callFunction("syncEventRecipients", admin.idToken, {
        clubId,
        eventId,
        mode: "preview",
      });

      expect(result.success).toBe(true);
      expect(result.added.length).toBeGreaterThanOrEqual(1);
      const addedUserIds = result.added.map((a: any) => a.userId);
      expect(addedUserIds).toContain(newPlayer.uid);
      // Admin is unchanged
      expect(result.unchanged).toBeGreaterThanOrEqual(1);
    });

    it("should detect removed group member as 'removed'", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      // Add a player first, create event, then remove the player
      const player = await createFullTestUser({
        email: "leaveplayer@test.com",
        displayName: "Leaving Player",
      });
      await addMemberToGroup(clubId, groupId, {
        userId: player.uid,
        name: "Leaving Player",
        email: "leaveplayer@test.com",
        roles: ["player"],
      });

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      // Now remove the player by setting isActive: false
      const db = getFirestore();
      const membersRef = db.doc(
        `clubs/${clubId}/groups/${groupId}/allMembers/members`,
      );
      const membersDoc = await membersRef.get();
      const members = membersDoc.data()?.members || [];
      const updatedMembers = members.map((m: any) =>
        m.userId === player.uid ? { ...m, isActive: false } : m,
      );
      await membersRef.update({ members: updatedMembers });

      const result = await callFunction("syncEventRecipients", admin.idToken, {
        clubId,
        eventId,
        mode: "preview",
      });

      expect(result.success).toBe(true);
      const removedUserIds = result.removed.map((r: any) => r.userId);
      expect(removedUserIds).toContain(player.uid);
    });
  });

  // ─── Confirm Mode ──────────────────────────────────────────

  describe("confirm mode", () => {
    it("should add new members to the event", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      // Add a new member after event creation
      const newMember = await createFullTestUser({
        email: "newmember@test.com",
        displayName: "New Member",
      });
      await addMemberToGroup(clubId, groupId, {
        userId: newMember.uid,
        name: "New Member",
        email: "newmember@test.com",
        roles: ["player"],
      });

      const result = await callFunction("syncEventRecipients", admin.idToken, {
        clubId,
        eventId,
        mode: "confirm",
      });

      expect(result.success).toBe(true);
      expect(result.added.length).toBeGreaterThanOrEqual(1);

      // Verify the event doc was updated
      const event = await getDocument(`clubs/${clubId}/events/${eventId}`);
      expect(event).toBeDefined();
      const responseUserIds = event!.responses.map((r: any) => r.userId);
      expect(responseUserIds).toContain(newMember.uid);
      expect(event!.invitedUserIds).toContain(newMember.uid);

      // Verify response summary was updated
      expect(event!.responseSummary.totalInvited).toBeGreaterThanOrEqual(2);
      expect(event!.responseSummary.pending).toBeGreaterThanOrEqual(1);
    });

    it("should not modify event when already in sync", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      const result = await callFunction("syncEventRecipients", admin.idToken, {
        clubId,
        eventId,
        mode: "confirm",
      });

      expect(result.success).toBe(true);
      expect(result.added).toHaveLength(0);
      expect(result.message).toBeDefined();
    });

    it("should not remove existing members from the event (preserves history)", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      // Add player, create event, then deactivate player
      const player = await createFullTestUser({
        email: "historyplayer@test.com",
        displayName: "History Player",
      });
      await addMemberToGroup(clubId, groupId, {
        userId: player.uid,
        name: "History Player",
        email: "historyplayer@test.com",
        roles: ["player"],
      });

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      // Deactivate the player in group
      const db = getFirestore();
      const membersRef = db.doc(
        `clubs/${clubId}/groups/${groupId}/allMembers/members`,
      );
      const membersDoc = await membersRef.get();
      const members = membersDoc.data()?.members || [];
      const updated = members.map((m: any) =>
        m.userId === player.uid ? { ...m, isActive: false } : m,
      );
      await membersRef.update({ members: updated });

      // Confirm sync — should report removed but NOT delete from event
      const result = await callFunction("syncEventRecipients", admin.idToken, {
        clubId,
        eventId,
        mode: "confirm",
      });

      expect(result.success).toBe(true);
      const removedUserIds = result.removed.map((r: any) => r.userId);
      expect(removedUserIds).toContain(player.uid);

      // Player should STILL be in the event responses
      const event = await getDocument(`clubs/${clubId}/events/${eventId}`);
      const responseUserIds = event!.responses.map((r: any) => r.userId);
      expect(responseUserIds).toContain(player.uid);
    });

    it("should handle youth member with guardians", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      // Add a youth member after event creation
      const guardian = await createFullTestUser({
        email: "guardian@test.com",
        displayName: "Guardian Parent",
      });
      const youthUid = "youth-member-uid-001";
      await addMemberToGroup(clubId, groupId, {
        userId: youthUid,
        name: "Youth Player",
        email: "",
        roles: ["player-underage"],
        needsGuardian: true,
        guardiansContacts: [
          {
            guardianUid: guardian.uid,
            guardianName: "Guardian Parent",
            guardianEmail: "guardian@test.com",
          },
        ],
      });

      const result = await callFunction("syncEventRecipients", admin.idToken, {
        clubId,
        eventId,
        mode: "confirm",
      });

      expect(result.success).toBe(true);
      expect(result.added.length).toBeGreaterThanOrEqual(1);

      // The youth member should be in responses
      const event = await getDocument(`clubs/${clubId}/events/${eventId}`);
      const youthResponse = event!.responses.find(
        (r: any) => r.userId === youthUid,
      );
      expect(youthResponse).toBeDefined();
      expect(youthResponse!.isYouthMember).toBe(true);
      expect(youthResponse!.guardianIds).toContain(guardian.uid);

      // Guardian should be in invitedUserIds
      expect(event!.invitedUserIds).toContain(guardian.uid);
    });
  });

  // ─── Permission Checks ────────────────────────────────────

  describe("permissions", () => {
    it("should reject unauthenticated request", async () => {
      await expectFunctionError(
        "syncEventRecipients",
        "", // no auth
        { clubId: "fake", eventId: "fake", mode: "preview" },
        "unauthenticated",
      );
    });

    it("should reject request from regular player", async () => {
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
            clubName: "Sync Club",
            role: "member",
            isActive: true,
            groupAccess: [
              {
                groupId,
                groupName: "Sync Group",
                roles: ["player"],
                isActive: true,
              },
            ],
          },
        ],
      });

      await expectFunctionError(
        "syncEventRecipients",
        player.idToken,
        { clubId, eventId, mode: "preview" },
        "permission-denied",
      );
    });

    it("should allow club-admin who is not the event creator", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      // Create a second club-admin
      const clubAdmin2 = await createFullTestUser({
        email: "clubadmin2@test.com",
        displayName: "Club Admin 2",
      });
      await seedUserDocument(clubAdmin2.uid, {
        clubAccess: [
          {
            clubId,
            clubName: "Sync Club",
            role: "club-admin",
            isActive: true,
            groupAccess: [],
          },
        ],
      });

      const result = await callFunction(
        "syncEventRecipients",
        clubAdmin2.idToken,
        {
          clubId,
          eventId,
          mode: "preview",
        },
      );

      expect(result.success).toBe(true);
    });

    it("should allow group coach to sync", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      const coach = await createFullTestUser({
        email: "coach@test.com",
        displayName: "Group Coach",
      });
      await seedUserDocument(coach.uid, {
        clubAccess: [
          {
            clubId,
            clubName: "Sync Club",
            role: "member",
            isActive: true,
            groupAccess: [
              {
                groupId,
                groupName: "Sync Group",
                roles: ["coach"],
                isActive: true,
              },
            ],
          },
        ],
      });

      const result = await callFunction("syncEventRecipients", coach.idToken, {
        clubId,
        eventId,
        mode: "preview",
      });

      expect(result.success).toBe(true);
    });
  });

  // ─── Validation ────────────────────────────────────────────

  describe("validation", () => {
    it("should reject missing required fields", async () => {
      const { admin } = await setupClubGroupAndAdmin();

      await expectFunctionError(
        "syncEventRecipients",
        admin.idToken,
        { clubId: "some-club" }, // missing eventId and mode
        "invalid-argument",
      );
    });

    it("should reject invalid mode", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      await expectFunctionError(
        "syncEventRecipients",
        admin.idToken,
        { clubId, eventId, mode: "invalid" },
        "invalid-argument",
      );
    });

    it("should reject nonexistent event", async () => {
      const { admin, clubId } = await setupClubGroupAndAdmin();

      await expectFunctionError(
        "syncEventRecipients",
        admin.idToken,
        { clubId, eventId: "nonexistent-event", mode: "preview" },
        "not-found",
      );
    });

    it("should reject invalid scope value", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();
      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      await expectFunctionError(
        "syncEventRecipients",
        admin.idToken,
        { clubId, eventId, mode: "preview", scope: "all" },
        "invalid-argument",
      );
    });
  });

  // ─── Recurring Events ──────────────────────────────────────

  describe("recurring events (future scope)", () => {
    it("should sync multiple future occurrences when scope=future", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      // Create a recurring event with 4 weekly occurrences
      const recurResult = await callFunction(
        "createRecurringEvent",
        admin.idToken,
        {
          clubId,
          clubName: "Sync Club",
          eventType: "training",
          title: "Weekly Training",
          startDate: futureDate(7),
          startTime: futureISO(7, 18),
          endDate: futureDate(7),
          endTime: futureISO(7, 20),
          targetScope: {
            level: "group",
            groupId,
            groupName: "Sync Group",
            clubId,
            clubName: "Sync Club",
          },
          createdBy: admin.uid,
          createdByName: "Sync Admin",
          frequency: "weekly",
          endType: "occurrences",
          occurrenceCount: 4,
        },
      );

      expect(recurResult.success).toBe(true);
      expect(recurResult.recurringEventId).toBeDefined();
      const eventIds: string[] =
        recurResult.eventIds || recurResult.occurrenceEventIds || [];
      expect(eventIds.length).toBeGreaterThanOrEqual(2);

      // Add a new member after recurring events were created
      const newMember = await createFullTestUser({
        email: "recurring-new@test.com",
        displayName: "Recurring New",
      });
      await addMemberToGroup(clubId, groupId, {
        userId: newMember.uid,
        name: "Recurring New",
        email: "recurring-new@test.com",
        roles: ["player"],
      });

      // Sync from the first occurrence with future scope
      const syncResult = await callFunction(
        "syncEventRecipients",
        admin.idToken,
        {
          clubId,
          eventId: eventIds[0],
          mode: "confirm",
          scope: "future",
          recurringEventId: recurResult.recurringEventId,
        },
      );

      expect(syncResult.success).toBe(true);
      expect(syncResult.added.length).toBeGreaterThanOrEqual(1);
      expect(syncResult.updatedOccurrences).toBeGreaterThanOrEqual(2);

      // Verify new member was added to multiple occurrences
      for (const eid of eventIds.slice(0, 2)) {
        const event = await getDocument(`clubs/${clubId}/events/${eid}`);
        if (!event) continue;
        const responseUserIds = event.responses.map((r: any) => r.userId);
        expect(responseUserIds).toContain(newMember.uid);
      }
    });

    it("should sync only single occurrence when scope=single", async () => {
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const recurResult = await callFunction(
        "createRecurringEvent",
        admin.idToken,
        {
          clubId,
          clubName: "Sync Club",
          eventType: "training",
          title: "Weekly Session",
          startDate: futureDate(7),
          startTime: futureISO(7, 18),
          endDate: futureDate(7),
          endTime: futureISO(7, 20),
          targetScope: {
            level: "group",
            groupId,
            groupName: "Sync Group",
            clubId,
            clubName: "Sync Club",
          },
          createdBy: admin.uid,
          createdByName: "Sync Admin",
          frequency: "weekly",
          endType: "occurrences",
          occurrenceCount: 3,
        },
      );

      expect(recurResult.success).toBe(true);
      const eventIds: string[] =
        recurResult.eventIds || recurResult.occurrenceEventIds || [];
      expect(eventIds.length).toBeGreaterThanOrEqual(2);

      // Add a new member
      const newMember = await createFullTestUser({
        email: "single-scope@test.com",
        displayName: "Single Scope",
      });
      await addMemberToGroup(clubId, groupId, {
        userId: newMember.uid,
        name: "Single Scope",
        email: "single-scope@test.com",
        roles: ["player"],
      });

      // Sync just the first occurrence
      const syncResult = await callFunction(
        "syncEventRecipients",
        admin.idToken,
        {
          clubId,
          eventId: eventIds[0],
          mode: "confirm",
          scope: "single",
        },
      );

      expect(syncResult.success).toBe(true);
      expect(syncResult.added.length).toBeGreaterThanOrEqual(1);

      // The first occurrence should have the new member
      const firstEvent = await getDocument(
        `clubs/${clubId}/events/${eventIds[0]}`,
      );
      const firstIds = firstEvent!.responses.map((r: any) => r.userId);
      expect(firstIds).toContain(newMember.uid);

      // The SECOND occurrence should NOT have the new member (single scope)
      const secondEvent = await getDocument(
        `clubs/${clubId}/events/${eventIds[1]}`,
      );
      const secondIds = secondEvent!.responses.map((r: any) => r.userId);
      expect(secondIds).not.toContain(newMember.uid);
    });
  });

  // ─── Creator Exclusion ─────────────────────────────────────

  describe("creator exclusion from sync diff", () => {
    /**
     * Helper: create a club-admin user who is NOT a member of the group,
     * then have them create an event in that group. Returns everything
     * the tests need.
     */
    async function setupNonMemberCreator() {
      // 1. Create the club-admin and club
      const clubAdmin = await createFullTestUser({
        displayName: "Club Only Admin",
      });

      const { clubId } = await callFunction("createClub", clubAdmin.idToken, {
        clubData: { name: `Creator Club ${Date.now()}` },
      });

      await seedUserDocument(clubAdmin.uid, {
        clubAccess: [
          {
            clubId,
            clubName: "Creator Club",
            role: "club-admin",
            joinedAt: new Date(),
            isActive: true,
            groupAccess: [],
          },
        ],
      });

      // 2. Create a group — the admin is auto-added as a group member
      //    but we'll create a separate player and later manually set up
      //    the group's allMembers so we control exactly who is listed.
      const { groupId } = await callFunction("createGroup", clubAdmin.idToken, {
        clubId,
        groupData: { name: "Creator Group" },
      });

      // 3. Create a player who IS a group member
      const player = await createFullTestUser({
        email: "groupplayer@test.com",
        displayName: "Group Player",
      });

      await seedUserDocument(player.uid, {
        clubAccess: [
          {
            clubId,
            clubName: "Creator Club",
            role: "player",
            joinedAt: new Date(),
            isActive: true,
            groupAccess: [
              {
                groupId,
                groupName: "Creator Group",
                roles: ["player"],
                isActive: true,
              },
            ],
          },
        ],
      });

      // 4. Override allMembers so the group has ONLY the player (not the club-admin)
      const db = getFirestore();
      await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set({
        members: [
          {
            userId: player.uid,
            name: "Group Player",
            email: "groupplayer@test.com",
            roles: ["player"],
            isActive: true,
            needsGuardian: false,
          },
        ],
        memberCount: 1,
      });

      // Keep club-admin in club-level members for permission checks
      await db.doc(`clubs/${clubId}/allMembers/members`).set(
        {
          members: [
            {
              userId: clubAdmin.uid,
              name: "Club Only Admin",
              email: clubAdmin.email,
              roles: ["club-admin"],
              isActive: true,
            },
            {
              userId: player.uid,
              name: "Group Player",
              email: "groupplayer@test.com",
              roles: ["player"],
              isActive: true,
            },
          ],
          memberCount: 2,
        },
        { merge: true },
      );

      // Also give club-admin a groupAccess entry so permission checks pass
      await seedUserDocument(clubAdmin.uid, {
        clubAccess: [
          {
            clubId,
            clubName: "Creator Club",
            role: "club-admin",
            joinedAt: new Date(),
            isActive: true,
            groupAccess: [
              {
                groupId,
                groupName: "Creator Group",
                roles: ["admin"],
                isActive: true,
              },
            ],
          },
        ],
      });

      return { clubAdmin, player, clubId, groupId, db };
    }

    it("should NOT show the non-member creator as 'removed' in sync preview", async () => {
      const { clubAdmin, clubId, groupId } = await setupNonMemberCreator();

      // Club-admin (not in group) creates an event for the group
      const { eventId } = await createTestEvent(
        clubAdmin.idToken,
        clubAdmin.uid,
        clubId,
        groupId,
      );

      // Verify the event exists and creator is in invitedUserIds
      const eventDoc = await getDocument(`clubs/${clubId}/events/${eventId}`);
      expect(eventDoc!.invitedUserIds).toContain(clubAdmin.uid);

      // Sync preview — creator must NOT appear in removed[]
      const result = await callFunction(
        "syncEventRecipients",
        clubAdmin.idToken,
        { clubId, eventId, mode: "preview" },
      );

      expect(result.success).toBe(true);
      const removedUserIds = result.removed.map((r: any) => r.userId);
      expect(removedUserIds).not.toContain(clubAdmin.uid);
    });

    it("non-member creator should be in invitedUserIds but NOT in responses", async () => {
      const { clubAdmin, player, clubId, groupId } =
        await setupNonMemberCreator();

      const { eventId } = await createTestEvent(
        clubAdmin.idToken,
        clubAdmin.uid,
        clubId,
        groupId,
      );

      const eventDoc = await getDocument(`clubs/${clubId}/events/${eventId}`);

      // Creator MUST be in invitedUserIds (to view/manage the event)
      expect(eventDoc!.invitedUserIds).toContain(clubAdmin.uid);

      // Creator must NOT be in responses[] (not a group member)
      const responseUserIds = (eventDoc!.responses || []).map(
        (r: any) => r.userId,
      );
      expect(responseUserIds).not.toContain(clubAdmin.uid);

      // The actual group member (player) SHOULD be in responses
      expect(responseUserIds).toContain(player.uid);
    });

    it("group-member creator SHOULD still appear in responses normally", async () => {
      // Contrast test: a creator who IS a group member behaves normally
      const { admin, clubId, groupId } = await setupClubGroupAndAdmin();

      const { eventId } = await createTestEvent(
        admin.idToken,
        admin.uid,
        clubId,
        groupId,
      );

      const eventDoc = await getDocument(`clubs/${clubId}/events/${eventId}`);

      // Admin is a group member — should appear in both
      expect(eventDoc!.invitedUserIds).toContain(admin.uid);
      const responseUserIds = (eventDoc!.responses || []).map(
        (r: any) => r.userId,
      );
      expect(responseUserIds).toContain(admin.uid);
    });
  });
});
