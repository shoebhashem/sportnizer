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
    fullName: player.displayName,
    email: player.email,
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

/* ================================================================== */
/*  Suite N (continued): News Comment Tests                            */
/* ================================================================== */

describe("Suite N (continued): News Comment Tests", () => {
  beforeEach(async () => {
    await clearAll();
  });

  /**
   * Helper: create a news item and return its newsId
   */
  async function createTestNews(
    adminToken: string,
    clubId: string,
    groupId: string,
    adminUid: string,
    adminName: string,
  ): Promise<string> {
    const result = await callFunction<{ success: boolean; newsId: string }>(
      "createNews",
      adminToken,
      {
        clubId,
        clubName: "News Club",
        title: "Test News for Comments",
        description: "A news item to test comments on.",
        targetScope: {
          level: "group",
          groupId,
          groupName: "News Group",
        },
        createdBy: adminUid,
        createdByName: adminName,
      },
    );
    expect(result.success).toBe(true);
    return result.newsId;
  }

  // ─── TC-N9: Recipient can add a comment ─────────────────────
  it("TC-N13: recipient can add a comment to news", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();
    const newsId = await createTestNews(
      adminUser.idToken,
      clubId,
      groupId,
      adminUser.uid,
      adminUser.displayName,
    );

    const result = await callFunction<{
      success: boolean;
      commentId: string;
    }>("addNewsComment", player.idToken, {
      newsId,
      clubId,
      text: "Great news!",
    });

    expect(result.success).toBe(true);
    expect(result.commentId).toBeDefined();

    // Verify comment in Firestore
    const commentDoc = await getDocument(
      `clubs/${clubId}/news/${newsId}/comments/${result.commentId}`,
    );
    expect(commentDoc).toBeDefined();
    expect(commentDoc!.text).toBe("Great news!");
    expect(commentDoc!.createdBy).toBe(player.uid);
    expect(commentDoc!.createdByName).toBe(player.displayName);

    // Verify commentCount incremented on news doc
    const newsDoc = await getDocument(`clubs/${clubId}/news/${newsId}`);
    expect(newsDoc!.commentCount).toBe(1);
  });

  // ─── TC-N10: Club-admin can add a comment ───────────────────
  it("TC-N14: club-admin can add a comment to news", async () => {
    const { admin: adminUser, clubId, groupId } = await setupNewsEnvironment();
    const newsId = await createTestNews(
      adminUser.idToken,
      clubId,
      groupId,
      adminUser.uid,
      adminUser.displayName,
    );

    const result = await callFunction<{
      success: boolean;
      commentId: string;
    }>("addNewsComment", adminUser.idToken, {
      newsId,
      clubId,
      text: "Admin comment",
    });

    expect(result.success).toBe(true);
    expect(result.commentId).toBeDefined();
  });

  // ─── TC-N11: Non-recipient cannot add a comment ─────────────
  it("TC-N15: non-recipient cannot add a comment", async () => {
    const { admin: adminUser, clubId, groupId } = await setupNewsEnvironment();
    const newsId = await createTestNews(
      adminUser.idToken,
      clubId,
      groupId,
      adminUser.uid,
      adminUser.displayName,
    );

    // Create outsider user (not in the group)
    const outsider = await createFullTestUser({
      email: `outsider_${Date.now()}@test.com`,
      displayName: "Outsider",
    });
    await seedUserDocument(outsider.uid, {
      clubAccess: [],
    });

    await expectFunctionError(
      "addNewsComment",
      outsider.idToken,
      {
        newsId,
        clubId,
        text: "Should fail",
      },
      "permission-denied",
    );
  });

  // ─── TC-N12: Comment text validation ────────────────────────
  it("TC-N16: rejects empty and too-long comment text", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();
    const newsId = await createTestNews(
      adminUser.idToken,
      clubId,
      groupId,
      adminUser.uid,
      adminUser.displayName,
    );

    // Empty text (whitespace only)
    await expectFunctionError(
      "addNewsComment",
      player.idToken,
      {
        newsId,
        clubId,
        text: "   ",
      },
      "invalid-argument",
    );

    // Too long (>500 chars)
    await expectFunctionError(
      "addNewsComment",
      player.idToken,
      {
        newsId,
        clubId,
        text: "x".repeat(501),
      },
      "invalid-argument",
    );
  });

  // ─── TC-N13: Comment author can delete own comment ──────────
  it("TC-N17: comment author can delete their own comment", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();
    const newsId = await createTestNews(
      adminUser.idToken,
      clubId,
      groupId,
      adminUser.uid,
      adminUser.displayName,
    );

    // Player adds a comment
    const addResult = await callFunction<{
      success: boolean;
      commentId: string;
    }>("addNewsComment", player.idToken, {
      newsId,
      clubId,
      text: "My comment",
    });
    expect(addResult.success).toBe(true);

    // Player deletes their own comment
    const deleteResult = await callFunction<{ success: boolean }>(
      "deleteNewsComment",
      player.idToken,
      {
        newsId,
        clubId,
        commentId: addResult.commentId,
      },
    );
    expect(deleteResult.success).toBe(true);

    // Verify comment is gone
    const db = getFirestore();
    const commentSnap = await db
      .doc(`clubs/${clubId}/news/${newsId}/comments/${addResult.commentId}`)
      .get();
    expect(commentSnap.exists).toBe(false);

    // Verify commentCount decremented
    const newsDoc = await getDocument(`clubs/${clubId}/news/${newsId}`);
    expect(newsDoc!.commentCount).toBe(0);
  });

  // ─── TC-N14: News creator can delete any comment ────────────
  it("TC-N18: news creator can delete any comment", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();
    const newsId = await createTestNews(
      adminUser.idToken,
      clubId,
      groupId,
      adminUser.uid,
      adminUser.displayName,
    );

    // Player adds a comment
    const addResult = await callFunction<{
      success: boolean;
      commentId: string;
    }>("addNewsComment", player.idToken, {
      newsId,
      clubId,
      text: "Player comment",
    });

    // Admin (news creator) deletes the player's comment
    const deleteResult = await callFunction<{ success: boolean }>(
      "deleteNewsComment",
      adminUser.idToken,
      {
        newsId,
        clubId,
        commentId: addResult.commentId,
      },
    );
    expect(deleteResult.success).toBe(true);
  });

  // ─── TC-N15: Club-admin can delete any comment ──────────────
  it("TC-N19: club-admin can delete any comment", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();
    const newsId = await createTestNews(
      adminUser.idToken,
      clubId,
      groupId,
      adminUser.uid,
      adminUser.displayName,
    );

    // Player adds a comment
    const addResult = await callFunction<{
      success: boolean;
      commentId: string;
    }>("addNewsComment", player.idToken, {
      newsId,
      clubId,
      text: "Player says hello",
    });

    // Admin (club-admin) deletes it
    const deleteResult = await callFunction<{ success: boolean }>(
      "deleteNewsComment",
      adminUser.idToken,
      {
        newsId,
        clubId,
        commentId: addResult.commentId,
      },
    );
    expect(deleteResult.success).toBe(true);
  });

  // ─── TC-N16: Regular player cannot delete another's comment ─
  it("TC-N20: regular player cannot delete another player's comment", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();
    const newsId = await createTestNews(
      adminUser.idToken,
      clubId,
      groupId,
      adminUser.uid,
      adminUser.displayName,
    );

    // Admin adds a comment
    const addResult = await callFunction<{
      success: boolean;
      commentId: string;
    }>("addNewsComment", adminUser.idToken, {
      newsId,
      clubId,
      text: "Admin comment",
    });

    // Player tries to delete admin's comment → should fail
    await expectFunctionError(
      "deleteNewsComment",
      player.idToken,
      {
        newsId,
        clubId,
        commentId: addResult.commentId,
      },
      "permission-denied",
    );
  });

  // ─── TC-N17: Group coach can delete comments ────────────────
  it("TC-N21: group coach can delete comments on group news", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();

    const db = getFirestore();

    // Create a coach user
    const coach = await createFullTestUser({
      email: `coach_${Date.now()}@test.com`,
      displayName: "News Coach",
    });
    await seedUserDocument(coach.uid, {
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
              roles: ["coach"],
              joinedAt: new Date(),
            },
          ],
        },
      ],
    });

    // Add coach to group allMembers
    const membersDoc = await db
      .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
      .get();
    const existingMembers = membersDoc.data()?.members || [];
    await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set({
      members: [
        ...existingMembers,
        {
          userId: coach.uid,
          name: coach.displayName,
          email: coach.email,
          roles: ["coach"],
          isActive: true,
          needsGuardian: false,
          guardiansContacts: [],
        },
      ],
      memberCount: existingMembers.length + 1,
    });

    // Also add coach to club allMembers
    const clubMembersDoc = await db
      .doc(`clubs/${clubId}/allMembers/members`)
      .get();
    const existingClubMembers = clubMembersDoc.data()?.members || [];
    await db.doc(`clubs/${clubId}/allMembers/members`).set({
      members: [
        ...existingClubMembers,
        {
          userId: coach.uid,
          name: coach.displayName,
          email: coach.email,
          roles: ["coach"],
          isActive: true,
          needsGuardian: false,
          guardiansContacts: [],
        },
      ],
      memberCount: existingClubMembers.length + 1,
    });

    // Create news as admin
    const newsId = await createTestNews(
      adminUser.idToken,
      clubId,
      groupId,
      adminUser.uid,
      adminUser.displayName,
    );

    // Player adds a comment
    const addResult = await callFunction<{
      success: boolean;
      commentId: string;
    }>("addNewsComment", player.idToken, {
      newsId,
      clubId,
      text: "Player comment to delete by coach",
    });

    // Coach deletes the player's comment → should succeed
    const deleteResult = await callFunction<{ success: boolean }>(
      "deleteNewsComment",
      coach.idToken,
      {
        newsId,
        clubId,
        commentId: addResult.commentId,
      },
    );
    expect(deleteResult.success).toBe(true);
  });
});

