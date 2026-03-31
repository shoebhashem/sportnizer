/**
 * Suite N: News Creation & Notification Verification
 *
 * Tests createNews Cloud Function:
 *  - CRUD: news document created with correct fields
 *  - Permissions: club-admin for club news, admin/coach for group news
 *  - Notifications: recipients receive notification docs in Firestore
 *  - Recipient logic: role filtering, youth→guardian redirection, creator inclusion
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
/*  Shared setup                                                       */
/* ------------------------------------------------------------------ */

/**
 * Setup: admin + club + group, admin in all member lists with clubAccess.
 * Also adds a second member (player) to the group for notification tests.
 */
async function setupNewsEnvironment(): Promise<{
  admin: TestUser;
  player: TestUser;
  clubId: string;
  groupId: string;
}> {
  const adminUser = await createFullTestUser({
    email: `admin_${Date.now()}@test.com`,
    displayName: "News Admin",
  });

  // Create club
  const { clubId } = await callFunction<{ clubId: string }>(
    "createClub",
    adminUser.idToken,
    { clubData: { name: "News Club" } },
  );

  // Seed admin clubAccess (no groupAccess yet)
  await seedUserDocument(adminUser.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "News Club",
        role: "club-admin",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [],
      },
    ],
  });

  // Create group
  const { groupId } = await callFunction<{ groupId: string }>(
    "createGroup",
    adminUser.idToken,
    { clubId, groupData: { name: "News Group" } },
  );

  const db = getFirestore();

  // Create player user
  const player = await createFullTestUser({
    email: `player_${Date.now()}@test.com`,
    displayName: "Player One",
  });
  await seedUserDocument(player.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "News Club",
        role: "player",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [
          {
            groupId,
            groupName: "News Group",
            roles: ["player"],
            joinedAt: new Date(),
          },
        ],
      },
    ],
  });

  // Seed club allMembers (admin + player)
  await db.doc(`clubs/${clubId}/allMembers/members`).set({
    members: [
      {
        userId: adminUser.uid,
        name: adminUser.displayName,
        email: adminUser.email,
        roles: ["club-admin"],
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

  // Seed group allMembers (admin + player)
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

  // Update admin's user doc with groupAccess
  await seedUserDocument(adminUser.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "News Club",
        role: "club-admin",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [
          {
            groupId,
            groupName: "News Group",
            roles: ["admin"],
            joinedAt: new Date(),
          },
        ],
      },
    ],
  });

  return { admin: adminUser, player, clubId, groupId };
}

/**
 * Helper: query all notifications for a user from Firestore.
 */
