/**
 * Suite G: Guardian Management Flows
 *
 * Tests addGuardianToYouth and removeGuardianFromYouth Cloud Functions:
 *   - Add guardian to existing youth member
 *   - Remove guardian from youth member
 *   - Duplicate guardian prevention
 *   - Guardian role accumulation and de-accumulation
 *   - Guardian inactivation when no dependents remain
 *   - Subgroup-level guardiansContacts cascade (add & remove)
 *   - Inactive guardian reactivation
 *   - Error handling for missing/invalid data
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
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create club + group, seed admin user doc with proper permissions.
 */
async function setupClubAndGroup(): Promise<{
  admin: TestUser;
  clubId: string;
  groupId: string;
}> {
  const admin = await createFullTestUser({
    email: `admin_${Date.now()}@test.com`,
  });

  const clubResult = await callFunction<{ clubId: string }>(
    "createClub",
    admin.idToken,
    { clubData: { name: "Test Club" } },
  );
  const clubId = clubResult.clubId;

  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Test Club",
        role: "club-admin",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [],
      },
    ],
  });

  const groupResult = await callFunction<{ groupId: string }>(
    "createGroup",
    admin.idToken,
    { clubId, groupData: { name: "Group A" } },
  );
  const groupId = groupResult.groupId;

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

  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Test Club",
        role: "club-admin",
        isActive: true,
        joinedAt: new Date(),
        groupAccess: [
          {
            groupId,
            groupName: "Group A",
            roles: ["admin"],
            joinedAt: new Date(),
          },
        ],
      },
    ],
  });

  return { admin, clubId, groupId };
}

/**
 * Create a youth member (using createYouthMemberDocument CF) and add to club + group.
 */
