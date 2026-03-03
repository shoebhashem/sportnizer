/**
 * Club Lifecycle Integration Tests
 *
 * Tests: createClub, getClub, updateClub, deleteClub
 * Runs against Firebase Emulators.
 */

import {
    callFunction,
    clearAll,
    createFullTestUser,
    documentExists,
    expectFunctionError,
    getDocument,
    seedUserDocument,
} from "./helpers";

describe("Club Lifecycle", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── createClub ──────────────────────────────────────────────

  describe("createClub", () => {
    it("should create a club and return clubId", async () => {
      const admin = await createFullTestUser({ displayName: "Club Creator" });

      const result = await callFunction("createClub", admin.idToken, {
        clubData: { name: "Stockholm FC" },
      });

      expect(result.success).toBe(true);
      expect(result.clubId).toBeDefined();

      // Verify club document was created in Firestore
      const club = await getDocument(`clubs/${result.clubId}`);
      expect(club).toBeDefined();
      expect(club!.name).toBe("Stockholm FC");
      expect(club!.isActive).toBe(true);
      expect(club!.createdBy).toBe(admin.uid);

      // Verify allMembers doc was created
      const membersExists = await documentExists(
        `clubs/${result.clubId}/allMembers/members`,
      );
      expect(membersExists).toBe(true);

      // Verify user's activeClubsAsAdmin was incremented
      const user = await getDocument(`users/${admin.uid}`);
      expect(user!.activeClubsAsAdmin).toBe(1);
    });

    it("should reject empty club name", async () => {
      const admin = await createFullTestUser();

      await expectFunctionError(
        "createClub",
        admin.idToken,
        { clubData: { name: "   " } },
        "invalid-argument",
      );
    });

    it("should reject duplicate club names", async () => {
      const admin1 = await createFullTestUser();
      const admin2 = await createFullTestUser();

      // Create first club as admin1
      await callFunction("createClub", admin1.idToken, {
        clubData: { name: "Unique Club" },
      });

      // Try to create duplicate as admin2 (different user to avoid club-limit)
      await expectFunctionError(
        "createClub",
        admin2.idToken,
        { clubData: { name: "Unique Club" } },
        "already-exists",
      );
    });

    it("should reject unauthenticated calls", async () => {
      await expectFunctionError(
        "createClub",
        "", // no auth
        { clubData: { name: "No Auth Club" } },
        "unauthenticated",
      );
    });
  });

  // ─── getClub ─────────────────────────────────────────────────

  describe("getClub", () => {
    it("should return club data", async () => {
      const admin = await createFullTestUser();
      const { clubId } = await callFunction("createClub", admin.idToken, {
        clubData: { name: "Fetch Me Club" },
      });

      const result = await callFunction("getClub", admin.idToken, { clubId });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.name).toBe("Fetch Me Club");
    });

    it("should return not-found for nonexistent club", async () => {
      const user = await createFullTestUser();

      await expectFunctionError(
        "getClub",
        user.idToken,
        { clubId: "nonexistent-id" },
        "not-found",
      );
    });
  });

  // ─── updateClub ──────────────────────────────────────────────

  describe("updateClub", () => {
    it("should allow club admin to update club details", async () => {
      const admin = await createFullTestUser();

      // Create a club
      const { clubId } = await callFunction("createClub", admin.idToken, {
        clubData: { name: "Old Name FC" },
      });

      // Set up admin's clubAccess (createClub doesn't do this automatically)
      await seedUserDocument(admin.uid, {
        clubAccess: [
          {
            clubId,
            clubName: "Old Name FC",
            role: "club-admin",
            joinedAt: new Date(),
            isActive: true,
          },
        ],
      });

      const result = await callFunction("updateClub", admin.idToken, {
        clubId,
        clubData: {
          name: "New Name FC",
          description: "Updated description",
          sport: "Football",
        },
      });

      expect(result.success).toBe(true);

      // Verify the update
      const club = await getDocument(`clubs/${clubId}`);
      expect(club!.name).toBe("New Name FC");
      expect(club!.description).toBe("Updated description");
      expect(club!.sport).toBe("Football");
    });

    it("should reject update from non-admin (permission bug fix verification)", async () => {
      const admin = await createFullTestUser();
      const stranger = await createFullTestUser({ email: "stranger@test.com" });

      // Create club as admin
      const { clubId } = await callFunction("createClub", admin.idToken, {
        clubData: { name: "Admin Only Club" },
      });

      // Stranger has no clubAccess — should be denied
      await expectFunctionError(
        "updateClub",
        stranger.idToken,
        { clubId, clubData: { name: "Hacked Name" } },
        "permission-denied",
      );

      // Verify name was NOT changed
      const club = await getDocument(`clubs/${clubId}`);
      expect(club!.name).toBe("Admin Only Club");
    });
  });

  // ─── deleteClub ──────────────────────────────────────────────

  describe("deleteClub", () => {
    it("should soft-delete a club (30-day grace period)", async () => {
      const admin = await createFullTestUser();

      const { clubId } = await callFunction("createClub", admin.idToken, {
        clubData: { name: "Doomed Club" },
      });

      // Seed the admin as a club-admin member in allMembers
      const { getFirestore } = await import("./helpers");
      const db = getFirestore();
      await db.doc(`clubs/${clubId}/allMembers/members`).set({
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
      });

      const result = await callFunction("deleteClub", admin.idToken, {
        clubId,
      });

      expect(result.success).toBe(true);
      expect(result.gracePeriodDays).toBe(30);
      expect(result.deletionScheduledAt).toBeDefined();

      // Verify club is soft-deleted
      const club = await getDocument(`clubs/${clubId}`);
      expect(club!.isActive).toBe(false);
    });

    it("should reject deletion from non-admin", async () => {
      const admin = await createFullTestUser();
      const nonAdmin = await createFullTestUser({ email: "player@test.com" });

      const { clubId } = await callFunction("createClub", admin.idToken, {
        clubData: { name: "Protected Club" },
      });

      // Seed non-admin as a regular member
      const { getFirestore } = await import("./helpers");
      const db = getFirestore();
      await db.doc(`clubs/${clubId}/allMembers/members`).set({
        members: [
          {
            userId: nonAdmin.uid,
            name: nonAdmin.displayName,
            roles: ["player"],
            isActive: true,
          },
        ],
        memberCount: 1,
      });

      await expectFunctionError(
        "deleteClub",
        nonAdmin.idToken,
        { clubId },
        "permission-denied",
      );
    });
  });
});
