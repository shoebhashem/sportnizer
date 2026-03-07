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
  // TC-G3: Prevent duplicate guardian
  // -----------------------------------------------------------------
  it("TC-G3: should reject adding same guardian twice", async () => {
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

    // Seed youth with guardian in guardians array
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

    // --- ACTION: Try adding same guardian again ---
    await expectFunctionError(
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
      "already-exists",
    );
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
});
