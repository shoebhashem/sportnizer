/**
 * Remove Club Admin Tests
 *
 * Tests the removeClubAdmin Cloud Function:
 *   - Happy path: club-admin removes another club-admin
 *   - Sole club-admin cannot be removed
 *   - Non-admin caller rejected
 *   - Unauthenticated rejected
 *   - Target user who is not a club-admin handled gracefully
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
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

interface TestUser {
  uid: string;
  idToken: string;
  email: string;
  displayName: string;
}

/**
 * Create club, seed the creator as club-admin in allMembers + user doc.
 */
async function setupClub(): Promise<{
  admin: TestUser;
  clubId: string;
}> {
  const admin = await createFullTestUser({
    email: `admin_${Date.now()}@test.com`,
  });

  const clubResult = await callFunction<{ clubId: string }>(
    "createClub",
    admin.idToken,
    { clubData: { name: "Admin Test Club" } },
  );
  const clubId = clubResult.clubId;

  // Seed admin user doc
  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Admin Test Club",
        role: "club-admin",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [],
      },
    ],
  });

  // Seed admin in club allMembers
  const db = getFirestore();
  await db.doc(`clubs/${clubId}/allMembers/members`).set(
    {
      members: [
        {
          userId: admin.uid,
          name: admin.email,
          email: admin.email,
          roles: ["club-admin"],
          isActive: true,
        },
      ],
      memberCount: 1,
    },
    { merge: true },
  );

  return { admin, clubId };
}

/**
 * Add a second club-admin to the club.
 */
async function addClubAdmin(
  existingAdmin: TestUser,
  clubId: string,
): Promise<TestUser> {
  const newAdmin = await createFullTestUser({
    email: `clubadmin2_${Date.now()}@test.com`,
  });

  // Add to club allMembers with club-admin role
  await callFunction("addMemberToClub", existingAdmin.idToken, {
    clubId,
    memberData: {
      userId: newAdmin.uid,
      roles: ["club-admin"],
      name: newAdmin.email,
      email: newAdmin.email,
      addedBy: existingAdmin.uid,
      joinedAt: new Date().toISOString(),
    },
  });

  // Set user doc
  await seedUserDocument(newAdmin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Admin Test Club",
        role: "club-admin",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [],
      },
    ],
  });

  return newAdmin;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Remove Club Admin", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // -----------------------------------------------------------------
  // RCA-1: Happy path — remove another club-admin
  // -----------------------------------------------------------------
  it("RCA-1: should remove club-admin role from another admin", async () => {
    const { admin, clubId } = await setupClub();
    const secondAdmin = await addClubAdmin(admin, clubId);

    // Verify both are club-admins before
    const beforeMembers = await getDocument(
      `clubs/${clubId}/allMembers/members`,
    );
    const secondBefore = (beforeMembers?.members || []).find(
      (m: any) => m.userId === secondAdmin.uid,
    );
    expect(secondBefore).toBeDefined();
    expect(secondBefore.roles).toContain("club-admin");

    // Remove the second admin's club-admin role
    const result = await callFunction("removeClubAdmin", admin.idToken, {
      clubId,
      userId: secondAdmin.uid,
    });

    expect(result.success).toBe(true);

    // Verify roles updated in club allMembers
    const afterMembers = await getDocument(
      `clubs/${clubId}/allMembers/members`,
    );
    const secondAfter = (afterMembers?.members || []).find(
      (m: any) => m.userId === secondAdmin.uid,
    );
    expect(secondAfter).toBeDefined();
    expect(secondAfter.roles).not.toContain("club-admin");

    // Verify user doc updated — since secondAdmin had no other roles and no
    // group access, the function marks the entry inactive rather than downgrading.
    const userDoc = await getDocument(`users/${secondAdmin.uid}`);
    const clubEntry = (userDoc?.clubAccess || []).find(
      (c: any) => c.clubId === clubId,
    );
    expect(clubEntry).toBeDefined();
    expect(clubEntry.isActive).toBe(false);
    expect(clubEntry.inactiveSince).toBeDefined();
  });

  // -----------------------------------------------------------------
  // RCA-2: Sole club-admin cannot be removed
  // -----------------------------------------------------------------
  it("RCA-2: should reject removal of the sole club-admin", async () => {
    const { admin, clubId } = await setupClub();

    // Try to remove the only club-admin (self)
    await expectFunctionError(
      "removeClubAdmin",
      admin.idToken,
      {
        clubId,
        userId: admin.uid,
      },
      "failed-precondition",
    );

    // Verify admin is still a club-admin
    const members = await getDocument(`clubs/${clubId}/allMembers/members`);
    const adminMember = (members?.members || []).find(
      (m: any) => m.userId === admin.uid,
    );
    expect(adminMember.roles).toContain("club-admin");
  });

  // -----------------------------------------------------------------
  // RCA-3: Non-admin caller rejected
  // -----------------------------------------------------------------
  it("RCA-3: should reject non-admin caller", async () => {
    const { admin, clubId } = await setupClub();
    const secondAdmin = await addClubAdmin(admin, clubId);

    // Create a regular member (not club-admin)
    const regularMember = await createFullTestUser({
      email: `regular_${Date.now()}@test.com`,
    });
    await seedUserDocument(regularMember.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "Admin Test Club",
          role: "member",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [],
        },
      ],
    });

    // Regular member tries to remove a club-admin
    await expectFunctionError(
      "removeClubAdmin",
      regularMember.idToken,
      {
        clubId,
        userId: secondAdmin.uid,
      },
      "permission-denied",
    );
  });

  // -----------------------------------------------------------------
  // RCA-4: Unauthenticated rejected
  // -----------------------------------------------------------------
  it("RCA-4: should reject unauthenticated request", async () => {
    const { admin, clubId } = await setupClub();

    await expectFunctionError(
      "removeClubAdmin",
      "", // no auth token
      {
        clubId,
        userId: admin.uid,
      },
      "unauthenticated",
    );
  });

  // -----------------------------------------------------------------
  // RCA-5: Target user is not a club-admin
  // -----------------------------------------------------------------
  it("RCA-5: should handle gracefully when target is not a club-admin", async () => {
    const { admin, clubId } = await setupClub();

    // Create a regular member
    const regularMember = await createFullTestUser({
      email: `notadmin_${Date.now()}@test.com`,
    });

    // Add to club as regular player
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: regularMember.uid,
        roles: ["player"],
        name: regularMember.email,
        email: regularMember.email,
        addedBy: admin.uid,
        joinedAt: new Date().toISOString(),
      },
    });

    await seedUserDocument(regularMember.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "Admin Test Club",
          role: "member",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [],
        },
      ],
    });

    // Try to remove club-admin role from someone who is not a club-admin
    const result = await callFunction("removeClubAdmin", admin.idToken, {
      clubId,
      userId: regularMember.uid,
    });

    // Should return success: false (not an error, handled gracefully)
    expect(result.success).toBe(false);
  });
});
