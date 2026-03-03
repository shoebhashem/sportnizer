/**
 * Subgroup Lifecycle Integration Tests
 *
 * Tests: createSubGroup, updateSubGroup, deleteSubGroup,
 *        addMemberToSubGroup, removeMemberFromSubGroup
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

async function createClubGroupWithAdmin() {
  const admin = await createFullTestUser({ displayName: "Club Admin" });

  // Create club
  const { clubId } = await callFunction("createClub", admin.idToken, {
    clubData: { name: `Test Club ${Date.now()}` },
  });

  // Set up club admin access
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

  // Create group
  const { groupId } = await callFunction("createGroup", admin.idToken, {
    clubId,
    groupData: { name: "Main Team" },
  });

  // Seed admin as group member (needed for subgroup permissions)
  const db = getFirestore();
  await db.doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`).set({
    members: [
      {
        userId: admin.uid,
        name: admin.displayName,
        email: admin.email,
        roles: ["admin"],
        isActive: true,
      },
    ],
    memberCount: 1,
  });

  // Also seed admin in club allMembers
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

  return { admin, clubId, groupId };
}

describe("Subgroup Lifecycle", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── createSubGroup ──────────────────────────────────────────

  describe("createSubGroup", () => {
    it("should create a subgroup", async () => {
      const { admin, clubId, groupId } = await createClubGroupWithAdmin();

      const result = await callFunction("createSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "Team Alpha",
      });

      expect(result.success).toBe(true);
      expect(result.subGroupId).toBeDefined();
      expect(result.subGroupName).toBe("Team Alpha");

      // Verify subgroup document
      const subgroup = await getDocument(
        `clubs/${clubId}/groups/${groupId}/subgroups/${result.subGroupId}`,
      );
      expect(subgroup).toBeDefined();
      expect(subgroup!.name).toBe("Team Alpha");

      // Verify group's subGroups array was updated
      const group = await getDocument(`clubs/${clubId}/groups/${groupId}`);
      const subGroups = group!.subGroups || [];
      expect(subGroups.some((s: any) => s.name === "Team Alpha")).toBe(true);
    });

    it("should reject subgroup name shorter than 2 chars", async () => {
      const { admin, clubId, groupId } = await createClubGroupWithAdmin();

      const result = await callFunction("createSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "A",
      });

      // Returns { success: false, error: "..." } instead of throwing
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject duplicate subgroup names", async () => {
      const { admin, clubId, groupId } = await createClubGroupWithAdmin();

      await callFunction("createSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "Duplicated",
      });

      const result = await callFunction("createSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "Duplicated",
      });

      expect(result.success).toBe(false);
    });

    it("should reject creation from unauthorized user", async () => {
      const { clubId, groupId } = await createClubGroupWithAdmin();
      const stranger = await createFullTestUser({ email: "stranger@test.com" });

      await expectFunctionError(
        "createSubGroup",
        stranger.idToken,
        {
          uid: stranger.uid,
          clubId,
          groupId,
          subGroupName: "Unauthorized Sub",
        },
        "permission-denied",
      );
    });
  });

  // ─── updateSubGroup ──────────────────────────────────────────

  describe("updateSubGroup", () => {
    it("should update subgroup name and description", async () => {
      const { admin, clubId, groupId } = await createClubGroupWithAdmin();

      const { subGroupId } = await callFunction("createSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "Old Sub Name",
      });

      const result = await callFunction("updateSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupId,
        name: "New Sub Name",
        description: "Updated description",
      });

      expect(result.success).toBe(true);

      const subgroup = await getDocument(
        `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}`,
      );
      expect(subgroup!.name).toBe("New Sub Name");
      expect(subgroup!.description).toBe("Updated description");
    });

    it("should reject update with no fields provided", async () => {
      const { admin, clubId, groupId } = await createClubGroupWithAdmin();

      const { subGroupId } = await callFunction("createSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "No Change Sub",
      });

      const result = await callFunction("updateSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupId,
        // No name, description, or color provided
      });

      expect(result.success).toBe(false);
    });
  });

  // ─── deleteSubGroup ──────────────────────────────────────────

  describe("deleteSubGroup", () => {
    it("should delete a subgroup", async () => {
      const { admin, clubId, groupId } = await createClubGroupWithAdmin();

      const { subGroupId } = await callFunction("createSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "Deletable Sub",
      });

      const result = await callFunction("deleteSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupId,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("deleted successfully");

      // Verify subgroup document was removed
      const subgroup = await getDocument(
        `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}`,
      );
      expect(subgroup).toBeUndefined();

      // Verify removed from group's subGroups array
      const group = await getDocument(`clubs/${clubId}/groups/${groupId}`);
      const subGroups = group!.subGroups || [];
      expect(subGroups.some((s: any) => s.id === subGroupId)).toBe(false);
    });
  });

  // ─── addMemberToSubGroup & removeMemberFromSubGroup ──────────

  describe("subgroup membership", () => {
    it("should add a group member to a subgroup", async () => {
      const { admin, clubId, groupId } = await createClubGroupWithAdmin();

      // Create subgroup
      const { subGroupId } = await callFunction("createSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "Sub With Members",
      });

      // Create a player user and add them to the group members doc
      const player = await createFullTestUser({
        email: "player@test.com",
        displayName: "Test Player",
      });

      const db = getFirestore();
      const groupMembersRef = db.doc(
        `clubs/${clubId}/groups/${groupId}/allMembers/members`,
      );
      const groupMembersDoc = await groupMembersRef.get();
      const existingMembers = groupMembersDoc.data()?.members || [];
      await groupMembersRef.update({
        members: [
          ...existingMembers,
          {
            userId: player.uid,
            name: player.displayName,
            email: player.email,
            roles: ["player"],
            isActive: true,
          },
        ],
        memberCount: existingMembers.length + 1,
      });

      // Add player to subgroup
      const result = await callFunction("addMemberToSubGroup", admin.idToken, {
        clubId,
        groupId,
        subGroupId,
        userId: player.uid,
      });

      expect(result.success).toBe(true);

      // Verify player is in subgroup members
      const subMembers = await getDocument(
        `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}/allMembers/members`,
      );
      expect(subMembers).toBeDefined();
      const memberList = subMembers!.members || [];
      expect(memberList.some((m: any) => m.userId === player.uid)).toBe(true);
    });

    it("should remove a member from a subgroup", async () => {
      const { admin, clubId, groupId } = await createClubGroupWithAdmin();

      const { subGroupId } = await callFunction("createSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "Sub Remove Test",
      });

      // Add admin as a player in the group, then add to subgroup
      const player = await createFullTestUser({
        email: "removable@test.com",
        displayName: "Removable Player",
      });

      const db = getFirestore();
      const groupMembersRef = db.doc(
        `clubs/${clubId}/groups/${groupId}/allMembers/members`,
      );
      const groupMembersDoc = await groupMembersRef.get();
      const existingMembers = groupMembersDoc.data()?.members || [];
      await groupMembersRef.update({
        members: [
          ...existingMembers,
          {
            userId: player.uid,
            name: player.displayName,
            email: player.email,
            roles: ["player"],
            isActive: true,
          },
        ],
        memberCount: existingMembers.length + 1,
      });

      // Add to subgroup
      await callFunction("addMemberToSubGroup", admin.idToken, {
        clubId,
        groupId,
        subGroupId,
        userId: player.uid,
      });

      // Remove from subgroup
      const result = await callFunction("removeMemberFromSubGroup", admin.idToken, {
        clubId,
        groupId,
        subGroupId,
        userId: player.uid,
      });

      expect(result.success).toBe(true);

      // Verify player is no longer in subgroup
      const subMembers = await getDocument(
        `clubs/${clubId}/groups/${groupId}/subgroups/${subGroupId}/allMembers/members`,
      );
      const memberList = subMembers?.members || [];
      expect(memberList.some((m: any) => m.userId === player.uid)).toBe(false);
    });

    it("should reject adding a non-group-member to a subgroup", async () => {
      const { admin, clubId, groupId } = await createClubGroupWithAdmin();

      const { subGroupId } = await callFunction("createSubGroup", admin.idToken, {
        uid: admin.uid,
        clubId,
        groupId,
        subGroupName: "Strict Sub",
      });

      const outsider = await createFullTestUser({
        email: "outsider@test.com",
      });

      await expectFunctionError(
        "addMemberToSubGroup",
        admin.idToken,
        {
          clubId,
          groupId,
          subGroupId,
          userId: outsider.uid,
        },
        "not-found",
      );
    });
  });
});
