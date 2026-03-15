/**
 * flatArrayHelpers — Pure Logic Unit Tests
 *
 * Tests for `src/utils/flatArrayHelpers.ts` — the flat role array builder
 * used by every Cloud Function that writes clubAccess.
 *
 * ZERO Firebase dependency (buildFlatArraysFromClubAccess / emptyFlatArrays
 * are pure functions). The FieldValue-based helpers are tested for shape only
 * (they return objects with FieldValue sentinels).
 *
 * Run: npx jest test/flat-array-helpers.test.ts
 */

import {
    buildFlatArraysFromClubAccess,
    emptyFlatArrays,
    flatArrayFieldsFromClubAccess,
    FlatRoleArrays,
} from "../src/utils/flatArrayHelpers";

// ─── Test Fixtures ───────────────────────────────────────────

function makeClubAccess(entries: any[]): any[] {
  return entries;
}

/** Standard active club-admin with one group */
function adminClubAccess(
  clubId: string,
  groupId: string,
  groupRoles: string[] = ["admin"],
) {
  return {
    clubId,
    clubName: "Test Club",
    role: "club-admin",
    isActive: true,
    groupAccess: [
      {
        groupId,
        groupName: "Test Group",
        roles: groupRoles,
        isActive: true,
      },
    ],
  };
}

/** Standard active member with one group */
function memberClubAccess(
  clubId: string,
  groupId: string,
  groupRoles: string[] = ["player"],
) {
  return {
    clubId,
    clubName: "Test Club",
    role: "member",
    isActive: true,
    groupAccess: [
      {
        groupId,
        groupName: "Test Group",
        roles: groupRoles,
        isActive: true,
      },
    ],
  };
}

// ─── buildFlatArraysFromClubAccess ──────────────────────────

describe("buildFlatArraysFromClubAccess", () => {
  it("returns empty arrays for undefined input", () => {
    const result = buildFlatArraysFromClubAccess(undefined);
    expect(result).toEqual(emptyFlatArrays());
  });

  it("returns empty arrays for null input", () => {
    const result = buildFlatArraysFromClubAccess(null);
    expect(result).toEqual(emptyFlatArrays());
  });

  it("returns empty arrays for empty array input", () => {
    const result = buildFlatArraysFromClubAccess([]);
    expect(result).toEqual(emptyFlatArrays());
  });

  it("returns empty arrays for non-array input", () => {
    const result = buildFlatArraysFromClubAccess("not-an-array" as any);
    expect(result).toEqual(emptyFlatArrays());
  });

  // ── Club-level role detection ────────────────────────────

  it("detects club-admin role", () => {
    const ca = makeClubAccess([adminClubAccess("club-1", "group-1")]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.adminOfClubs).toEqual(["club-1"]);
    expect(result.memberOfClubs).toEqual([]);
  });

  it("detects member role", () => {
    const ca = makeClubAccess([memberClubAccess("club-1", "group-1")]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.adminOfClubs).toEqual([]);
    expect(result.memberOfClubs).toEqual(["club-1"]);
  });

  // ── Group-level role detection ───────────────────────────

  it("detects admin group role", () => {
    const ca = makeClubAccess([adminClubAccess("c1", "g1", ["admin"])]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.adminOfGroups).toEqual(["g1"]);
    expect(result.memberOfGroups).toEqual(["g1"]); // all active groups
  });

  it("detects coach group role", () => {
    const ca = makeClubAccess([memberClubAccess("c1", "g1", ["coach"])]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.coachOfGroups).toEqual(["g1"]);
    expect(result.memberOfGroups).toEqual(["g1"]);
  });

  it("detects guardian group role", () => {
    const ca = makeClubAccess([memberClubAccess("c1", "g1", ["guardian"])]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.guardianOfGroups).toEqual(["g1"]);
    expect(result.memberOfGroups).toEqual(["g1"]);
  });

  it("detects player role in memberOfGroups only (no admin/coach/guardian)", () => {
    const ca = makeClubAccess([memberClubAccess("c1", "g1", ["player"])]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.adminOfGroups).toEqual([]);
    expect(result.coachOfGroups).toEqual([]);
    expect(result.guardianOfGroups).toEqual([]);
    expect(result.memberOfGroups).toEqual(["g1"]);
  });

  it("handles multiple roles in one group", () => {
    const ca = makeClubAccess([
      memberClubAccess("c1", "g1", ["admin", "coach"]),
    ]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.adminOfGroups).toEqual(["g1"]);
    expect(result.coachOfGroups).toEqual(["g1"]);
    expect(result.memberOfGroups).toEqual(["g1"]);
  });

  // ── Inactive filtering ──────────────────────────────────

  it("skips inactive clubs", () => {
    const ca = makeClubAccess([
      {
        clubId: "c1",
        role: "club-admin",
        isActive: false,
        groupAccess: [{ groupId: "g1", roles: ["admin"], isActive: true }],
      },
    ]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.adminOfClubs).toEqual([]);
    expect(result.adminOfGroups).toEqual([]);
    expect(result.memberOfGroups).toEqual([]);
  });

  it("skips inactive groups within active clubs", () => {
    const ca = makeClubAccess([
      {
        clubId: "c1",
        role: "member",
        isActive: true,
        groupAccess: [
          { groupId: "g1", roles: ["admin"], isActive: false },
          { groupId: "g2", roles: ["player"], isActive: true },
        ],
      },
    ]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.memberOfClubs).toEqual(["c1"]);
    expect(result.adminOfGroups).toEqual([]); // g1 is inactive
    expect(result.memberOfGroups).toEqual(["g2"]); // only g2
  });

  it("treats missing isActive as active (undefined)", () => {
    const ca = makeClubAccess([
      {
        clubId: "c1",
        role: "member",
        // isActive not set
        groupAccess: [
          { groupId: "g1", roles: ["player"] }, // no isActive
        ],
      },
    ]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.memberOfClubs).toEqual(["c1"]);
    expect(result.memberOfGroups).toEqual(["g1"]);
  });

  // ── Multi-club, multi-group scenarios ───────────────────

  it("handles multiple clubs and groups", () => {
    const ca = makeClubAccess([
      {
        clubId: "c1",
        role: "club-admin",
        isActive: true,
        groupAccess: [
          { groupId: "g1", roles: ["admin"], isActive: true },
          { groupId: "g2", roles: ["coach", "player"], isActive: true },
        ],
      },
      {
        clubId: "c2",
        role: "member",
        isActive: true,
        groupAccess: [{ groupId: "g3", roles: ["player"], isActive: true }],
      },
    ]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.adminOfClubs).toEqual(["c1"]);
    expect(result.memberOfClubs).toEqual(["c2"]);
    expect(result.adminOfGroups).toEqual(["g1"]);
    expect(result.coachOfGroups).toEqual(["g2"]);
    expect(result.memberOfGroups.sort()).toEqual(["g1", "g2", "g3"]);
  });

  it("handles club with no group access", () => {
    const ca = makeClubAccess([
      {
        clubId: "c1",
        role: "club-admin",
        isActive: true,
        groupAccess: [],
      },
    ]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.adminOfClubs).toEqual(["c1"]);
    expect(result.memberOfGroups).toEqual([]);
  });

  it("handles club with undefined groupAccess", () => {
    const ca = makeClubAccess([
      {
        clubId: "c1",
        role: "member",
        isActive: true,
        // groupAccess is missing entirely
      },
    ]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.memberOfClubs).toEqual(["c1"]);
    expect(result.memberOfGroups).toEqual([]);
  });

  it("handles group with empty roles array", () => {
    const ca = makeClubAccess([
      {
        clubId: "c1",
        role: "member",
        isActive: true,
        groupAccess: [{ groupId: "g1", roles: [], isActive: true }],
      },
    ]);
    const result = buildFlatArraysFromClubAccess(ca);
    // Group with no roles should NOT appear in memberOfGroups
    expect(result.memberOfGroups).toEqual([]);
  });

  it("handles group with undefined roles", () => {
    const ca = makeClubAccess([
      {
        clubId: "c1",
        role: "member",
        isActive: true,
        groupAccess: [
          { groupId: "g1", isActive: true }, // no roles field
        ],
      },
    ]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.memberOfGroups).toEqual([]);
  });

  // ── Mixed active/inactive scenario ─────────────────────

  it("correctly filters a complex mixed-state profile", () => {
    const ca = makeClubAccess([
      {
        clubId: "active-club",
        role: "club-admin",
        isActive: true,
        groupAccess: [
          {
            groupId: "active-group",
            roles: ["admin", "coach"],
            isActive: true,
          },
          { groupId: "inactive-group", roles: ["admin"], isActive: false },
        ],
      },
      {
        clubId: "inactive-club",
        role: "member",
        isActive: false,
        groupAccess: [
          { groupId: "hidden-group", roles: ["player"], isActive: true },
        ],
      },
    ]);
    const result = buildFlatArraysFromClubAccess(ca);
    expect(result.adminOfClubs).toEqual(["active-club"]);
    expect(result.memberOfClubs).toEqual([]);
    expect(result.adminOfGroups).toEqual(["active-group"]);
    expect(result.coachOfGroups).toEqual(["active-group"]);
    expect(result.memberOfGroups).toEqual(["active-group"]);
    expect(result.guardianOfGroups).toEqual([]);
  });
});

