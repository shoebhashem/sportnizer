/**
 * Group Lifecycle Integration Tests
 *
 * Tests: createGroup, getGroup, updateGroup, deleteGroup
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

// ─── Helper: create a club and set up its admin ──────────────

async function createClubWithAdmin() {
  const admin = await createFullTestUser({ displayName: "Club Admin" });

  const { clubId } = await callFunction("createClub", admin.idToken, {
    clubData: { name: `Test Club ${Date.now()}` },
  });

  // Wire up club-admin role in user doc (createClub writes clubDoc but not clubAccess)
  await seedUserDocument(admin.uid, {
    clubAccess: [
      {
        clubId,
        clubName: "Test Club",
        role: "club-admin",
        joinedAt: new Date(),
        isActive: true,
        groupAccess: [],
      },
    ],
  });

  return { admin, clubId };
}

describe("Group Lifecycle", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── createGroup ─────────────────────────────────────────────

  describe("createGroup", () => {
    it("should create a group in a club", async () => {
      const { admin, clubId } = await createClubWithAdmin();

      const result = await callFunction("createGroup", admin.idToken, {
        clubId,
        groupData: { name: "Seniors Team" },
      });

      expect(result.success).toBe(true);
      expect(result.groupId).toBeDefined();

      // Verify group document
      const group = await getDocument(
        `clubs/${clubId}/groups/${result.groupId}`,
      );
      expect(group).toBeDefined();
      expect(group!.name).toBe("Seniors Team");
      expect(group!.isActive).toBe(true);

      // Verify allMembers doc
      const membersDoc = await getDocument(
        `clubs/${clubId}/groups/${result.groupId}/allMembers/members`,
      );
      expect(membersDoc).toBeDefined();

      // Verify club's activeGroupCount was incremented
      const club = await getDocument(`clubs/${clubId}`);
      expect(club!.activeGroupCount).toBeGreaterThanOrEqual(1);
    });

    it("should reject group creation from non-admin", async () => {
      const { clubId } = await createClubWithAdmin();
      const player = await createFullTestUser({ email: "player@test.com" });

      await expectFunctionError(
        "createGroup",
        player.idToken,
        { clubId, groupData: { name: "Unauthorized Group" } },
        "permission-denied",
      );
    });

    it("should reject duplicate group names in same club", async () => {
      const { admin, clubId } = await createClubWithAdmin();

      await callFunction("createGroup", admin.idToken, {
        clubId,
        groupData: { name: "Dupes Team" },
      });

      await expectFunctionError(
        "createGroup",
        admin.idToken,
        { clubId, groupData: { name: "Dupes Team" } },
        "already-exists",
      );
    });

    it("should reject empty group name", async () => {
      const { admin, clubId } = await createClubWithAdmin();

      await expectFunctionError(
        "createGroup",
        admin.idToken,
        { clubId, groupData: { name: "" } },
        "invalid-argument",
      );
    });
  });

  // ─── getGroup ────────────────────────────────────────────────

  describe("getGroup", () => {
    it("should return group data", async () => {
      const { admin, clubId } = await createClubWithAdmin();

      const { groupId } = await callFunction("createGroup", admin.idToken, {
        clubId,
        groupData: { name: "Fetchable Group" },
      });

      const result = await callFunction("getGroup", admin.idToken, {
        clubId,
        groupId,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.name).toBe("Fetchable Group");
    });

    it("should reject nonexistent group", async () => {
      const { admin, clubId } = await createClubWithAdmin();

      await expectFunctionError(
        "getGroup",
        admin.idToken,
        { clubId, groupId: "nonexistent" },
        "not-found",
      );
    });
  });

  // ─── updateGroup ─────────────────────────────────────────────

  describe("updateGroup", () => {
    it("should allow club admin to update group", async () => {
      const { admin, clubId } = await createClubWithAdmin();

      const { groupId } = await callFunction("createGroup", admin.idToken, {
        clubId,
        groupData: { name: "Old Group Name" },
      });

      const result = await callFunction("updateGroup", admin.idToken, {
        clubId,
        groupId,
        groupData: { name: "New Group Name", description: "Updated" },
      });

      expect(result.success).toBe(true);

      const group = await getDocument(`clubs/${clubId}/groups/${groupId}`);
      expect(group!.name).toBe("New Group Name");
      expect(group!.description).toBe("Updated");
    });

    it("should allow group admin to update their group", async () => {
      const { admin, clubId } = await createClubWithAdmin();

      const { groupId } = await callFunction("createGroup", admin.idToken, {
        clubId,
        groupData: { name: "Coach Editable" },
      });

      // Create a group admin user
      const groupAdmin = await createFullTestUser({
        email: "grpadmin@test.com",
        displayName: "Group Admin",
      });
      await seedUserDocument(groupAdmin.uid, {
        clubAccess: [
          {
            clubId,
            clubName: "Test Club",
            role: "member",
            isActive: true,
            groupAccess: [
              {
                groupId,
                groupName: "Coach Editable",
                roles: ["admin"],
                isActive: true,
              },
            ],
          },
        ],
      });

      const result = await callFunction("updateGroup", groupAdmin.idToken, {
        clubId,
        groupId,
        groupData: { description: "Admin updated this" },
      });

      expect(result.success).toBe(true);

      const group = await getDocument(`clubs/${clubId}/groups/${groupId}`);
      expect(group!.description).toBe("Admin updated this");
    });

    it("should reject update from unauthorized user", async () => {
      const { admin, clubId } = await createClubWithAdmin();
      const stranger = await createFullTestUser({ email: "stranger@test.com" });

      const { groupId } = await callFunction("createGroup", admin.idToken, {
        clubId,
        groupData: { name: "Protected Group" },
      });

      await expectFunctionError(
        "updateGroup",
        stranger.idToken,
        { clubId, groupId, groupData: { name: "Hacked" } },
        "permission-denied",
      );
    });
  });

  // ─── deleteGroup ─────────────────────────────────────────────

  describe("deleteGroup", () => {
    it("should soft-delete a group", async () => {
      const { admin, clubId } = await createClubWithAdmin();

      const { groupId } = await callFunction("createGroup", admin.idToken, {
        clubId,
        groupData: { name: "Deletable Group" },
      });

      const result = await callFunction("deleteGroup", admin.idToken, {
        clubId,
        groupId,
      });

      expect(result.success).toBe(true);
      expect(result.gracePeriodDays).toBe(30);

      const group = await getDocument(`clubs/${clubId}/groups/${groupId}`);
      expect(group!.isActive).toBe(false);
    });

    it("should reject deletion from non-admin", async () => {
      const { admin, clubId } = await createClubWithAdmin();
      const player = await createFullTestUser({ email: "player@test.com" });

      const { groupId } = await callFunction("createGroup", admin.idToken, {
        clubId,
        groupData: { name: "Protected Group" },
      });

      await expectFunctionError(
        "deleteGroup",
        player.idToken,
        { clubId, groupId },
        "permission-denied",
      );
    });

    it("should cascade soft-delete to subgroups", async () => {
      const { admin, clubId } = await createClubWithAdmin();

      const { groupId } = await callFunction("createGroup", admin.idToken, {
        clubId,
        groupData: { name: "Group With Sub" },
      });

      // Seed admin as group member for subgroup creation permission
      const db = getFirestore();
      await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set({
        members: [
          {
            userId: admin.uid,
            name: admin.displayName,
            roles: ["admin"],
            isActive: true,
          },
        ],
        memberCount: 1,
      });

      // Create subgroup
      const subResult = await callFunction("createSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "Sub Team A",
      });

      expect(subResult.success).toBe(true);

      // Delete parent group
      await callFunction("deleteGroup", admin.idToken, {
        clubId,
        groupId,
      });

      // Verify subgroup is also soft-deleted
      const subgroup = await getDocument(
        `clubs/${clubId}/groups/${groupId}/subgroups/${subResult.subGroupId}`,
      );
      expect(subgroup!.isActive).toBe(false);
    });
  });
});
