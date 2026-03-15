/**
 * Permission Helpers — Pure Logic Unit Tests
 *
 * Tests for `utils/permissionHelpers.ts` — the synchronous permission layer
 * used by all app screens after the real-time listener migration.
 *
 * ZERO Firebase dependency. These run instantly — no emulators needed.
 *
 * Modules covered:
 *   - isClubAdmin
 *   - canManageClub
 *   - getUserClubRole
 *   - getGroupRoles
 *   - canManageGroup
 *   - isGroupMember
 *   - getHighestRole
 *   - getActiveClubIds
 *   - getActiveGroups
 */

import {
    canManageClub,
    canManageGroup,
    getActiveClubIds,
    getActiveGroups,
    getGroupRoles,
    getHighestRole,
    getUserClubRole,
    isClubAdmin,
    isGroupMember,
} from "../../utils/permissionHelpers";

// ─── Test Fixtures ───────────────────────────────────────────

/** Minimal UserProfile with one active club-admin membership */
function makeClubAdmin(clubId: string) {
  return {
    uid: "admin-uid",
    email: "admin@test.com",
    displayName: "Admin",
    clubAccess: [
      {
        clubId,
        clubName: "Test Club",
        role: "club-admin" as const,
        isActive: true,
        groupAccess: [],
      },
    ],
  };
}

/** Regular member (not admin) in the given club */
function makeMember(clubId: string) {
  return {
    uid: "member-uid",
    email: "member@test.com",
    displayName: "Member",
    clubAccess: [
      {
        clubId,
        clubName: "Test Club",
        role: "member" as const,
        isActive: true,
        groupAccess: [],
      },
    ],
  };
}

/** Member with group-level roles */
function makeGroupUser(
  clubId: string,
  groupId: string,
  roles: string[],
  opts?: {
    clubRole?: "club-admin" | "member";
    groupActive?: boolean;
    clubActive?: boolean;
  },
) {
  return {
    uid: "group-user-uid",
    email: "player@test.com",
    displayName: "Player",
    clubAccess: [
      {
        clubId,
        clubName: "Test Club",
        role: (opts?.clubRole ?? "member") as "club-admin" | "member",
        isActive: opts?.clubActive !== false,
        groupAccess: [
          {
            groupId,
            groupName: "Test Group",
            roles,
            isActive: opts?.groupActive !== false,
          },
        ],
      },
    ],
  };
}

/** Multi-club, multi-group profile */
function makeComplexProfile() {
  return {
    uid: "complex-uid",
    email: "complex@test.com",
    displayName: "Complex User",
    clubAccess: [
      {
        clubId: "club-a",
        clubName: "Club A",
        role: "club-admin" as const,
        isActive: true,
        groupAccess: [
          {
            groupId: "group-a1",
            groupName: "Group A1",
            roles: ["admin"],
            isActive: true,
          },
          {
            groupId: "group-a2",
            groupName: "Group A2",
            roles: ["player"],
            isActive: true,
          },
        ],
      },
      {
        clubId: "club-b",
        clubName: "Club B",
        role: "member" as const,
        isActive: true,
        groupAccess: [
          {
            groupId: "group-b1",
            groupName: "Group B1",
            roles: ["coach", "player"],
            isActive: true,
          },
          {
            groupId: "group-b2",
            groupName: "Group B2",
            roles: ["player-underage"],
            isActive: false,
          },
        ],
      },
      {
        clubId: "club-c",
        clubName: "Club C",
        role: "member" as const,
        isActive: false,
        groupAccess: [],
      },
    ],
  };
}

// ─── isClubAdmin ─────────────────────────────────────────────

describe("isClubAdmin", () => {
  it("should return false for null userProfile", () => {
    expect(isClubAdmin(null, "club-1")).toBe(false);
  });

  it("should return false for undefined userProfile", () => {
    expect(isClubAdmin(undefined, "club-1")).toBe(false);
  });

  it("should return false when user has no clubAccess", () => {
    const profile = { uid: "u1", email: "", displayName: "", clubAccess: [] };
    expect(isClubAdmin(profile as any, "club-1")).toBe(false);
  });

  it("should return false for wrong clubId", () => {
    const profile = makeClubAdmin("club-a");
    expect(isClubAdmin(profile as any, "club-b")).toBe(false);
  });

  it("should return true for matching club-admin", () => {
    const profile = makeClubAdmin("club-1");
    expect(isClubAdmin(profile as any, "club-1")).toBe(true);
  });

  it("should return false for inactive club membership", () => {
    const profile = {
      uid: "u1",
      email: "",
      displayName: "",
      clubAccess: [
        {
          clubId: "club-1",
          clubName: "C",
          role: "club-admin" as const,
          isActive: false,
          groupAccess: [],
        },
      ],
    };
    expect(isClubAdmin(profile as any, "club-1")).toBe(false);
  });
});