/* ================================================================== */
/*  Suite N (continued): News Read-By Tests                            */
/* ================================================================== */

describe("Suite N (continued): News Read-By Tests", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── TC-N22: readBy entry with userName is stored correctly ──
  it("TC-N22: readBy entry stores userName when provided", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();

    const db = getFirestore();

    // Create news via cloud function
    const result = await callFunction<{ success: boolean; newsId: string }>(
      "createNews",
      adminUser.idToken,
      {
        clubId,
        clubName: "News Club",
        title: "ReadBy Test News",
        description: "Testing readBy with userName.",
        targetScope: {
          level: "group",
          groupId,
          groupName: "News Group",
        },
        createdBy: adminUser.uid,
        createdByName: adminUser.displayName,
      },
    );
    expect(result.success).toBe(true);

    // Simulate markNewsAsRead with userName (admin SDK)
    const { FieldValue, Timestamp } = await import("firebase-admin/firestore");
    const newsRef = db.doc(`clubs/${clubId}/news/${result.newsId}`);
    await newsRef.update({
      readBy: FieldValue.arrayUnion({
        userId: player.uid,
        userName: player.displayName,
        readAt: Timestamp.now(),
      }),
      readCount: FieldValue.increment(1),
    });

    // Verify the readBy entry
    const newsDoc = await newsRef.get();
    const data = newsDoc.data()!;
    expect(data.readBy).toHaveLength(1);
    expect(data.readBy[0].userId).toBe(player.uid);
    expect(data.readBy[0].userName).toBe(player.displayName);
    expect(data.readBy[0].readAt).toBeDefined();
    expect(data.readCount).toBe(1);
  });

  // ─── TC-N23: readBy entry without userName (backward compat) ─
  it("TC-N23: readBy entry without userName remains valid (backward compat)", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();

    const db = getFirestore();

    const result = await callFunction<{ success: boolean; newsId: string }>(
      "createNews",
      adminUser.idToken,
      {
        clubId,
        clubName: "News Club",
        title: "ReadBy Compat Test",
        description: "Testing readBy without userName.",
        targetScope: {
          level: "group",
          groupId,
          groupName: "News Group",
        },
        createdBy: adminUser.uid,
        createdByName: adminUser.displayName,
      },
    );
    expect(result.success).toBe(true);

    // Simulate old-style markNewsAsRead (no userName)
    const { FieldValue, Timestamp } = await import("firebase-admin/firestore");
    const newsRef = db.doc(`clubs/${clubId}/news/${result.newsId}`);
    await newsRef.update({
      readBy: FieldValue.arrayUnion({
        userId: player.uid,
        readAt: Timestamp.now(),
      }),
      readCount: FieldValue.increment(1),
    });

    const newsDoc = await newsRef.get();
    const data = newsDoc.data()!;
    expect(data.readBy).toHaveLength(1);
    expect(data.readBy[0].userId).toBe(player.uid);
    expect(data.readBy[0].userName).toBeUndefined();
    expect(data.readBy[0].readAt).toBeDefined();
  });

  // ─── TC-N24: Multiple readBy entries sorted by readAt ────────
  it("TC-N24: multiple readers stored in readBy array", async () => {
    const {
      admin: adminUser,
      player,
      clubId,
      groupId,
    } = await setupNewsEnvironment();

    const db = getFirestore();

    const result = await callFunction<{ success: boolean; newsId: string }>(
      "createNews",
      adminUser.idToken,
      {
        clubId,
        clubName: "News Club",
        title: "Multi-ReadBy Test",
        description: "Testing multiple readers.",
        targetScope: {
          level: "group",
          groupId,
          groupName: "News Group",
        },
        createdBy: adminUser.uid,
        createdByName: adminUser.displayName,
      },
    );
    expect(result.success).toBe(true);

    const { FieldValue, Timestamp } = await import("firebase-admin/firestore");
    const newsRef = db.doc(`clubs/${clubId}/news/${result.newsId}`);

    // First reader (with userName)
    await newsRef.update({
      readBy: FieldValue.arrayUnion({
        userId: player.uid,
        userName: "Player One",
        readAt: Timestamp.fromMillis(Date.now() - 60000),
      }),
      readCount: FieldValue.increment(1),
    });

    // Second reader (admin, with userName)
    await newsRef.update({
      readBy: FieldValue.arrayUnion({
        userId: adminUser.uid,
        userName: "News Admin",
        readAt: Timestamp.now(),
      }),
      readCount: FieldValue.increment(1),
    });

    const newsDoc = await newsRef.get();
    const data = newsDoc.data()!;
    expect(data.readBy).toHaveLength(2);
    expect(data.readCount).toBe(2);

    const userIds = data.readBy.map((r: any) => r.userId);
    expect(userIds).toContain(player.uid);
    expect(userIds).toContain(adminUser.uid);

    // Both entries should have userName
    data.readBy.forEach((r: any) => {
      expect(r.userName).toBeDefined();
      expect(r.readAt).toBeDefined();
    });
  });
});