async function getUserNotifications(
  userId: string,
): Promise<Array<Record<string, any>>> {
  const db = getFirestore();
  const snapshot = await db.collection(`users/${userId}/notifications`).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("Suite N: News Creation & Notification Verification", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── News Document Creation ──────────────────────────────────

  it("TC-N1: Club admin creates club-level news → document created with correct fields", async () => {
    const { admin: adminUser, clubId } = await setupNewsEnvironment();

    const result = await callFunction<{
      success: boolean;
      newsId: string;
      totalRecipients: number;
    }>("createNews", adminUser.idToken, {
      clubId,
      clubName: "News Club",
      title: "Club Update",
      description: "Important club-wide announcement for everyone.",
      targetScope: { level: "club" },
      createdBy: adminUser.uid,
      createdByName: adminUser.displayName,
    });

    expect(result.success).toBe(true);
    expect(result.newsId).toBeDefined();
    expect(result.totalRecipients).toBeGreaterThanOrEqual(2); // admin + player

    // Verify news document in Firestore
    const newsDoc = await getDocument(`clubs/${clubId}/news/${result.newsId}`);
    expect(newsDoc).toBeDefined();
    expect(newsDoc!.title).toBe("Club Update");
    expect(newsDoc!.description).toContain("Important club-wide");
    expect(newsDoc!.targetScope.level).toBe("club");
    expect(newsDoc!.createdBy).toBe(adminUser.uid);
    expect(newsDoc!.isActive).toBe(true);
    expect(newsDoc!.recipientUserIds).toContain(adminUser.uid);
  });

  // ─── Notification Creation ───────────────────────────────────

  it("TC-N2: Club-level news sends notifications to all recipients", async () => {
    const { admin: adminUser, player, clubId } = await setupNewsEnvironment();

    const result = await callFunction<{
      success: boolean;
      newsId: string;
    }>("createNews", adminUser.idToken, {
      clubId,
      clubName: "News Club",
      title: "Notification Test",
      description: "Checking notification delivery to all club members.",
      targetScope: { level: "club" },
      createdBy: adminUser.uid,
      createdByName: adminUser.displayName,
    });

    expect(result.success).toBe(true);

    // Verify player received a notification
    const playerNotifications = await getUserNotifications(player.uid);
    const newsNotif = playerNotifications.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(newsNotif).toBeDefined();
    expect(newsNotif!.title).toContain("Notification Test");
    expect(newsNotif!.clubId).toBe(clubId);
    expect(newsNotif!.read).toBe(false);
    expect(newsNotif!.dismissed).toBe(false);
    expect(newsNotif!.sourceCollection).toBe("news");

    // Verify admin also received a notification
    const adminNotifications = await getUserNotifications(adminUser.uid);
    const adminNotif = adminNotifications.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(adminNotif).toBeDefined();
  });

  // ─── Group-level Permissions ─────────────────────────────────

  it("TC-N3: Group admin creates group-level news → success with correct scope", async () => {
    const { admin: adminUser, clubId, groupId } = await setupNewsEnvironment();

    const result = await callFunction<{
      success: boolean;
      newsId: string;
    }>("createNews", adminUser.idToken, {
      clubId,
      clubName: "News Club",
      title: "Group News",
      description: "Group-specific announcement.",
      targetScope: {
        level: "group",
        groupId,
        groupName: "News Group",
      },
      createdBy: adminUser.uid,
      createdByName: adminUser.displayName,
    });

    expect(result.success).toBe(true);

    const newsDoc = await getDocument(`clubs/${clubId}/news/${result.newsId}`);
    expect(newsDoc!.targetScope.level).toBe("group");
    expect(newsDoc!.targetScope.groupId).toBe(groupId);
  });

  it("TC-N4: Group coach creates group-level news → success", async () => {
    const { clubId, groupId } = await setupNewsEnvironment();

    // Create a coach user
    const coach = await createFullTestUser({
      email: `coach_${Date.now()}@test.com`,
      displayName: "Team Coach",
    });
    await seedUserDocument(coach.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "News Club",
          role: "member",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId,
              groupName: "News Group",
              roles: ["coach"],
              joinedAt: new Date(),
            },
          ],
        },
      ],
    });

    // Add coach to group members
    const db = getFirestore();
    const gDoc = await db
      .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
      .get();
    const gMembers = gDoc.data()?.members || [];
    gMembers.push({
      userId: coach.uid,
      name: coach.displayName,
      email: coach.email,
      roles: ["coach"],
      isActive: true,
      needsGuardian: false,
      guardiansContacts: [],
    });
    await db
      .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
      .update({ members: gMembers, memberCount: gMembers.length });

    const result = await callFunction<{
      success: boolean;
      newsId: string;
    }>("createNews", coach.idToken, {
      clubId,
      clubName: "News Club",
      title: "Coach Announcement",
      description: "Announcement from the coach.",
      targetScope: {
        level: "group",
        groupId,
        groupName: "News Group",
      },
      createdBy: coach.uid,
      createdByName: coach.displayName,
    });

    expect(result.success).toBe(true);
    expect(result.newsId).toBeDefined();
  });

  // ─── Permission Denied ───────────────────────────────────────

  it("TC-N5: Regular player cannot create news → permission-denied", async () => {
    const { player, clubId } = await setupNewsEnvironment();

    await expectFunctionError(
      "createNews",
      player.idToken,
      {
        clubId,
        clubName: "News Club",
        title: "Unauthorized News",
        description: "This should fail.",
        targetScope: { level: "club" },
        createdBy: player.uid,
        createdByName: player.displayName,
      },
      "permission-denied",
    );
  });

  // ─── Validation ──────────────────────────────────────────────

  it("TC-N6: Title exceeding 100 chars → invalid-argument", async () => {
    const { admin: adminUser, clubId } = await setupNewsEnvironment();

    await expectFunctionError(
      "createNews",
      adminUser.idToken,
      {
        clubId,
        clubName: "News Club",
        title: "A".repeat(101),
        description: "Description.",
        targetScope: { level: "club" },
        createdBy: adminUser.uid,
        createdByName: adminUser.displayName,
      },
      "invalid-argument",
    );
  });

  it("TC-N7: Missing required fields → invalid-argument", async () => {
    const { admin: adminUser, clubId } = await setupNewsEnvironment();

    await expectFunctionError(
      "createNews",
      adminUser.idToken,
      {
        clubId,
        // Missing title, description, targetScope, etc.
      },
      "invalid-argument",
    );
  });

  // ─── Role Filtering ──────────────────────────────────────────

  it("TC-N8: News with role filter → only matching roles receive notifications", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();

    // Add a coach to the group
    const coach = await createFullTestUser({
      email: `coach2_${Date.now()}@test.com`,
      displayName: "Coach Two",
    });
    await seedUserDocument(coach.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "News Club",
          role: "member",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId,
              groupName: "News Group",
              roles: ["coach"],
              joinedAt: new Date(),
            },
          ],
        },
      ],
    });

    const db = getFirestore();
    const gDoc = await db
      .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
      .get();
    const gMembers = gDoc.data()?.members || [];
    gMembers.push({
      userId: coach.uid,
      name: coach.displayName,
      email: coach.email,
      roles: ["coach"],
      isActive: true,
      needsGuardian: false,
      guardiansContacts: [],
    });
    await db
      .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
      .update({ members: gMembers, memberCount: gMembers.length });

    // Create news targeting only coaches
    const result = await callFunction<{
      success: boolean;
      newsId: string;
    }>("createNews", adminUser.idToken, {
      clubId,
      clubName: "News Club",
      title: "Coach Only News",
      description: "This is only for coaches.",
      targetScope: {
        level: "group",
        groupId,
        groupName: "News Group",
      },
      roleFilter: ["coach"],
      createdBy: adminUser.uid,
      createdByName: adminUser.displayName,
    });

    expect(result.success).toBe(true);

    // Coach should receive notification
    const coachNotifs = await getUserNotifications(coach.uid);
    const coachNewsNotif = coachNotifs.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(coachNewsNotif).toBeDefined();

    // Player should NOT receive notification (doesn't have "coach" role)
    const playerNotifs = await getUserNotifications(player.uid);
    const playerNewsNotif = playerNotifs.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(playerNewsNotif).toBeUndefined();
  });

  // ─── Youth → Guardian Notification ───────────────────────────

  it("TC-N9: Youth member's guardian receives the notification instead of youth", async () => {
    const { admin: adminUser, clubId, groupId } = await setupNewsEnvironment();

    // Create guardian user
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });
    await seedUserDocument(guardian.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "News Club",
          role: "guardian",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [],
        },
      ],
    });

    // Create youth user
    const youth = await createFullTestUser({
      email: `youth_${Date.now()}@test.com`,
      displayName: "Youth Player",
    });
    await seedUserDocument(youth.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "News Club",
          role: "player-underage",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId,
              groupName: "News Group",
              roles: ["player-underage"],
              joinedAt: new Date(),
            },
          ],
        },
      ],
    });

    // Add youth to group members (needsGuardian = true, with guardian contact)
    const db = getFirestore();
    const gDoc = await db
      .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
      .get();
    const gMembers = gDoc.data()?.members || [];
    gMembers.push({
      userId: youth.uid,
      name: youth.displayName,
      email: youth.email,
      roles: ["player-underage"],
      isActive: true,
      needsGuardian: true,
      guardiansContacts: [
        {
          guardianUid: guardian.uid,
          guardianName: guardian.displayName,
          guardianEmail: guardian.email,
          relationship: "parent",
        },
      ],
    });
    await db
      .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
      .update({ members: gMembers, memberCount: gMembers.length });

    // Create group-level news
    const result = await callFunction<{
      success: boolean;
      newsId: string;
    }>("createNews", adminUser.idToken, {
      clubId,
      clubName: "News Club",
      title: "Youth Notification Test",
      description: "Guardian should get this, not the youth.",
      targetScope: {
        level: "group",
        groupId,
        groupName: "News Group",
      },
      createdBy: adminUser.uid,
      createdByName: adminUser.displayName,
    });

    expect(result.success).toBe(true);

    // Guardian SHOULD receive notification
    const guardianNotifs = await getUserNotifications(guardian.uid);
    const guardianNewsNotif = guardianNotifs.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(guardianNewsNotif).toBeDefined();

    // Youth should NOT receive notification directly
    const youthNotifs = await getUserNotifications(youth.uid);
    const youthNewsNotif = youthNotifs.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(youthNewsNotif).toBeUndefined();
  });

  // ─── Creator Inclusion ───────────────────────────────────────

  it("TC-N10: Creator is always included in recipients", async () => {
    const { admin: adminUser, clubId, groupId } = await setupNewsEnvironment();

    // Create news targeting only players (admin is not a "player")
    const result = await callFunction<{
      success: boolean;
      newsId: string;
    }>("createNews", adminUser.idToken, {
      clubId,
      clubName: "News Club",
      title: "Creator Inclusion Test",
      description:
        "Admin creates player-only news but should still be in recipients.",
      targetScope: {
        level: "group",
        groupId,
        groupName: "News Group",
      },
      roleFilter: ["player"],
      createdBy: adminUser.uid,
      createdByName: adminUser.displayName,
    });

    expect(result.success).toBe(true);

    // Verify news doc includes creator in recipientUserIds
    const newsDoc = await getDocument(`clubs/${clubId}/news/${result.newsId}`);
    expect(newsDoc!.recipientUserIds).toContain(adminUser.uid);

    // Admin should receive notification despite not having "player" role
    const adminNotifs = await getUserNotifications(adminUser.uid);
    const adminNewsNotif = adminNotifs.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(adminNewsNotif).toBeDefined();
  });

  // ─── Selected Member IDs Filtering ────────────────────────────

  it("TC-N11: News with selectedMemberIds → only selected members receive notifications", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();

    // Add a second player to the group
    const player2 = await createFullTestUser({
      email: `player2_${Date.now()}@test.com`,
      displayName: "Player Two",
    });
    await seedUserDocument(player2.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "News Club",
          role: "player",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId,
              groupName: "News Group",
              roles: ["player"],
              joinedAt: new Date(),
            },
          ],
        },
      ],
    });

    const db = getFirestore();
    const gDoc = await db
      .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
      .get();
    const gMembers = gDoc.data()?.members || [];
    gMembers.push({
      userId: player2.uid,
      name: player2.displayName,
      email: player2.email,
      roles: ["player"],
      isActive: true,
      needsGuardian: false,
      guardiansContacts: [],
    });
    await db
      .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
      .update({ members: gMembers, memberCount: gMembers.length });

    // Create news selecting only player (not player2)
    const result = await callFunction<{
      success: boolean;
      newsId: string;
    }>("createNews", adminUser.idToken, {
      clubId,
      clubName: "News Club",
      title: "Selected Members News",
      description: "Only for selected members.",
      targetScope: {
        level: "group",
        groupId,
        groupName: "News Group",
      },
      selectedMemberIds: [player.uid],
      createdBy: adminUser.uid,
      createdByName: adminUser.displayName,
    });

    expect(result.success).toBe(true);

    // Selected player should receive notification
    const playerNotifs = await getUserNotifications(player.uid);
    const playerNewsNotif = playerNotifs.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(playerNewsNotif).toBeDefined();

    // Non-selected player2 should NOT receive notification
    const player2Notifs = await getUserNotifications(player2.uid);
    const player2NewsNotif = player2Notifs.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(player2NewsNotif).toBeUndefined();

    // Creator (admin) should still receive notification
    const adminNotifs = await getUserNotifications(adminUser.uid);
    const adminNewsNotif = adminNotifs.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(adminNewsNotif).toBeDefined();
  });

  it("TC-N12: News with roleFilter + selectedMemberIds → combined filtering", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();

    // Add a coach to the group
    const coach = await createFullTestUser({
      email: `coach3_${Date.now()}@test.com`,
      displayName: "Coach Three",
    });
    await seedUserDocument(coach.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "News Club",
          role: "member",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId,
              groupName: "News Group",
              roles: ["coach"],
              joinedAt: new Date(),
            },
          ],
        },
      ],
    });

    const db = getFirestore();
    const gDoc = await db
      .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
      .get();
    const gMembers = gDoc.data()?.members || [];
    gMembers.push({
      userId: coach.uid,
      name: coach.displayName,
      email: coach.email,
      roles: ["coach"],
      isActive: true,
      needsGuardian: false,
      guardiansContacts: [],
    });
    await db
      .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
      .update({ members: gMembers, memberCount: gMembers.length });

    // Create news with roleFilter=["player","coach"] AND selectedMemberIds=[player.uid]
    // This should first filter to players + coaches, then narrow to only player
    const result = await callFunction<{
      success: boolean;
      newsId: string;
    }>("createNews", adminUser.idToken, {
      clubId,
      clubName: "News Club",
      title: "Combined Filter News",
      description: "Role filter plus selected members.",
      targetScope: {
        level: "group",
        groupId,
        groupName: "News Group",
      },
      roleFilter: ["player", "coach"],
      selectedMemberIds: [player.uid],
      createdBy: adminUser.uid,
      createdByName: adminUser.displayName,
    });

    expect(result.success).toBe(true);

    // Selected player (matches role + selection) should receive notification
    const playerNotifs = await getUserNotifications(player.uid);
    const playerNewsNotif = playerNotifs.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(playerNewsNotif).toBeDefined();

    // Coach matches role but NOT in selectedMemberIds → should NOT receive
    const coachNotifs = await getUserNotifications(coach.uid);
    const coachNewsNotif = coachNotifs.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(coachNewsNotif).toBeUndefined();

    // Creator (admin) should still receive notification
    const adminNotifs = await getUserNotifications(adminUser.uid);
    const adminNewsNotif = adminNotifs.find(
      (n) => n.type === "news" && n.sourceId === result.newsId,
    );
    expect(adminNewsNotif).toBeDefined();
  });
});