// ─── canManageClub ───────────────────────────────────────────

describe("canManageClub", () => {
  it("should return true for club-admin (delegates to isClubAdmin)", () => {
    const profile = makeClubAdmin("club-1");
    expect(canManageClub(profile as any, "club-1")).toBe(true);
  });

  it("should return false for regular member", () => {
    const profile = makeMember("club-1");
    expect(canManageClub(profile as any, "club-1")).toBe(false);
  });
});

// ─── getUserClubRole ─────────────────────────────────────────

describe("getUserClubRole", () => {
  it("should return null for null profile", () => {
    expect(getUserClubRole(null, "club-1")).toBeNull();
  });

  it("should return null for non-member", () => {
    const profile = makeMember("club-a");
    expect(getUserClubRole(profile as any, "club-b")).toBeNull();
  });

  it('should return "club-admin" for admin', () => {
    const profile = makeClubAdmin("club-1");
    expect(getUserClubRole(profile as any, "club-1")).toBe("club-admin");
  });

  it('should return "member" for regular member', () => {
    const profile = makeMember("club-1");
    expect(getUserClubRole(profile as any, "club-1")).toBe("member");
  });
});

// ─── getGroupRoles ───────────────────────────────────────────

describe("getGroupRoles", () => {
  it("should return [] for null profile", () => {
    expect(getGroupRoles(null, "club-1", "group-1")).toEqual([]);
  });

  it("should return [] when no group access", () => {
    const profile = makeMember("club-1");
    expect(getGroupRoles(profile as any, "club-1", "group-1")).toEqual([]);
  });

  it("should return [] for wrong groupId", () => {
    const profile = makeGroupUser("club-1", "group-a", ["player"]);
    expect(getGroupRoles(profile as any, "club-1", "group-b")).toEqual([]);
  });

  it("should return roles for matching group", () => {
    const profile = makeGroupUser("club-1", "group-1", ["player", "coach"]);
    expect(getGroupRoles(profile as any, "club-1", "group-1")).toEqual([
      "player",
      "coach",
    ]);
  });

  it("should return [] for inactive group membership", () => {
    const profile = makeGroupUser("club-1", "group-1", ["player"], {
      groupActive: false,
    });
    expect(getGroupRoles(profile as any, "club-1", "group-1")).toEqual([]);
  });
});

// ─── canManageGroup ──────────────────────────────────────────

describe("canManageGroup", () => {
  it("should return true for club-admin (bypass)", () => {
    const profile = makeClubAdmin("club-1");
    expect(canManageGroup(profile as any, "club-1", "any-group")).toBe(true);
  });

  it("should return true for group admin", () => {
    const profile = makeGroupUser("club-1", "group-1", ["admin"]);
    expect(canManageGroup(profile as any, "club-1", "group-1")).toBe(true);
  });

  it("should return true for group coach", () => {
    const profile = makeGroupUser("club-1", "group-1", ["coach"]);
    expect(canManageGroup(profile as any, "club-1", "group-1")).toBe(true);
  });

  it("should return false for player", () => {
    const profile = makeGroupUser("club-1", "group-1", ["player"]);
    expect(canManageGroup(profile as any, "club-1", "group-1")).toBe(false);
  });

  it("should return false for player-underage", () => {
    const profile = makeGroupUser("club-1", "group-1", ["player-underage"]);
    expect(canManageGroup(profile as any, "club-1", "group-1")).toBe(false);
  });

  it("should return false for null profile", () => {
    expect(canManageGroup(null, "club-1", "group-1")).toBe(false);
  });
});

// ─── isGroupMember ───────────────────────────────────────────

describe("isGroupMember", () => {
  it("should return true when user has roles in group", () => {
    const profile = makeGroupUser("club-1", "group-1", ["player"]);
    expect(isGroupMember(profile as any, "club-1", "group-1")).toBe(true);
  });

  it("should return false when not in group", () => {
    const profile = makeGroupUser("club-1", "group-a", ["player"]);
    expect(isGroupMember(profile as any, "club-1", "group-b")).toBe(false);
  });

  it("should return false for null profile", () => {
    expect(isGroupMember(null, "club-1", "group-1")).toBe(false);
  });

  it("should return false for inactive group", () => {
    const profile = makeGroupUser("club-1", "group-1", ["player"], {
      groupActive: false,
    });
    expect(isGroupMember(profile as any, "club-1", "group-1")).toBe(false);
  });
});

