/**
 * Stale club access tests
 *
 * A) deleteUserAccount must not be blocked by clubAccess entries that point
 *    at clubs or groups that were deleted or are scheduled for deletion.
 * B) deleteClub deactivates the club on members' profiles, and
 *    reactivateClub restores exactly those entries.
 *
 * Runs against Firebase Emulators.
 */

import {
  callFunction,
  clearAll,
  createFullTestUser,
  documentExists,
  getDocument,
  getFirestore,
  seedClubDocument,
  seedUserDocument,
} from "./helpers";

function clubAdminEntry(clubId: string, clubName: string, groupAccess: any[] = []) {
  return {
    clubId,
    clubName,
    role: "club-admin",
    isActive: true,
    joinedAt: new Date(),
    groupAccess,
  };
}

describe("A) deleteUserAccount ignores stale club access", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("STALE-1: allows deletion when the admin's club no longer exists", async () => {
    const user = await createFullTestUser({ email: `stale1_${Date.now()}@test.com` });
    await seedUserDocument(user.uid, {
      clubAccess: [clubAdminEntry("deleted-club", "Football Test Club")],
      adminOfClubs: ["deleted-club"],
      dependents: [],
    });

    const result = await callFunction("deleteUserAccount", user.idToken, {});

    expect(result.success).toBe(true);
    expect(await documentExists(`users/${user.uid}`)).toBe(false);
  });

  it("STALE-2: allows deletion when the admin's club is scheduled for deletion", async () => {
    const user = await createFullTestUser({ email: `stale2_${Date.now()}@test.com` });
    await seedClubDocument("soft-deleted-club", { isActive: false });
    await seedUserDocument(user.uid, {
      clubAccess: [clubAdminEntry("soft-deleted-club", "Soft Deleted Club")],
      dependents: [],
    });

    const result = await callFunction("deleteUserAccount", user.idToken, {});

    expect(result.success).toBe(true);
  });

  it("STALE-3: allows deletion when a group no longer exists in a live club", async () => {
    const user = await createFullTestUser({ email: `stale3_${Date.now()}@test.com` });
    await seedClubDocument("live-club", { name: "Live Club" });
    await seedUserDocument(user.uid, {
      clubAccess: [{
        clubId: "live-club",
        clubName: "Live Club",
        role: "member",
        isActive: true,
        groupAccess: [{ groupId: "gone-group", groupName: "Gone", roles: ["player"] }],
      }],
      dependents: [],
    });

    const result = await callFunction("deleteUserAccount", user.idToken, {});

    expect(result.success).toBe(true);
  });

  it("STALE-4: still blocks when the club exists and is active", async () => {
    const user = await createFullTestUser({ email: `stale4_${Date.now()}@test.com` });
    await seedClubDocument("real-club", { name: "Real Club" });
    await seedUserDocument(user.uid, {
      clubAccess: [
        clubAdminEntry("deleted-club", "Deleted Club"),
        clubAdminEntry("real-club", "Real Club"),
      ],
      dependents: [],
    });

    const result = await callFunction("deleteUserAccount", user.idToken, {});

    expect(result.success).toBe(false);
    expect(result.reason).toBe("is_club_admin");
    // Only the live club is reported
    expect(result.activeClubAdminClubs).toEqual(["Real Club"]);
    expect(await documentExists(`users/${user.uid}`)).toBe(true);
  });

  it("STALE-5: still blocks when an active group in a live club exists", async () => {
    const user = await createFullTestUser({ email: `stale5_${Date.now()}@test.com` });
    await seedClubDocument("club-g", { name: "Club G" });
    await getFirestore().doc("clubs/club-g/groups/live-group").set({ name: "Live", isActive: true });
    await seedUserDocument(user.uid, {
      clubAccess: [{
        clubId: "club-g",
        clubName: "Club G",
        role: "member",
        isActive: true,
        groupAccess: [{ groupId: "live-group", groupName: "Live", roles: ["player"] }],
      }],
      dependents: [],
    });

    const result = await callFunction("deleteUserAccount", user.idToken, {});

    expect(result.success).toBe(false);
    expect(result.reason).toBe("has_groups");
  });
});

