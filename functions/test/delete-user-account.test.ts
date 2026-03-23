/**
 * Delete User Account Tests
 *
 * Tests the deleteUserAccount Cloud Function:
 *   - Happy path: user with no groups, no admin role, no dependents → account deleted
 *   - Blocked when user has active group memberships (reason: "has_groups")
 *   - Blocked when user is a club-admin (reason: "is_club_admin")
 *   - Blocked when user has active dependents (reason: "has_dependents")
 *   - Unauthenticated rejected
 */

import {
    callFunction,
    clearAll,
    createFullTestUser,
    documentExists,
    expectFunctionError,
    getFirestore,
    seedUserDocument
} from "./helpers";

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

interface TestUser {
  uid: string;
  idToken: string;
  email: string;
  displayName: string;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Delete User Account", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // -----------------------------------------------------------------
  // DUA-1: Happy path — clean user deleted
  // -----------------------------------------------------------------
  it("DUA-1: should delete account when user has no groups, no admin, no dependents", async () => {
    const user = await createFullTestUser({
      email: `cleanuser_${Date.now()}@test.com`,
    });

    // Ensure user doc exists with empty clubAccess
    await seedUserDocument(user.uid, {
      fullName: user.displayName,
      email: user.email,
      clubAccess: [],
      dependents: [],
    });

    // Verify user doc exists before
    const before = await documentExists(`users/${user.uid}`);
    expect(before).toBe(true);

    // Delete account
    const result = await callFunction("deleteUserAccount", user.idToken, {});

    expect(result.success).toBe(true);

    // Verify user doc deleted
    const after = await documentExists(`users/${user.uid}`);
    expect(after).toBe(false);
  });

  // -----------------------------------------------------------------
  // DUA-2: Happy path with notifications cleanup
  // -----------------------------------------------------------------
  it("DUA-2: should delete notifications subcollection on account deletion", async () => {
    const user = await createFullTestUser({
      email: `notifuser_${Date.now()}@test.com`,
    });

    await seedUserDocument(user.uid, {
      clubAccess: [],
      dependents: [],
    });

    // Seed some notifications
    const db = getFirestore();
    await db.doc(`users/${user.uid}/notifications/notif1`).set({
      title: "Test notification",
      createdAt: new Date(),
    });
    await db.doc(`users/${user.uid}/notifications/notif2`).set({
      title: "Another notification",
      createdAt: new Date(),
    });

    // Verify notifications exist
    const notifBefore = await documentExists(
      `users/${user.uid}/notifications/notif1`,
    );
    expect(notifBefore).toBe(true);

    // Delete account
    const result = await callFunction("deleteUserAccount", user.idToken, {});
    expect(result.success).toBe(true);

    // Verify user doc gone
    const userGone = await documentExists(`users/${user.uid}`);
    expect(userGone).toBe(false);
  });

  // -----------------------------------------------------------------
  // DUA-3: Blocked when user has active group memberships
  // -----------------------------------------------------------------
  it("DUA-3: should block deletion when user has active groups (reason: has_groups)", async () => {
    const user = await createFullTestUser({
      email: `hasgroups_${Date.now()}@test.com`,
    });

    await seedUserDocument(user.uid, {
      clubAccess: [
        {
          clubId: "club123",
          clubName: "Active Club",
          role: "member",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId: "group456",
              groupName: "Active Group",
              roles: ["player"],
              joinedAt: new Date(),
            },
          ],
        },
      ],
      dependents: [],
    });

    const result = await callFunction("deleteUserAccount", user.idToken, {});

    expect(result.success).toBe(false);
    expect(result.reason).toBe("has_groups");
    expect(result.activeGroups).toBeDefined();
    expect(result.activeGroups.length).toBe(1);

    // Verify user doc still exists
    const stillExists = await documentExists(`users/${user.uid}`);
    expect(stillExists).toBe(true);
  });

  // -----------------------------------------------------------------
  // DUA-4: Blocked when user is a club-admin
  // -----------------------------------------------------------------
  it("DUA-4: should block deletion when user is club-admin (reason: is_club_admin)", async () => {
    const user = await createFullTestUser({
      email: `isadmin_${Date.now()}@test.com`,
    });

    await seedUserDocument(user.uid, {
      clubAccess: [
        {
          clubId: "club789",
          clubName: "My Club",
          role: "club-admin",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [], // No active groups, but still club-admin
        },
      ],
      dependents: [],
    });

    const result = await callFunction("deleteUserAccount", user.idToken, {});

    expect(result.success).toBe(false);
    expect(result.reason).toBe("is_club_admin");
    expect(result.activeClubAdminClubs).toBeDefined();

    // Verify user doc still exists
    const stillExists = await documentExists(`users/${user.uid}`);
    expect(stillExists).toBe(true);
  });

  // -----------------------------------------------------------------
  // DUA-5: Blocked when user has active dependents
  // -----------------------------------------------------------------
  it("DUA-5: should block deletion when user has active dependents (reason: has_dependents)", async () => {
    const user = await createFullTestUser({
      email: `hasdeps_${Date.now()}@test.com`,
    });

    await seedUserDocument(user.uid, {
      clubAccess: [],
      dependents: [
        {
          uid: "youth123",
          name: "Youth Player",
          clubAccess: [
            {
              clubId: "club111",
              clubName: "Youth Club",
              isActive: true,
            },
          ],
        },
      ],
    });

    const result = await callFunction("deleteUserAccount", user.idToken, {});

    expect(result.success).toBe(false);
    expect(result.reason).toBe("has_dependents");

    // Verify user doc still exists
    const stillExists = await documentExists(`users/${user.uid}`);
    expect(stillExists).toBe(true);
  });

  // -----------------------------------------------------------------
  // DUA-6: Inactive club access and groups should not block deletion
  // -----------------------------------------------------------------
  it("DUA-6: should allow deletion when all club access is inactive", async () => {
    const user = await createFullTestUser({
      email: `inactive_${Date.now()}@test.com`,
    });

    await seedUserDocument(user.uid, {
      clubAccess: [
        {
          clubId: "oldclub",
          clubName: "Old Club",
          role: "member",
          isActive: false,
          joinedAt: new Date(),
          inactiveSince: new Date(),
          groupAccess: [],
        },
      ],
      dependents: [],
    });

    const result = await callFunction("deleteUserAccount", user.idToken, {});
    expect(result.success).toBe(true);

    const gone = await documentExists(`users/${user.uid}`);
    expect(gone).toBe(false);
  });

  // -----------------------------------------------------------------
  // DUA-7: Unauthenticated rejected
  // -----------------------------------------------------------------
  it("DUA-7: should reject unauthenticated request", async () => {
    await expectFunctionError(
      "deleteUserAccount",
      "", // no auth token
      {},
      "unauthenticated",
    );
  });

  // -----------------------------------------------------------------
  // DUA-8: Dependents with all inactive clubs should not block
  // -----------------------------------------------------------------
  it("DUA-8: should allow deletion when dependents have only inactive club access", async () => {
    const user = await createFullTestUser({
      email: `inactivedep_${Date.now()}@test.com`,
    });

    await seedUserDocument(user.uid, {
      clubAccess: [],
      dependents: [
        {
          uid: "youth456",
          name: "Former Youth",
          clubAccess: [
            {
              clubId: "club222",
              clubName: "Former Club",
              isActive: false,
            },
          ],
        },
      ],
    });

    const result = await callFunction("deleteUserAccount", user.idToken, {});
    expect(result.success).toBe(true);

    const gone = await documentExists(`users/${user.uid}`);
    expect(gone).toBe(false);
  });
});