// ─── getHighestRole ──────────────────────────────────────────

describe("getHighestRole", () => {
  it("should return null for null profile", () => {
    expect(getHighestRole(null, "club-1")).toBeNull();
  });

  it("should return null for non-member", () => {
    const profile = makeMember("club-a");
    expect(getHighestRole(profile as any, "club-b")).toBeNull();
  });

  it('should return "club-admin" for club-admin', () => {
    const profile = makeClubAdmin("club-1");
    expect(getHighestRole(profile as any, "club-1")).toBe("club-admin");
  });

  it('should return "admin" for group admin', () => {
    const profile = makeGroupUser("club-1", "group-1", ["admin", "player"]);
    expect(getHighestRole(profile as any, "club-1")).toBe("admin");
  });

  it('should return "coach" when highest is coach', () => {
    const profile = makeGroupUser("club-1", "group-1", ["coach", "player"]);
    expect(getHighestRole(profile as any, "club-1")).toBe("coach");
  });

  it('should return "player" when highest is player', () => {
    const profile = makeGroupUser("club-1", "group-1", ["player"]);
    expect(getHighestRole(profile as any, "club-1")).toBe("player");
  });

  it('should return "player-underage" for youth', () => {
    const profile = makeGroupUser("club-1", "group-1", ["player-underage"]);
    expect(getHighestRole(profile as any, "club-1")).toBe("player-underage");
  });

  it('should return "member" when no group roles', () => {
    const profile = makeMember("club-1");
    expect(getHighestRole(profile as any, "club-1")).toBe("member");
  });
});

// ─── getActiveClubIds ────────────────────────────────────────

describe("getActiveClubIds", () => {
  it("should return [] for null profile", () => {
    expect(getActiveClubIds(null)).toEqual([]);
  });

  it("should return [] for empty clubAccess", () => {
    const profile = { uid: "u1", email: "", displayName: "", clubAccess: [] };
    expect(getActiveClubIds(profile as any)).toEqual([]);
  });

  it("should return active club IDs only", () => {
    const profile = makeComplexProfile();
    const ids = getActiveClubIds(profile as any);
    expect(ids).toContain("club-a");
    expect(ids).toContain("club-b");
    expect(ids).not.toContain("club-c"); // isActive: false
    expect(ids).toHaveLength(2);
  });

  it("should return all club IDs when all active", () => {
    const profile = {
      uid: "u1",
      email: "",
      displayName: "",
      clubAccess: [
        {
          clubId: "c1",
          clubName: "C1",
          role: "member" as const,
          isActive: true,
        },
        {
          clubId: "c2",
          clubName: "C2",
          role: "member" as const,
          isActive: true,
        },
        {
          clubId: "c3",
          clubName: "C3",
          role: "club-admin" as const,
          isActive: true,
        },
      ],
    };
    expect(getActiveClubIds(profile as any)).toEqual(["c1", "c2", "c3"]);
  });
});

// ─── getActiveGroups ─────────────────────────────────────────

describe("getActiveGroups", () => {
  it("should return [] for null profile", () => {
    expect(getActiveGroups(null, "club-1")).toEqual([]);
  });

  it("should return [] for non-member of club", () => {
    const profile = makeMember("club-a");
    expect(getActiveGroups(profile as any, "club-b")).toEqual([]);
  });

  it("should return [] when no groupAccess", () => {
    const profile = makeMember("club-1");
    expect(getActiveGroups(profile as any, "club-1")).toEqual([]);
  });

  it("should return active groups only", () => {
    const profile = makeComplexProfile();
    const groups = getActiveGroups(profile as any, "club-b");
    expect(groups).toHaveLength(1);
    expect(groups[0].groupId).toBe("group-b1");
    // group-b2 is isActive: false
  });

  it("should return all groups when all active", () => {
    const profile = makeComplexProfile();
    const groups = getActiveGroups(profile as any, "club-a");
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.groupId)).toEqual(["group-a1", "group-a2"]);
  });

  it("should return objects with groupId, groupName, roles", () => {
    const profile = makeComplexProfile();
    const groups = getActiveGroups(profile as any, "club-b");
    expect(groups[0]).toEqual({
      groupId: "group-b1",
      groupName: "Group B1",
      roles: ["coach", "player"],
    });
  });
});