async function setupYouthInClubAndGroup(
  admin: TestUser,
  guardian: TestUser,
  clubId: string,
  groupId: string,
): Promise<string> {
  const youthResult = await callFunction<{ youthUid: string }>(
    "createYouthMemberDocument",
    guardian.idToken,
    {
      childName: "Youth Player",
      dateOfBirth: "2015-06-15",
      guardianUid: guardian.uid,
      guardianEmail: guardian.email,
      guardianName: "Guardian Parent",
      relationship: "parent",
    },
  );
  const youthUid = youthResult.youthUid;

  // Add youth to club
  await callFunction("addMemberToClub", admin.idToken, {
    clubId,
    memberData: {
      userId: youthUid,
      roles: ["player-underage"],
      name: "Youth Player",
      addedBy: admin.uid,
      needsGuardian: true,
      guardiansContacts: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
        },
      ],
      joinedAt: new Date().toISOString(),
    },
  });

  // Add youth to group
  await callFunction("addMemberToGroup", admin.idToken, {
    clubId,
    groupId,
    memberData: {
      userId: youthUid,
      roles: ["player-underage"],
      name: "Youth Player",
      needsGuardian: true,
      guardiansContacts: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
        },
      ],
    },
  });

  return youthUid;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Suite G: Guardian Management Flows", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // -----------------------------------------------------------------
  // TC-G1: Add guardian to existing youth (guardian NOT already in club)
  // -----------------------------------------------------------------
  it("TC-G1: should add guardian to youth and create club membership", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Create guardian user
    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });

    // Create youth and add to club+group (with initial guardian from createYouthMemberDocument)
    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Create a second guardian (not yet in club)
    const guardian2 = await createFullTestUser({
      email: `guardian2_${Date.now()}@test.com`,
      displayName: "Guardian Two",
    });

    // Seed youth user doc with guardians array and clubAccess (from createYouthMemberDocument)
    await seedUserDocument(youthUid, {
      guardians: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
          addedAt: new Date(),
          canManage: true,
        },
      ],
      clubAccess: [
        {
          clubId,
          clubName: "Test Club",
          role: "member",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId,
              groupName: "Group A",
              roles: ["player-underage"],
              joinedAt: new Date(),
            },
          ],
        },
      ],
    });

    // --- ACTION: Add second guardian to youth ---
    const result = await callFunction<{ success: boolean; message: string }>(
      "addGuardianToYouth",
      admin.idToken,
      {
        clubId,
        groupId,
        youthUid,
        guardianUid: guardian2.uid,
        guardianName: "Guardian Two",
        guardianEmail: guardian2.email,
        relationship: "aunt",
      },
    );

    expect(result.success).toBe(true);

    // VERIFY: Youth user doc has both guardians
    const youthDoc = await getDocument(`users/${youthUid}`);
    expect(youthDoc?.guardians).toHaveLength(2);
    const g2 = youthDoc?.guardians?.find(
      (g: any) => g.guardianUid === guardian2.uid,
    );
    expect(g2).toBeDefined();
    expect(g2.relationship).toBe("aunt");

    // VERIFY: Club member has guardian2 in guardiansContacts
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const youthClubMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthClubMember).toBeDefined();
    const clubGuardians = youthClubMember?.guardiansContacts || [];
    expect(
      clubGuardians.some((g: any) => g.guardianUid === guardian2.uid),
    ).toBe(true);

    // VERIFY: Group member has guardian2 in guardiansContacts
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const youthGroupMember = (groupMembers?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthGroupMember).toBeDefined();
    const groupGuardians = youthGroupMember?.guardiansContacts || [];
    expect(
      groupGuardians.some((g: any) => g.guardianUid === guardian2.uid),
    ).toBe(true);

    // VERIFY: Guardian2 user doc has dependent
    const g2Doc = await getDocument(`users/${guardian2.uid}`);
    expect(g2Doc?.dependents).toBeDefined();
    expect(g2Doc?.dependents?.length).toBeGreaterThanOrEqual(1);
    const dep = g2Doc?.dependents?.find((d: any) => d.uid === youthUid);
    expect(dep).toBeDefined();

    // VERIFY: Guardian2 has club membership with guardian role
    const g2ClubMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === guardian2.uid,
    );
    expect(g2ClubMember).toBeDefined();
    expect(g2ClubMember.roles).toContain("guardian");

    // VERIFY: Guardian2 user doc has clubAccess with this club
    const g2ClubAccess = g2Doc?.clubAccess || [];
    const g2ClubEntry = g2ClubAccess.find((ca: any) => ca.clubId === clubId);
    expect(g2ClubEntry).toBeDefined();
    expect(g2ClubEntry.role).toBe("member");
  });

  // -----------------------------------------------------------------
  // TC-G2: Add guardian who is already in club (role accumulation)
  // -----------------------------------------------------------------
  it("TC-G2: should accumulate guardian role for existing club member", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Add guardian as a regular player first
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: guardian.uid,
        roles: ["player"],
        name: guardian.email,
        email: guardian.email,
        addedBy: admin.uid,
        joinedAt: new Date().toISOString(),
      },
    });

    // Seed youth user doc
    await seedUserDocument(youthUid, {
      guardians: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
          addedAt: new Date(),
          canManage: true,
        },
      ],
    });

    // Create a second guardian who is already a player in the club
    const guardian2 = await createFullTestUser({
      email: `guardian2_${Date.now()}@test.com`,
      displayName: "Guardian Two",
    });

    // Add guardian2 as player to club first
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: guardian2.uid,
        roles: ["player"],
        name: guardian2.email,
        email: guardian2.email,
        addedBy: admin.uid,
        joinedAt: new Date().toISOString(),
      },
    });

    // --- ACTION: Add guardian2 to youth (should accumulate role) ---
    const result = await callFunction<{ success: boolean }>(
      "addGuardianToYouth",
      admin.idToken,
      {
        clubId,
        groupId,
        youthUid,
        guardianUid: guardian2.uid,
        guardianName: "Guardian Two",
        guardianEmail: guardian2.email,
        relationship: "uncle",
      },
    );

    expect(result.success).toBe(true);

    // VERIFY: Guardian2's club member has both player AND guardian roles
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const g2ClubMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === guardian2.uid,
    );
    expect(g2ClubMember).toBeDefined();
    expect(g2ClubMember.roles).toContain("player");
    expect(g2ClubMember.roles).toContain("guardian");
  });

  // -----------------------------------------------------------------
  // TC-G3: Idempotent guardian addition (same guardian, same group)
  // -----------------------------------------------------------------
  it("TC-G3: should succeed idempotently when adding same guardian to same group", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Seed youth with guardian already in guardians array
    await seedUserDocument(youthUid, {
      guardians: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
          addedAt: new Date(),
          canManage: true,
        },
      ],
    });

    // --- ACTION: Call addGuardianToYouth for same guardian + same group ---
    const result = await callFunction<{ success: boolean }>(
      "addGuardianToYouth",
      admin.idToken,
      {
        clubId,
        groupId,
        youthUid,
        guardianUid: guardian.uid,
        guardianName: "Guardian Parent",
        guardianEmail: guardian.email,
        relationship: "parent",
      },
    );

    // Should succeed (idempotent, not throw)
    expect(result.success).toBe(true);

    // Youth should still have exactly 1 guardian (no duplicate)
    const youthDoc = await getDocument(`users/${youthUid}`);
    expect(youthDoc!.guardians.length).toBe(1);
    expect(youthDoc!.guardians[0].guardianUid).toBe(guardian.uid);
  });

  // -----------------------------------------------------------------
  // TC-G4: Remove guardian from youth (basic)
  // -----------------------------------------------------------------
  it("TC-G4: should remove guardian from youth and update all docs", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Seed youth user doc with guardian
    await seedUserDocument(youthUid, {
      guardians: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
          addedAt: new Date(),
          canManage: true,
        },
      ],
    });

    // Add guardian to club with guardian role
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: guardian.uid,
        roles: ["guardian"],
        name: guardian.email,
        email: guardian.email,
        addedBy: admin.uid,
        joinedAt: new Date().toISOString(),
      },
    });

    // Seed guardian user doc with dependent
    await seedUserDocument(guardian.uid, {
      dependents: [
        {
          uid: youthUid,
          childName: "Youth Player",
          dateOfBirth: "2015-06-15",
          relationship: "parent",
          addedAt: new Date(),
          clubAccess: [{ clubId, clubName: "Test Club" }],
        },
      ],
    });

    // --- ACTION: Remove guardian ---
    const result = await callFunction<{
      success: boolean;
      guardianMarkedInactive: boolean;
    }>("removeGuardianFromYouth", admin.idToken, {
      clubId,
      groupId,
      youthUid,
      guardianUid: guardian.uid,
    });

    expect(result.success).toBe(true);

    // VERIFY: Youth user doc guardians array no longer has this guardian
    const youthDoc = await getDocument(`users/${youthUid}`);
    const remainingGuardians = (youthDoc?.guardians || []).filter(
      (g: any) => g.guardianUid === guardian.uid,
    );
    expect(remainingGuardians).toHaveLength(0);

    // VERIFY: Guardian user doc dependents no longer has this youth
    const guardianDoc = await getDocument(`users/${guardian.uid}`);
    const remainingDeps = (guardianDoc?.dependents || []).filter(
      (d: any) => d.uid === youthUid,
    );
    expect(remainingDeps).toHaveLength(0);

    // VERIFY: Club member guardiansContacts updated
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const youthClubMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    const clubGuardians = youthClubMember?.guardiansContacts || [];
    expect(clubGuardians.some((g: any) => g.guardianUid === guardian.uid)).toBe(
      false,
    );

    // VERIFY: Group member guardiansContacts updated
    const groupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const youthGroupMember = (groupMembers?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    const groupGuardians = youthGroupMember?.guardiansContacts || [];
    expect(
      groupGuardians.some((g: any) => g.guardianUid === guardian.uid),
    ).toBe(false);
  });

  // -----------------------------------------------------------------
  // TC-G5: Remove guardian with only guardian role → mark inactive
  // -----------------------------------------------------------------
  it("TC-G5: should mark guardian inactive when guardian role is the only role", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Seed youth user doc
    await seedUserDocument(youthUid, {
      guardians: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
          addedAt: new Date(),
          canManage: true,
        },
      ],
    });

    // Add guardian to club with ONLY guardian role
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: guardian.uid,
        roles: ["guardian"],
        name: guardian.email,
        email: guardian.email,
        addedBy: admin.uid,
        joinedAt: new Date().toISOString(),
      },
    });

    // Seed guardian dependents + clubAccess (so removeGuardianFromYouth can mark it inactive)
    await seedUserDocument(guardian.uid, {
      dependents: [
        {
          uid: youthUid,
          childName: "Youth Player",
          dateOfBirth: "2015-06-15",
          relationship: "parent",
          addedAt: new Date(),
          clubAccess: [{ clubId, clubName: "Test Club" }],
        },
      ],
      clubAccess: [
        {
          clubId,
          clubName: "Test Club",
          role: "member",
          joinedAt: new Date(),
          lastModifiedAt: new Date(),
          groupAccess: [],
        },
      ],
    });

    // --- ACTION: Remove guardian (only role) ---
    const result = await callFunction<{
      success: boolean;
      guardianMarkedInactive: boolean;
    }>("removeGuardianFromYouth", admin.idToken, {
      clubId,
      groupId,
      youthUid,
      guardianUid: guardian.uid,
    });

    expect(result.success).toBe(true);
    expect(result.guardianMarkedInactive).toBe(true);

    // VERIFY: Guardian's club member is now inactive
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const guardianMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === guardian.uid,
    );
    expect(guardianMember).toBeDefined();
    expect(guardianMember.isActive).toBe(false);

    // VERIFY: Guardian's clubAccess entry is marked inactive (NOT deleted)
    const guardianDoc = await getDocument(`users/${guardian.uid}`);
    const clubAccessEntry = (guardianDoc?.clubAccess || []).find(
      (ca: any) => ca.clubId === clubId,
    );
    expect(clubAccessEntry).toBeDefined();
    expect(clubAccessEntry.isActive).toBe(false);
    expect(clubAccessEntry.inactiveSince).toBeDefined();
    expect(clubAccessEntry.scheduledForDeletion).toBeDefined();
  });

  // -----------------------------------------------------------------
  // TC-G6: Remove one guardian role but keep other roles
  // -----------------------------------------------------------------
  it("TC-G6: should de-accumulate guardian role while keeping player role", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Seed youth user doc
    await seedUserDocument(youthUid, {
      guardians: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
          addedAt: new Date(),
          canManage: true,
        },
      ],
    });

    // Add guardian to club with BOTH player and guardian roles
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: guardian.uid,
        roles: ["player", "guardian"],
        name: guardian.email,
        email: guardian.email,
        addedBy: admin.uid,
        joinedAt: new Date().toISOString(),
      },
    });

    // Seed guardian dependents
    await seedUserDocument(guardian.uid, {
      dependents: [
        {
          uid: youthUid,
          childName: "Youth Player",
          dateOfBirth: "2015-06-15",
          relationship: "parent",
          addedAt: new Date(),
          clubAccess: [{ clubId, clubName: "Test Club" }],
        },
      ],
    });

    // --- ACTION: Remove guardian ---
    const result = await callFunction<{
      success: boolean;
      guardianMarkedInactive: boolean;
    }>("removeGuardianFromYouth", admin.idToken, {
      clubId,
      groupId,
      youthUid,
      guardianUid: guardian.uid,
    });

    expect(result.success).toBe(true);
    expect(result.guardianMarkedInactive).toBe(false);

    // VERIFY: Guardian's club member still active with player role
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const guardianMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === guardian.uid,
    );
    expect(guardianMember).toBeDefined();
    expect(guardianMember.roles).toContain("player");
    expect(guardianMember.roles).not.toContain("guardian");
    // Should still be active since player role remains
    expect(guardianMember.isActive).not.toBe(false);
  });

  // -----------------------------------------------------------------
  // TC-G7: Error — missing required fields
  // -----------------------------------------------------------------
  it("TC-G7: should reject addGuardianToYouth with missing fields", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    await expectFunctionError(
      "addGuardianToYouth",
      admin.idToken,
      {
        clubId,
        groupId,
        // Missing youthUid, guardianUid, etc.
      },
      "invalid-argument",
    );
  });

  // -----------------------------------------------------------------
  // TC-G8: Error — youth not found
  // -----------------------------------------------------------------
  it("TC-G8: should reject addGuardianToYouth when youth does not exist", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    await expectFunctionError(
      "addGuardianToYouth",
      admin.idToken,
      {
        clubId,
        groupId,
        youthUid: "nonexistent-youth-uid",
        guardianUid: "some-guardian-uid",
        guardianName: "Guardian",
        guardianEmail: "guardian@test.com",
        relationship: "parent",
      },
      "not-found",
    );
  });

  // -----------------------------------------------------------------
  // TC-G9: Error — removeGuardianFromYouth with missing fields
  // -----------------------------------------------------------------
  it("TC-G9: should reject removeGuardianFromYouth with missing fields", async () => {
    const { admin } = await setupClubAndGroup();

    await expectFunctionError(
      "removeGuardianFromYouth",
      admin.idToken,
      {
        // Missing all fields
      },
      "invalid-argument",
    );
  });

  // -----------------------------------------------------------------
  // TC-G10: Add then remove guardian (full roundtrip)
  // -----------------------------------------------------------------
  it("TC-G10: should complete full add-then-remove guardian roundtrip", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Seed youth user doc with first guardian
    await seedUserDocument(youthUid, {
      guardians: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
          addedAt: new Date(),
          canManage: true,
        },
      ],
    });

    // Create a new guardian
    const guardian2 = await createFullTestUser({
      email: `guardian2_${Date.now()}@test.com`,
      displayName: "Second Guardian",
    });

    // --- ACTION 1: Add guardian2 ---
    const addResult = await callFunction<{ success: boolean }>(
      "addGuardianToYouth",
      admin.idToken,
      {
        clubId,
        groupId,
        youthUid,
        guardianUid: guardian2.uid,
        guardianName: "Second Guardian",
        guardianEmail: guardian2.email,
        relationship: "father",
      },
    );
    expect(addResult.success).toBe(true);

    // Verify guardian2 was added
    let youthDoc = await getDocument(`users/${youthUid}`);
    expect(youthDoc?.guardians?.length).toBe(2);

    // --- ACTION 2: Remove guardian2 ---
    const removeResult = await callFunction<{ success: boolean }>(
      "removeGuardianFromYouth",
      admin.idToken,
      {
        clubId,
        groupId,
        youthUid,
        guardianUid: guardian2.uid,
      },
    );
    expect(removeResult.success).toBe(true);

    // Verify guardian2 was removed
    youthDoc = await getDocument(`users/${youthUid}`);
    const remaining = (youthDoc?.guardians || []).filter(
      (g: any) => g.guardianUid === guardian2.uid,
    );
    expect(remaining).toHaveLength(0);

    // Verify original guardian still intact
    const original = (youthDoc?.guardians || []).filter(
      (g: any) => g.guardianUid === guardian.uid,
    );
    expect(original).toHaveLength(1);
  });

  // -----------------------------------------------------------------
  // TC-G11: Add guardian — subgroup-level guardiansContacts cascade
  // -----------------------------------------------------------------
  it("TC-G11: should cascade guardian contact to subgroup members", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Seed youth user doc with first guardian
    await seedUserDocument(youthUid, {
      guardians: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
          addedAt: new Date(),
          canManage: true,
        },
      ],
    });

    // Create a subgroup in the group
    const db = getFirestore();

    // Seed admin in group allMembers with admin role (needed for subgroup permission)
    await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set(
      {
        members: [
          {
            userId: admin.uid,
            name: admin.email,
            email: admin.email,
            roles: ["admin", "club-admin"],
            isActive: true,
          },
          {
            userId: youthUid,
            name: "Youth Player",
            roles: ["player-underage"],
            needsGuardian: true,
            guardiansContacts: [
              {
                guardianUid: guardian.uid,
                guardianName: "Guardian Parent",
                guardianEmail: guardian.email,
                relationship: "parent",
              },
            ],
            isActive: true,
          },
        ],
        memberCount: 2,
      },
      { merge: true },
    );

    // Update admin user doc with groupAccess for subgroup permissions
    await seedUserDocument(admin.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "Test Club",
          role: "club-admin",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId,
              groupName: "Group A",
              roles: ["admin"],
              joinedAt: new Date(),
            },
          ],
        },
      ],
    });

    const { subGroupId } = await callFunction<{ subGroupId: string }>(
      "createSubGroup",
      admin.idToken,
      {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "Sub Team",
      },
    );

    // Add youth to the subgroup
    await callFunction("addMemberToSubGroup", admin.idToken, {
      clubId,
      groupId,
      subGroupId,
      userId: youthUid,
    });

    // Verify youth is in subgroup before adding guardian
    const subgroupMembersBefore = await getDocument(
      `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}/allMembers/members`,
    );
    const youthInSubBefore = (subgroupMembersBefore?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthInSubBefore).toBeDefined();

    // Create a second guardian
    const guardian2 = await createFullTestUser({
      email: `guardian2_${Date.now()}@test.com`,
      displayName: "Guardian Two",
    });

    // --- ACTION: Add guardian2 to youth ---
    const result = await callFunction<{ success: boolean }>(
      "addGuardianToYouth",
      admin.idToken,
      {
        clubId,
        groupId,
        youthUid,
        guardianUid: guardian2.uid,
        guardianName: "Guardian Two",
        guardianEmail: guardian2.email,
        relationship: "aunt",
      },
    );
    expect(result.success).toBe(true);

    // VERIFY: Subgroup member has guardian2 in guardiansContacts
    const subgroupMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}/allMembers/members`,
    );
    const youthSubMember = (subgroupMembers?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthSubMember).toBeDefined();
    const subGuardians = youthSubMember?.guardiansContacts || [];
    expect(subGuardians.some((g: any) => g.guardianUid === guardian2.uid)).toBe(
      true,
    );
    expect(subGuardians.some((g: any) => g.guardianUid === guardian.uid)).toBe(
      true,
    );
  });

  // -----------------------------------------------------------------
  // TC-G12: Remove guardian — subgroup-level guardiansContacts cascade
  // -----------------------------------------------------------------
  it("TC-G12: should cascade guardian removal to subgroup members", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Seed youth user doc with guardian
    await seedUserDocument(youthUid, {
      guardians: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
          addedAt: new Date(),
          canManage: true,
        },
      ],
    });

    // Add guardian to club
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: guardian.uid,
        roles: ["guardian"],
        name: guardian.email,
        email: guardian.email,
        addedBy: admin.uid,
        joinedAt: new Date().toISOString(),
      },
    });

    // Seed guardian user doc with dependent
    await seedUserDocument(guardian.uid, {
      dependents: [
        {
          uid: youthUid,
          childName: "Youth Player",
          dateOfBirth: "2015-06-15",
          relationship: "parent",
          addedAt: new Date(),
          clubAccess: [{ clubId, clubName: "Test Club" }],
        },
      ],
    });

    // Create subgroup and add youth to it
    const db = getFirestore();

    // Seed admin in group allMembers with admin role
    await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set(
      {
        members: [
          {
            userId: admin.uid,
            name: admin.email,
            email: admin.email,
            roles: ["admin", "club-admin"],
            isActive: true,
          },
          {
            userId: youthUid,
            name: "Youth Player",
            roles: ["player-underage"],
            needsGuardian: true,
            guardiansContacts: [
              {
                guardianUid: guardian.uid,
                guardianName: "Guardian Parent",
                guardianEmail: guardian.email,
                relationship: "parent",
              },
            ],
            isActive: true,
          },
        ],
        memberCount: 2,
      },
      { merge: true },
    );

    // Update admin user doc with groupAccess
    await seedUserDocument(admin.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "Test Club",
          role: "club-admin",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId,
              groupName: "Group A",
              roles: ["admin"],
              joinedAt: new Date(),
            },
          ],
        },
      ],
    });

    const { subGroupId } = await callFunction<{ subGroupId: string }>(
      "createSubGroup",
      admin.idToken,
      {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "Sub Team",
      },
    );

    // Add youth to subgroup
    await callFunction("addMemberToSubGroup", admin.idToken, {
      clubId,
      groupId,
      subGroupId,
      userId: youthUid,
    });

    // Verify youth is in subgroup with guardian contact
    const subBefore = await getDocument(
      `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}/allMembers/members`,
    );
    const youthBefore = (subBefore?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthBefore).toBeDefined();
    expect(
      (youthBefore?.guardiansContacts || []).some(
        (g: any) => g.guardianUid === guardian.uid,
      ),
    ).toBe(true);

    // --- ACTION: Remove guardian ---
    const result = await callFunction<{
      success: boolean;
      guardianMarkedInactive: boolean;
    }>("removeGuardianFromYouth", admin.idToken, {
      clubId,
      groupId,
      youthUid,
      guardianUid: guardian.uid,
    });
    expect(result.success).toBe(true);

    // VERIFY: Subgroup member no longer has guardian in guardiansContacts
    const subAfter = await getDocument(
      `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}/allMembers/members`,
    );
    const youthAfter = (subAfter?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthAfter).toBeDefined();
    const subGuardians = youthAfter?.guardiansContacts || [];
    expect(subGuardians.some((g: any) => g.guardianUid === guardian.uid)).toBe(
      false,
    );
  });

  // -----------------------------------------------------------------
  // TC-G13: Add guardian who is inactive in club → reactivation
  // -----------------------------------------------------------------
  it("TC-G13: should reactivate inactive guardian in club", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Seed youth user doc
    await seedUserDocument(youthUid, {
      guardians: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
          addedAt: new Date(),
          canManage: true,
        },
      ],
    });

    // Create a second guardian who was previously in the club but is now INACTIVE
    const guardian2 = await createFullTestUser({
      email: `guardian2_${Date.now()}@test.com`,
      displayName: "Guardian Two",
    });

    // Add guardian2 to club as inactive member
    const db = getFirestore();
    const clubMembersRef = db.doc(`clubs/${clubId}/allMembers/members`);
    const clubMembersDoc = await clubMembersRef.get();
    const existingMembers = clubMembersDoc.data()?.members || [];
    existingMembers.push({
      userId: guardian2.uid,
      name: "Guardian Two",
      email: guardian2.email,
      roles: ["guardian"],
      isActive: false,
      inactiveSince: new Date(),
      scheduledForDeletion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await clubMembersRef.update({
      members: existingMembers,
      memberCount: existingMembers.filter((m: any) => m.isActive !== false)
        .length,
    });

    // Also seed guardian2's user doc with an inactive clubAccess entry
    // (matches what removeGuardianFromYouth now writes)
    await seedUserDocument(guardian2.uid, {
      clubAccess: [
        {
          clubId,
          clubName: "Test Club",
          role: "member",
          joinedAt: new Date(),
          lastModifiedAt: new Date(),
          groupAccess: [],
          isActive: false,
          inactiveSince: new Date(),
          scheduledForDeletion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    // --- ACTION: Add guardian2 to youth (should reactivate) ---
    const result = await callFunction<{ success: boolean }>(
      "addGuardianToYouth",
      admin.idToken,
      {
        clubId,
        groupId,
        youthUid,
        guardianUid: guardian2.uid,
        guardianName: "Guardian Two",
        guardianEmail: guardian2.email,
        relationship: "uncle",
      },
    );
    expect(result.success).toBe(true);

    // VERIFY: Guardian2 is reactivated in club member list
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const g2ClubMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === guardian2.uid,
    );
    expect(g2ClubMember).toBeDefined();
    expect(g2ClubMember.isActive).toBe(true);
    expect(g2ClubMember.roles).toContain("guardian");
    // inactiveSince and scheduledForDeletion should be cleared
    expect(g2ClubMember.inactiveSince).toBeNull();
    expect(g2ClubMember.scheduledForDeletion).toBeNull();

    // VERIFY: Guardian2's clubAccess entry is also reactivated
    const g2UserDoc = await getDocument(`users/${guardian2.uid}`);
    expect(g2UserDoc).toBeDefined();
    const g2ClubAccess = (g2UserDoc?.clubAccess || []).find(
      (ca: any) => ca.clubId === clubId,
    );
    expect(g2ClubAccess).toBeDefined();
    expect(g2ClubAccess.isActive).toBe(true);
    expect(g2ClubAccess.inactiveSince).toBeNull();
    expect(g2ClubAccess.scheduledForDeletion).toBeNull();
  });

  // -----------------------------------------------------------------
  // TC-G14: Remove guardian not linked to youth → not-found
  // -----------------------------------------------------------------
  it("TC-G14: should reject removing a guardian not linked to youth", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Seed youth user doc with a DIFFERENT guardian (not guardian2)
    await seedUserDocument(youthUid, {
      guardians: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
          addedAt: new Date(),
          canManage: true,
        },
      ],
    });

    // Create a guardian2 who is NOT linked to the youth
    const guardian2 = await createFullTestUser({
      email: `guardian2_${Date.now()}@test.com`,
      displayName: "Unlinked Guardian",
    });

    // Seed guardian2 user doc (so it exists)
    await seedUserDocument(guardian2.uid, {
      displayName: "Unlinked Guardian",
    });

    // --- ACTION: Try to remove unlinked guardian2 from youth ---
    await expectFunctionError(
      "removeGuardianFromYouth",
      admin.idToken,
      {
        clubId,
        groupId,
        youthUid,
        guardianUid: guardian2.uid,
      },
      "not-found",
    );
  });

  // -----------------------------------------------------------------
  // TC-G15: Full guardian roundtrip — add → remove → re-add
  //         Verifies clubAccess consistency at every stage
  // -----------------------------------------------------------------
  it("TC-G15: should maintain clubAccess consistency through add/remove/re-add cycle", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await createFullTestUser({
      email: `guardian_${Date.now()}@test.com`,
      displayName: "Guardian Parent",
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Seed youth with initial guardian + clubAccess (needed by addGuardianToYouth)
    await seedUserDocument(youthUid, {
      guardians: [
        {
          guardianUid: guardian.uid,
          guardianName: "Guardian Parent",
          guardianEmail: guardian.email,
          relationship: "parent",
          addedAt: new Date(),
          canManage: true,
        },
      ],
      clubAccess: [
        {
          clubId,
          clubName: "Test Club",
          role: "member",
          joinedAt: new Date(),
          lastModifiedAt: new Date(),
          groupAccess: [{ groupId, roles: ["player-underage"] }],
        },
      ],
    });

    // Create second guardian (not in club)
    const guardian2 = await createFullTestUser({
      email: `guardian2_${Date.now()}@test.com`,
      displayName: "Guardian Two",
    });
    await seedUserDocument(guardian2.uid, {
      displayName: "Guardian Two",
    });

    // ========== PHASE 1: ADD guardian2 ==========
    const addResult1 = await callFunction<{ success: boolean }>(
      "addGuardianToYouth",
      admin.idToken,
      {
        clubId,
        groupId,
        youthUid,
        guardianUid: guardian2.uid,
        guardianName: "Guardian Two",
        guardianEmail: guardian2.email,
        relationship: "uncle",
      },
    );
    expect(addResult1.success).toBe(true);

    // Verify: guardian2 has active clubAccess
    const g2AfterAdd = await getDocument(`users/${guardian2.uid}`);
    const caAfterAdd = (g2AfterAdd?.clubAccess || []).find(
      (ca: any) => ca.clubId === clubId,
    );
    expect(caAfterAdd).toBeDefined();
    // clubAccess should NOT have isActive === false
    expect(caAfterAdd.isActive).not.toBe(false);

    // Verify: guardian2 is active in club member list
    const cm1 = await getDocument(`clubs/${clubId}/allMembers/members`);
    const g2cm1 = (cm1?.members || []).find(
      (m: any) => m.userId === guardian2.uid,
    );
    expect(g2cm1).toBeDefined();
    expect(g2cm1.isActive).not.toBe(false);
    expect(g2cm1.roles).toContain("guardian");

    // ========== PHASE 2: REMOVE guardian2 ==========
    const removeResult = await callFunction<{
      success: boolean;
      guardianMarkedInactive: boolean;
    }>("removeGuardianFromYouth", admin.idToken, {
      clubId,
      groupId,
      youthUid,
      guardianUid: guardian2.uid,
    });
    expect(removeResult.success).toBe(true);
    expect(removeResult.guardianMarkedInactive).toBe(true);

    // Verify: guardian2 clubAccess is INACTIVE (not deleted)
    const g2AfterRemove = await getDocument(`users/${guardian2.uid}`);
    const caAfterRemove = (g2AfterRemove?.clubAccess || []).find(
      (ca: any) => ca.clubId === clubId,
    );
    expect(caAfterRemove).toBeDefined(); // Entry still exists!
    expect(caAfterRemove.isActive).toBe(false);
    expect(caAfterRemove.inactiveSince).toBeDefined();

    // Verify: guardian2 is inactive in club member list
    const cm2 = await getDocument(`clubs/${clubId}/allMembers/members`);
    const g2cm2 = (cm2?.members || []).find(
      (m: any) => m.userId === guardian2.uid,
    );
    expect(g2cm2).toBeDefined();
    expect(g2cm2.isActive).toBe(false);

    // ========== PHASE 3: RE-ADD guardian2 ==========
    const addResult2 = await callFunction<{ success: boolean }>(
      "addGuardianToYouth",
      admin.idToken,
      {
        clubId,
        groupId,
        youthUid,
        guardianUid: guardian2.uid,
        guardianName: "Guardian Two",
        guardianEmail: guardian2.email,
        relationship: "uncle",
      },
    );
    expect(addResult2.success).toBe(true);

    // Verify: guardian2 clubAccess is ACTIVE again
    const g2AfterReAdd = await getDocument(`users/${guardian2.uid}`);
    const caAfterReAdd = (g2AfterReAdd?.clubAccess || []).find(
      (ca: any) => ca.clubId === clubId,
    );
    expect(caAfterReAdd).toBeDefined();
    expect(caAfterReAdd.isActive).toBe(true);
    expect(caAfterReAdd.inactiveSince).toBeNull();
    expect(caAfterReAdd.scheduledForDeletion).toBeNull();

    // Verify: guardian2 is active again in club member list
    const cm3 = await getDocument(`clubs/${clubId}/allMembers/members`);
    const g2cm3 = (cm3?.members || []).find(
      (m: any) => m.userId === guardian2.uid,
    );
    expect(g2cm3).toBeDefined();
    expect(g2cm3.isActive).toBe(true);
    expect(g2cm3.roles).toContain("guardian");
    expect(g2cm3.inactiveSince).toBeNull();
    expect(g2cm3.scheduledForDeletion).toBeNull();
  });

  // -----------------------------------------------------------------
  // TC-G16: checkExistingYouthByNameAndDob — finds existing youth
  // -----------------------------------------------------------------
  it("TC-G16: should detect existing youth by name and DOB", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Create guardian + youth
    const guardian = await createFullTestUser({
      email: `guardian_g16_${Date.now()}@test.com`,
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Update youth's clubAccess so checkExistingYouthByNameAndDob can read group info
    await seedUserDocument(youthUid, {
      clubAccess: [
        {
          clubId,
          clubName: "Test Club",
          role: "member",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId,
              groupName: "Group A",
              roles: ["player-underage"],
              joinedAt: new Date(),
              isActive: true,
            },
          ],
        },
      ],
    });

    // Call checkExistingYouthByNameAndDob with matching name + DOB
    const result = await callFunction(
      "checkExistingYouthByNameAndDob",
      admin.idToken,
      {
        childName: "Youth Player",
        dateOfBirth: "2015-06-15",
        clubId,
      },
    );

    expect(result.success).toBe(true);
    expect(result.found).toBe(true);
    expect(result.youthUid).toBe(youthUid);
    expect(result.youthName).toBe("Youth Player");
    expect(result.guardians).toBeDefined();
    expect(result.guardians.length).toBeGreaterThanOrEqual(1);
    expect(result.guardians[0].guardianName).toBe("Guardian Parent");
    expect(result.currentGroups).toBeDefined();
    expect(result.currentGroups.length).toBeGreaterThanOrEqual(1);
    expect(result.currentGroups[0].groupName).toBe("Group A");
  });

  // -----------------------------------------------------------------
  // TC-G17: checkExistingYouthByNameAndDob — no match
  // -----------------------------------------------------------------
  it("TC-G17: should return found=false when no youth matches", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Create guardian + youth with different name
    const guardian = await createFullTestUser({
      email: `guardian_g17_${Date.now()}@test.com`,
    });
    await setupYouthInClubAndGroup(admin, guardian, clubId, groupId);

    // Search with wrong name
    const result = await callFunction(
      "checkExistingYouthByNameAndDob",
      admin.idToken,
      {
        childName: "Nonexistent Child",
        dateOfBirth: "2015-06-15",
        clubId,
      },
    );

    expect(result.success).toBe(true);
    expect(result.found).toBe(false);
    expect(result.youthUid).toBeUndefined();
  });

  // -----------------------------------------------------------------
  // TC-G18: checkExistingYouthByNameAndDob — case-insensitive match
  // -----------------------------------------------------------------
  it("TC-G18: should match youth name case-insensitively", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    const guardian = await createFullTestUser({
      email: `guardian_g18_${Date.now()}@test.com`,
    });
    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Search with different casing
    const result = await callFunction(
      "checkExistingYouthByNameAndDob",
      admin.idToken,
      {
        childName: "youth player", // lowercase
        dateOfBirth: "2015-06-15",
        clubId,
      },
    );

    expect(result.success).toBe(true);
    expect(result.found).toBe(true);
    expect(result.youthUid).toBe(youthUid);
  });

  // -----------------------------------------------------------------
  // TC-G19: Full existing youth + new guardian flow (E2E)
  // -----------------------------------------------------------------
  it("TC-G19: should add existing youth to new group with new guardian via addGuardianToYouth", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Guardian 1 creates youth in Group A
    const guardian1 = await createFullTestUser({
      email: `guardian1_g19_${Date.now()}@test.com`,
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian1,
      clubId,
      groupId,
    );

    // Seed youth's user doc with clubAccess for Group A
    await seedUserDocument(youthUid, {
      clubAccess: [
        {
          clubId,
          clubName: "Test Club",
          role: "member",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId,
              groupName: "Group A",
              roles: ["player-underage"],
              joinedAt: new Date(),
              isActive: true,
            },
          ],
        },
      ],
    });

    // Seed guardian1 in club as guardian
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: guardian1.uid,
        roles: ["guardian"],
        name: "Guardian Parent",
        email: guardian1.email,
        addedBy: admin.uid,
        joinedAt: new Date().toISOString(),
        needsGuardian: false,
        guardiansContacts: [],
      },
    });

    // Update guardian1 dependents
    await callFunction("updateGuardianDependentAccess", guardian1.idToken, {
      youthUid,
      guardianUid: guardian1.uid,
    });

    // Create Group B
    const groupBResult = await callFunction<{ groupId: string }>(
      "createGroup",
      admin.idToken,
      { clubId, groupData: { name: "Group B" } },
    );
    const groupBId = groupBResult.groupId;

    // Create guardian 2 (new guardian for the same youth in Group B)
    const guardian2 = await createFullTestUser({
      email: `guardian2_g19_${Date.now()}@test.com`,
    });

    // === STEP 1: checkExistingYouthByNameAndDob detects the youth ===
    const checkResult = await callFunction(
      "checkExistingYouthByNameAndDob",
      admin.idToken,
      {
        childName: "Youth Player",
        dateOfBirth: "2015-06-15",
        clubId,
      },
    );
    expect(checkResult.found).toBe(true);
    expect(checkResult.youthUid).toBe(youthUid);

    // === STEP 2: Link guardian2 to existing youth for Group B ===
    const addGuardianResult = await callFunction<{ success: boolean }>(
      "addGuardianToYouth",
      admin.idToken,
      {
        clubId,
        groupId: groupBId,
        youthUid,
        guardianUid: guardian2.uid,
        guardianName: "Guardian Two",
        guardianEmail: guardian2.email,
        relationship: "parent",
      },
    );
    expect(addGuardianResult.success).toBe(true);

    // === STEP 3: Accumulate role in club (youth already in club) ===
    await callFunction("updateClubMemberRole", admin.idToken, {
      clubId,
      userId: youthUid,
      operation: "add",
      roleToAdd: "player-underage",
    });

    // === STEP 4: Add youth to Group B ===
    await callFunction("addMemberToGroup", admin.idToken, {
      clubId,
      groupId: groupBId,
      memberData: {
        userId: youthUid,
        roles: ["player-underage"],
        name: "Youth Player",
        needsGuardian: true,
        guardiansContacts: [
          {
            guardianUid: guardian2.uid,
            guardianName: "Guardian Two",
            guardianEmail: guardian2.email,
            relationship: "parent",
          },
        ],
      },
    });

    // === STEP 5: Update youth's group info ===
    // Note: updateClubMemberListRoles must be false because Step 3 already
    // accumulated the player-underage role in the club member list.
    await callFunction("updateUserGroupInfo", admin.idToken, {
      uid: youthUid,
      clubId,
      groupInfo: {
        groupId: groupBId,
        groupName: "Group B",
        joinedAt: new Date().toISOString(),
      },
      roles: ["player-underage"],
      operation: "add",
      updateClubMemberListRoles: false,
    });

    // === STEP 6: Update guardian2 dependent access (surgical — only Group B) ===
    await callFunction("updateGuardianDependentAccess", guardian2.idToken, {
      youthUid,
      guardianUid: guardian2.uid,
      clubId,
      groupId: groupBId,
      operation: "addGroup",
    });

    // ══════════════════════ ASSERTIONS ══════════════════════

    // 1. Youth user doc — has TWO guardians
    const youthDoc = await getDocument(`users/${youthUid}`);
    expect(youthDoc).toBeDefined();
    expect(youthDoc!.guardians.length).toBe(2);
    const g1Entry = youthDoc!.guardians.find(
      (g: any) => g.guardianUid === guardian1.uid,
    );
    const g2Entry = youthDoc!.guardians.find(
      (g: any) => g.guardianUid === guardian2.uid,
    );
    expect(g1Entry).toBeDefined();
    expect(g2Entry).toBeDefined();
    expect(g2Entry.guardianName).toBe("Guardian Two");

    // 2. Youth clubAccess — has Group A AND Group B
    const youthClub = youthDoc!.clubAccess.find(
      (c: any) => c.clubId === clubId,
    );
    expect(youthClub).toBeDefined();
    expect(youthClub.groupAccess.length).toBe(2);
    const groupAAccess = youthClub.groupAccess.find(
      (g: any) => g.groupId === groupId,
    );
    const groupBAccess = youthClub.groupAccess.find(
      (g: any) => g.groupId === groupBId,
    );
    expect(groupAAccess).toBeDefined();
    expect(groupBAccess).toBeDefined();

    // 3. Group B allMembers contains youth
    const groupBMembers = await getDocument(
      `clubs/${clubId}/groups/${groupBId}/allMembers/members`,
    );
    const youthInGroupB = (groupBMembers?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthInGroupB).toBeDefined();
    expect(youthInGroupB.roles).toContain("player-underage");
    expect(youthInGroupB.guardiansContacts.length).toBeGreaterThanOrEqual(1);

    // 4. Group A allMembers still has youth (untouched)
    const groupAMembers = await getDocument(
      `clubs/${clubId}/groups/${groupId}/allMembers/members`,
    );
    const youthInGroupA = (groupAMembers?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthInGroupA).toBeDefined();

    // 5. Guardian 2 has dependent entry for youth
    const g2Doc = await getDocument(`users/${guardian2.uid}`);
    expect(g2Doc).toBeDefined();
    const g2Dependent = (g2Doc!.dependents || []).find(
      (d: any) => d.uid === youthUid,
    );
    expect(g2Dependent).toBeDefined();
    expect(g2Dependent.childName).toBe("Youth Player");

    // 6. Guardian 1 is untouched — still has dependent
    const g1Doc = await getDocument(`users/${guardian1.uid}`);
    expect(g1Doc).toBeDefined();
    const g1Dependent = (g1Doc!.dependents || []).find(
      (d: any) => d.uid === youthUid,
    );
    expect(g1Dependent).toBeDefined();

    // 7. Club allMembers — contains guardian2 with "guardian" role
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const g2ClubMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === guardian2.uid,
    );
    expect(g2ClubMember).toBeDefined();
    expect(g2ClubMember.roles).toContain("guardian");

    // 8. Youth should have exactly 2 player-underage roles in club (one per group)
    const youthClubMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthClubMember).toBeDefined();
    expect(
      youthClubMember.roles.filter((r: string) => r === "player-underage")
        .length,
    ).toBe(2);

    // 9. Guardian2 should have exactly 1 guardian role in club (no duplicates)
    expect(
      g2ClubMember.roles.filter((r: string) => r === "guardian").length,
    ).toBe(1);

    // 10. Guardian 2's dependent clubAccess should ONLY contain Group B (surgical)
    const g2DepClubAccess = g2Dependent.clubAccess || [];
    const g2DepClub = g2DepClubAccess.find((c: any) => c.clubId === clubId);
    expect(g2DepClub).toBeDefined();
    expect(g2DepClub.groupAccess.length).toBe(1);
    expect(g2DepClub.groupAccess[0].groupId).toBe(groupBId);

    // 11. Guardian 1's dependent clubAccess should ONLY contain Group A (not Group B)
    const g1DepClubAccess = g1Dependent.clubAccess || [];
    const g1DepClub = g1DepClubAccess.find((c: any) => c.clubId === clubId);
    expect(g1DepClub).toBeDefined();
    expect(g1DepClub.groupAccess.length).toBe(1);
    expect(g1DepClub.groupAccess[0].groupId).toBe(groupId);
  });

  // TC-G20: Add existing guardian to an additional group for the same youth
  // -----------------------------------------------------------------
  it("TC-G20: should extend existing guardian access to additional group (no duplicate links)", async () => {
    const { admin, clubId, groupId } = await setupClubAndGroup();

    // Guardian creates youth in Group A
    const guardian = await createFullTestUser({
      email: `guardian_g20_${Date.now()}@test.com`,
    });

    const youthUid = await setupYouthInClubAndGroup(
      admin,
      guardian,
      clubId,
      groupId,
    );

    // Seed youth's user doc with clubAccess for Group A
    await seedUserDocument(youthUid, {
      clubAccess: [
        {
          clubId,
          clubName: "Test Club",
          role: "member",
          isActive: true,
          joinedAt: new Date(),
          groupAccess: [
            {
              groupId,
              groupName: "Group A",
              roles: ["player-underage"],
              joinedAt: new Date(),
              isActive: true,
            },
          ],
        },
      ],
    });

    // Add guardian to club
    await callFunction("addMemberToClub", admin.idToken, {
      clubId,
      memberData: {
        userId: guardian.uid,
        roles: ["guardian"],
        name: "Guardian Parent",
        email: guardian.email,
        addedBy: admin.uid,
        joinedAt: new Date().toISOString(),
        needsGuardian: false,
        guardiansContacts: [],
      },
    });

    // Sync guardian dependent access for Group A
    await callFunction("updateGuardianDependentAccess", guardian.idToken, {
      youthUid,
      guardianUid: guardian.uid,
      clubId,
      groupId,
      operation: "addGroup",
    });

    // Verify: guardian has 1 dependent with Group A only
    const g1DocBefore = await getDocument(`users/${guardian.uid}`);
    const depBefore = (g1DocBefore!.dependents || []).find(
      (d: any) => d.uid === youthUid,
    );
    expect(depBefore).toBeDefined();
    expect(depBefore.clubAccess[0].groupAccess.length).toBe(1);
    expect(depBefore.clubAccess[0].groupAccess[0].groupId).toBe(groupId);

    // Create Group B and add youth to it
    const groupBResult = await callFunction<{ groupId: string }>(
      "createGroup",
      admin.idToken,
      { clubId, groupData: { name: "Group B" } },
    );
    const groupBId = groupBResult.groupId;

    // Add youth to Group B member list
    await callFunction("addMemberToGroup", admin.idToken, {
      clubId,
      groupId: groupBId,
      memberData: {
        userId: youthUid,
        roles: ["player-underage"],
        name: "Youth Player",
        needsGuardian: true,
        guardiansContacts: [
          {
            guardianUid: guardian.uid,
            guardianName: "Guardian Parent",
            guardianEmail: guardian.email,
            relationship: "parent",
          },
        ],
      },
    });

    // Update youth's user doc with Group B in clubAccess
    await callFunction("updateUserGroupInfo", admin.idToken, {
      uid: youthUid,
      clubId,
      groupInfo: {
        groupId: groupBId,
        groupName: "Group B",
        joinedAt: new Date().toISOString(),
      },
      roles: ["player-underage"],
      operation: "add",
      updateClubMemberListRoles: false,
    });

    // === KEY STEP: Call addGuardianToYouth for same guardian + new group ===
    // This should NOT throw "already-exists" — it should extend access
    const result = await callFunction<{ success: boolean; message?: string }>(
      "addGuardianToYouth",
      admin.idToken,
      {
        clubId,
        groupId: groupBId,
        youthUid,
        guardianUid: guardian.uid,
        guardianName: "Guardian Parent",
        guardianEmail: guardian.email,
        relationship: "parent",
      },
    );
    expect(result.success).toBe(true);

    // ══════════════════════ ASSERTIONS ══════════════════════

    // 1. Youth guardians[] still has exactly 1 entry (no duplicate)
    const youthDoc = await getDocument(`users/${youthUid}`);
    expect(youthDoc!.guardians.length).toBe(1);
    expect(youthDoc!.guardians[0].guardianUid).toBe(guardian.uid);

    // 2. Club member guardiansContacts has exactly 1 entry (no duplicate)
    const clubMembers = await getDocument(`clubs/${clubId}/allMembers/members`);
    const youthClubMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthClubMember.guardiansContacts.length).toBe(1);

    // 3. Group B member entry has guardian in guardiansContacts
    const groupBMembers = await getDocument(
      `clubs/${clubId}/groups/${groupBId}/allMembers/members`,
    );
    const youthInGroupB = (groupBMembers?.members || []).find(
      (m: any) => m.userId === youthUid,
    );
    expect(youthInGroupB).toBeDefined();
    expect(
      youthInGroupB.guardiansContacts.some(
        (c: any) => c.guardianUid === guardian.uid,
      ),
    ).toBe(true);

    // 4. Guardian has exactly 1 "guardian" role in club (no duplicate accumulation)
    const guardianClubMember = (clubMembers?.members || []).find(
      (m: any) => m.userId === guardian.uid,
    );
    expect(guardianClubMember).toBeDefined();
    expect(
      guardianClubMember.roles.filter((r: string) => r === "guardian").length,
    ).toBe(1);

    // 5. Guardian's dependent entry now has BOTH Group A and Group B
    const gDoc = await getDocument(`users/${guardian.uid}`);
    const dep = (gDoc!.dependents || []).find((d: any) => d.uid === youthUid);
    expect(dep).toBeDefined();
    const depClub = dep.clubAccess.find((c: any) => c.clubId === clubId);
    expect(depClub).toBeDefined();
    expect(depClub.groupAccess.length).toBe(2);
    const depGroupIds = depClub.groupAccess.map((g: any) => g.groupId);
    expect(depGroupIds).toContain(groupId); // Group A
    expect(depGroupIds).toContain(groupBId); // Group B
  });
});