// ─── flatArrayFieldsFromClubAccess (alias) ──────────────────

describe("flatArrayFieldsFromClubAccess", () => {
  it("produces same result as buildFlatArraysFromClubAccess", () => {
    const ca = [adminClubAccess("c1", "g1", ["admin", "coach"])];
    expect(flatArrayFieldsFromClubAccess(ca)).toEqual(
      buildFlatArraysFromClubAccess(ca),
    );
  });
});

// ─── emptyFlatArrays ────────────────────────────────────────

describe("emptyFlatArrays", () => {
  it("returns object with all six empty arrays", () => {
    const result = emptyFlatArrays();
    expect(Object.keys(result).sort()).toEqual([
      "adminOfClubs",
      "adminOfGroups",
      "coachOfGroups",
      "guardianOfGroups",
      "memberOfClubs",
      "memberOfGroups",
    ]);
    for (const arr of Object.values(result)) {
      expect(arr).toEqual([]);
    }
  });

  it("returns a new object each time (no shared reference)", () => {
    const a = emptyFlatArrays();
    const b = emptyFlatArrays();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    a.adminOfClubs.push("x");
    expect(b.adminOfClubs).toEqual([]);
  });
});

// ─── Type check: FlatRoleArrays shape ───────────────────────

describe("FlatRoleArrays type shape", () => {
  it("buildFlatArraysFromClubAccess returns correct shape", () => {
    const result: FlatRoleArrays = buildFlatArraysFromClubAccess([]);
    expect(result).toHaveProperty("adminOfClubs");
    expect(result).toHaveProperty("memberOfClubs");
    expect(result).toHaveProperty("adminOfGroups");
    expect(result).toHaveProperty("coachOfGroups");
    expect(result).toHaveProperty("memberOfGroups");
    expect(result).toHaveProperty("guardianOfGroups");
  });
});