describe("B) club soft delete updates members' profiles", () => {
  beforeEach(async () => {
    await clearAll();
  });

  async function setUpClub() {
    const admin = await createFullTestUser({ email: `owner_${Date.now()}@test.com` });
    const member = await createFullTestUser({ email: `member_${Date.now()}@test.com` });
    const formerMember = await createFullTestUser({ email: `former_${Date.now()}@test.com` });
    const clubId = "sync-club";
    const db = getFirestore();

    await seedClubDocument(clubId, { name: "Sync Club" });
    await db.doc(`clubs/${clubId}/groups/g1`).set({ name: "G1", isActive: true });
    await db.doc(`clubs/${clubId}/allMembers/members`).set({
      members: [
        { userId: admin.uid, roles: ["club-admin"], isActive: true },
        { userId: member.uid, roles: ["player"], isActive: true },
        { userId: formerMember.uid, roles: ["player"], isActive: false },
      ],
      memberCount: 3,
    });

    await seedUserDocument(admin.uid, {
      clubAccess: [clubAdminEntry(clubId, "Sync Club")],
      adminOfClubs: [clubId],
      activeClubsAsAdmin: 1,
      dependents: [],
    });
    await seedUserDocument(member.uid, {
      clubAccess: [{
        clubId, clubName: "Sync Club", role: "member", isActive: true,
        groupAccess: [{ groupId: "g1", groupName: "G1", roles: ["player"] }],
      }],
      memberOfClubs: [clubId],
      memberOfGroups: ["g1"],
      dependents: [],
    });
    // Left the club earlier: must stay inactive even after reactivation
    await seedUserDocument(formerMember.uid, {
      clubAccess: [{
        clubId, clubName: "Sync Club", role: "member", isActive: false,
        groupAccess: [],
      }],
      dependents: [],
    });

    return { admin, member, formerMember, clubId };
  }

  it("SYNC-1: deleteClub deactivates the club on all members' profiles", async () => {
    const { admin, member, clubId } = await setUpClub();

    const result = await callFunction("deleteClub", admin.idToken, { clubId });
    expect(result.success).toBe(true);

    const adminDoc = await getDocument(`users/${admin.uid}`);
    expect(adminDoc!.clubAccess[0].isActive).toBe(false);
    expect(adminDoc!.clubAccess[0].inactiveReason).toBe("club-deletion");
    expect(adminDoc!.adminOfClubs).not.toContain(clubId);

    const memberDoc = await getDocument(`users/${member.uid}`);
    expect(memberDoc!.clubAccess[0].isActive).toBe(false);
    expect(memberDoc!.clubAccess[0].groupAccess[0].isActive).toBe(false);
    expect(memberDoc!.memberOfClubs).not.toContain(clubId);
    expect(memberDoc!.memberOfGroups).not.toContain("g1");
  });

  it("SYNC-2: the admin can delete their account right after deleting the club", async () => {
    const { admin, clubId } = await setUpClub();
    await callFunction("deleteClub", admin.idToken, { clubId });

    const result = await callFunction("deleteUserAccount", admin.idToken, {});

    expect(result.success).toBe(true);
  });

  it("SYNC-3: reactivateClub restores exactly the entries the deletion deactivated", async () => {
    const { admin, member, formerMember, clubId } = await setUpClub();
    await callFunction("deleteClub", admin.idToken, { clubId });

    const result = await callFunction("reactivateClub", admin.idToken, { clubId });
    expect(result.success).toBe(true);

    const adminDoc = await getDocument(`users/${admin.uid}`);
    expect(adminDoc!.clubAccess[0].isActive).toBe(true);
    expect(adminDoc!.clubAccess[0].inactiveReason).toBeUndefined();
    expect(adminDoc!.clubAccess[0].deletionScheduledAt).toBeUndefined();
    expect(adminDoc!.adminOfClubs).toContain(clubId);

    const memberDoc = await getDocument(`users/${member.uid}`);
    expect(memberDoc!.clubAccess[0].isActive).toBe(true);
    expect(memberDoc!.clubAccess[0].groupAccess[0].isActive).toBe(true);
    expect(memberDoc!.memberOfGroups).toContain("g1");

    // Was already inactive before the deletion: stays inactive
    const formerDoc = await getDocument(`users/${formerMember.uid}`);
    expect(formerDoc!.clubAccess[0].isActive).toBe(false);
  });
});
