/**
 * Pure Logic Unit Tests
 *
 * Tests for utility functions that have ZERO Firebase dependencies.
 * These run fast — no emulators needed.
 *
 * Modules covered:
 *   - utils/validation.ts
 *   - utils/roleValidation.ts (pure-logic subset)
 *   - utils/limits.ts (pure-logic subset)
 *   - lok/lokValidation.ts
 */

// ─── Validation Utils ────────────────────────────────────────

import {
    isInvitationExpired,
    validateArrayField,
    validateEmail,
    validateEmailMatch,
    validateInvitationAction,
    validateInvitationStatus,
    validateRequiredFields,
    validateShareableInvitationStatus,
} from "../src/utils/validation";

import {
    formatRoleName,
    getRoleDescription,
    isGuardianRole,
    isValidClubRole,
    isValidGroupRole,
    isYouthRole,
    requiresSpecialHandling,
    VALID_CLUB_ROLES,
    VALID_GROUP_ROLES,
    validateClubRole,
    validateGroupRole,
} from "../src/utils/roleValidation";

import {
    BASIC_LIMITS,
    calculateUsagePercentage,
    checkClubLimit,
    checkClubMemberLimit,
    checkGroupLimit,
    checkResourceLimit,
    DEFAULT_LIMITS,
    ENTERPRISE_LIMITS,
    getClubSubscriptionTier,
    getLimitsForTier,
    PRO_LIMITS,
    shouldWarnAboutLimit,
} from "../src/utils/limits";

import {
    getPeriodBounds,
    getReportingPeriod,
    LOK_CONSTANTS,
    validateLokActivity,
    validateLokReportPeriod,
} from "../src/lok/lokValidation";

// ═══════════════════════════════════════════════════════════════
//  Section 1: validation.ts
// ═══════════════════════════════════════════════════════════════

describe("validation.ts", () => {
  describe("validateRequiredFields", () => {
    it("should pass when all fields present", () => {
      expect(() =>
        validateRequiredFields({ a: 1, b: "x" }, ["a", "b"]),
      ).not.toThrow();
    });

    it("should throw for missing fields", () => {
      expect(() => validateRequiredFields({ a: 1 }, ["a", "b", "c"])).toThrow(
        /Missing required fields.*b.*c/i,
      );
    });

    it("should treat falsy values as missing", () => {
      expect(() =>
        validateRequiredFields({ a: "", b: 0, c: null }, ["a", "b", "c"]),
      ).toThrow(/Missing required fields/i);
    });
  });

  describe("validateArrayField", () => {
    it("should pass for non-empty array", () => {
      expect(() => validateArrayField(["x"], "emails")).not.toThrow();
    });

    it("should throw for empty array", () => {
      expect(() => validateArrayField([], "emails")).toThrow(
        /must be a non-empty array/,
      );
    });

    it("should throw for non-array", () => {
      expect(() => validateArrayField("string", "emails")).toThrow(
        /must be a non-empty array/,
      );
    });

    it("should throw for null", () => {
      expect(() => validateArrayField(null, "emails")).toThrow();
    });
  });

  describe("validateEmail", () => {
    it("should accept valid emails", () => {
      expect(validateEmail("user@example.com")).toBe(true);
      expect(validateEmail("a+b@sub.domain.org")).toBe(true);
    });

    it("should reject invalid emails", () => {
      expect(validateEmail("")).toBe(false);
      expect(validateEmail("no-at-sign")).toBe(false);
      expect(validateEmail("@domain.com")).toBe(false);
      expect(validateEmail("user@")).toBe(false);
    });
  });

  describe("validateInvitationAction", () => {
    it("should accept 'accept' and 'reject'", () => {
      expect(() => validateInvitationAction("accept")).not.toThrow();
      expect(() => validateInvitationAction("reject")).not.toThrow();
    });

    it("should throw for invalid action", () => {
      expect(() => validateInvitationAction("maybe")).toThrow();
      expect(() => validateInvitationAction("")).toThrow();
    });
  });

  describe("isInvitationExpired", () => {
    it("should return false for future date", () => {
      const future = new Date(Date.now() + 86400000);
      expect(isInvitationExpired(future)).toBe(false);
    });

    it("should return true for past date", () => {
      const past = new Date(Date.now() - 86400000);
      expect(isInvitationExpired(past)).toBe(true);
    });

    it("should return false for null/undefined", () => {
      expect(isInvitationExpired(null)).toBe(false);
      expect(isInvitationExpired(undefined)).toBe(false);
    });

    it("should handle Firestore Timestamp-like .toDate()", () => {
      const past = new Date(Date.now() - 86400000);
      const fakeTimestamp = { toDate: () => past };
      expect(isInvitationExpired(fakeTimestamp)).toBe(true);
    });
  });

  describe("validateInvitationStatus", () => {
    it("should pass for pending unused invitation", () => {
      const inv = {
        used: false,
        status: "pending",
        expiresAt: new Date(Date.now() + 86400000),
      };
      expect(() => validateInvitationStatus(inv)).not.toThrow();
    });

    it("should throw for null data", () => {
      expect(() => validateInvitationStatus(null)).toThrow(
        /Invalid invitation data/,
      );
    });

    it("should throw for already used invitation", () => {
      const inv = {
        used: true,
        status: "accepted",
        expiresAt: new Date(Date.now() + 86400000),
      };
      expect(() => validateInvitationStatus(inv)).toThrow(
        /already been processed/,
      );
    });

    it("should throw for expired invitation", () => {
      const inv = {
        used: false,
        status: "pending",
        expiresAt: new Date(Date.now() - 86400000),
      };
      expect(() => validateInvitationStatus(inv)).toThrow(/expired/);
    });
  });

  describe("validateShareableInvitationStatus", () => {
    it("should pass for active invitation", () => {
      const inv = {
        isActive: true,
        expiresAt: new Date(Date.now() + 86400000),
      };
      expect(() => validateShareableInvitationStatus(inv)).not.toThrow();
    });

    it("should throw for inactive invitation", () => {
      const inv = { isActive: false };
      expect(() => validateShareableInvitationStatus(inv)).toThrow(
        /no longer active/,
      );
    });

    it("should throw for null", () => {
      expect(() => validateShareableInvitationStatus(null)).toThrow();
    });
  });

  describe("validateEmailMatch", () => {
    it("should pass for matching emails (case-insensitive input)", () => {
      expect(() =>
        validateEmailMatch("user@test.com", "  User@Test.com  "),
      ).not.toThrow();
    });

    it("should throw for mismatched emails", () => {
      expect(() =>
        validateEmailMatch("user@test.com", "other@test.com"),
      ).toThrow(/does not match/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  Section 2: roleValidation.ts (pure-logic only)
// ═══════════════════════════════════════════════════════════════

describe("roleValidation.ts", () => {
  describe("isValidGroupRole / isValidClubRole", () => {
    it("should accept valid group roles", () => {
      for (const role of VALID_GROUP_ROLES) {
        expect(isValidGroupRole(role)).toBe(true);
      }
    });

    it("should reject invalid group roles", () => {
      expect(isValidGroupRole("guardian")).toBe(false);
      expect(isValidGroupRole("club-admin")).toBe(false);
      expect(isValidGroupRole("random")).toBe(false);
    });

    it("should accept valid club roles", () => {
      for (const role of VALID_CLUB_ROLES) {
        expect(isValidClubRole(role)).toBe(true);
      }
    });

    it("should reject invalid club roles", () => {
      expect(isValidClubRole("manager")).toBe(false);
      expect(isValidClubRole("")).toBe(false);
    });
  });

  describe("validateGroupRole / validateClubRole (throws)", () => {
    it("should not throw for valid group role", () => {
      expect(() => validateGroupRole("player")).not.toThrow();
      expect(() => validateGroupRole("coach")).not.toThrow();
    });

    it("should throw for invalid group role", () => {
      expect(() => validateGroupRole("club-admin", "test")).toThrow(
        /Invalid group role/,
      );
    });

    it("should throw for undefined role", () => {
      expect(() => validateGroupRole(undefined)).toThrow(/required/);
    });

    it("should not throw for valid club role", () => {
      expect(() => validateClubRole("guardian")).not.toThrow();
      expect(() => validateClubRole("club-admin")).not.toThrow();
    });

    it("should throw for invalid club role", () => {
      expect(() => validateClubRole("owner", "test")).toThrow(
        /Invalid club role/,
      );
    });
  });

  describe("role type detection", () => {
    it("isYouthRole", () => {
      expect(isYouthRole("player-underage")).toBe(true);
      expect(isYouthRole("player")).toBe(false);
    });

    it("isGuardianRole", () => {
      expect(isGuardianRole("guardian")).toBe(true);
      expect(isGuardianRole("admin")).toBe(false);
    });

    it("requiresSpecialHandling", () => {
      expect(requiresSpecialHandling("player-underage")).toBe(true);
      expect(requiresSpecialHandling("guardian")).toBe(true);
      expect(requiresSpecialHandling("player")).toBe(false);
      expect(requiresSpecialHandling("coach")).toBe(false);
    });
  });

  describe("formatting", () => {
    it("formatRoleName maps known roles", () => {
      expect(formatRoleName("player")).toBe("Player");
      expect(formatRoleName("player-underage")).toBe("Youth Player");
      expect(formatRoleName("club-admin")).toBe("Club Administrator");
    });

    it("formatRoleName returns raw string for unknown role", () => {
      expect(formatRoleName("mystery")).toBe("mystery");
    });

    it("getRoleDescription maps known roles", () => {
      expect(getRoleDescription("coach")).toBe("as a coach");
      expect(getRoleDescription("guardian")).toBe("as a guardian");
    });

    it("getRoleDescription fallback for unknown role", () => {
      expect(getRoleDescription("xyz")).toBe("with role xyz");
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  Section 3: limits.ts
// ═══════════════════════════════════════════════════════════════

describe("limits.ts", () => {
  describe("tier constants", () => {
    it("DEFAULT (free) tier", () => {
      expect(DEFAULT_LIMITS.maxClubsAsAdmin).toBe(1);
      expect(DEFAULT_LIMITS.maxMembers).toBe(1500); // subscriptions parked — all tiers = 1500
    });

    it("BASIC tier (aliased to DEFAULT while subscriptions are parked)", () => {
      expect(BASIC_LIMITS.maxMembers).toBe(1500);
    });

    it("PRO tier (aliased to DEFAULT while subscriptions are parked)", () => {
      expect(PRO_LIMITS.maxMembers).toBe(1500);
    });

    it("ENTERPRISE tier is unlimited (-1)", () => {
      expect(ENTERPRISE_LIMITS.maxClubsAsAdmin).toBe(-1);
      expect(ENTERPRISE_LIMITS.maxMembers).toBe(-1);
    });
  });

  describe("checkResourceLimit", () => {
    it("should allow when under limit", () => {
      const result = checkResourceLimit(3, 10, "widget");
      expect(result.allowed).toBe(true);
    });

    it("should block when at limit", () => {
      const result = checkResourceLimit(10, 10, "widget");
      expect(result.allowed).toBe(false);
      expect(result.message).toContain("reached your limit");
    });

    it("should allow unlimited (-1)", () => {
      const result = checkResourceLimit(99999, -1, "widget");
      expect(result.allowed).toBe(true);
    });
  });

  describe("checkClubLimit", () => {
    it("should block creation at limit", () => {
      const result = checkClubLimit(1, 1);
      expect(result.allowed).toBe(false);
    });

    it("should allow when under limit", () => {
      const result = checkClubLimit(0, 1);
      expect(result.allowed).toBe(true);
    });
  });

  describe("checkGroupLimit", () => {
    it("should allow 98 out of 99", () => {
      const result = checkGroupLimit(98, 99);
      expect(result.allowed).toBe(true);
    });

    it("should block at 99/99", () => {
      const result = checkGroupLimit(99, 99);
      expect(result.allowed).toBe(false);
    });
  });

  describe("checkClubMemberLimit", () => {
    it("should allow 49 on free tier", () => {
      const result = checkClubMemberLimit(49, "free");
      expect(result.allowed).toBe(true);
    });

    it("should allow 50 on free tier (limit is 1500 while subscriptions parked)", () => {
      const result = checkClubMemberLimit(50, "free");
      expect(result.allowed).toBe(true);
    });

    it("should allow 500 on basic tier (limit is 1500 while subscriptions parked)", () => {
      const result = checkClubMemberLimit(500, "basic");
      expect(result.allowed).toBe(true);
    });

    it("should block at 1500 on free tier", () => {
      const result = checkClubMemberLimit(1500, "free");
      expect(result.allowed).toBe(false);
      expect(result.message).toContain("1500 members");
    });

    it("should allow unlimited on enterprise", () => {
      const result = checkClubMemberLimit(99999, "enterprise");
      expect(result.allowed).toBe(true);
    });
  });

  describe("getLimitsForTier", () => {
    it("should return correct limits per tier", () => {
      expect(getLimitsForTier("free")).toEqual(DEFAULT_LIMITS);
      expect(getLimitsForTier("basic")).toEqual(BASIC_LIMITS);
      expect(getLimitsForTier("pro")).toEqual(PRO_LIMITS);
      expect(getLimitsForTier("enterprise")).toEqual(ENTERPRISE_LIMITS);
    });
  });

  describe("getClubSubscriptionTier", () => {
    it("should return tier from club data", () => {
      expect(getClubSubscriptionTier({ subscription: { tier: "pro" } })).toBe(
        "pro",
      );
    });

    it("should default to free if missing", () => {
      expect(getClubSubscriptionTier(null)).toBe("free");
      expect(getClubSubscriptionTier({})).toBe("free");
      expect(getClubSubscriptionTier({ subscription: {} })).toBe("free");
    });
  });

  describe("calculateUsagePercentage", () => {
    it("50/100 = 50%", () => {
      expect(calculateUsagePercentage(50, 100)).toBe(50);
    });

    it("unlimited returns 0", () => {
      expect(calculateUsagePercentage(500, -1)).toBe(0);
    });

    it("max 0 returns 100", () => {
      expect(calculateUsagePercentage(1, 0)).toBe(100);
    });
  });

  describe("shouldWarnAboutLimit", () => {
    it("should warn at 80%+", () => {
      expect(shouldWarnAboutLimit(40, 50)).toBe(true); // 80%
      expect(shouldWarnAboutLimit(45, 50)).toBe(true); // 90%
    });

    it("should not warn below 80%", () => {
      expect(shouldWarnAboutLimit(39, 50)).toBe(false); // 78%
    });

    it("should not warn for unlimited", () => {
      expect(shouldWarnAboutLimit(99999, -1)).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  Section 4: lokValidation.ts
// ═══════════════════════════════════════════════════════════════

describe("lokValidation.ts", () => {
  // Helper to build a valid LOK activity with sensible defaults
  function makeLokActivity(
    overrides: Partial<{
      participants: any[];
      startTime: Date;
      endTime: Date;
      date: Date;
      sport: string;
      activityType: string;
    }> = {},
  ) {
    const now = new Date();
    return {
      eventId: "e1",
      date: overrides.date ?? now,
      startTime: overrides.startTime ?? new Date(now.getTime()),
      endTime: overrides.endTime ?? new Date(now.getTime() + 90 * 60_000), // 90 min
      activityType: overrides.activityType ?? "training",
      sport: overrides.sport ?? "fotboll",
      groupId: "g1",
      groupName: "U15",
      participants: overrides.participants ?? [
        {
          userId: "l1",
          personnummer: "200001010001",
          role: "leader",
          attended: true,
        },
        {
          userId: "p1",
          personnummer: "201001010001",
          role: "participant",
          attended: true,
        },
        {
          userId: "p2",
          personnummer: "201101010002",
          role: "participant",
          attended: true,
        },
        {
          userId: "p3",
          personnummer: "201201010003",
          role: "participant",
          attended: true,
        },
      ],
    };
  }

  describe("validateLokActivity", () => {
    it("should validate a correct activity", () => {
      const result = validateLokActivity(makeLokActivity());
      expect(result.valid).toBe(true);
      expect(result.eligible).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.eligibleParticipants).toBe(3);
      expect(result.summary.leaderCount).toBe(1);
    });

    it("should reject activity shorter than 60 minutes", () => {
      const now = new Date();
      const result = validateLokActivity(
        makeLokActivity({
          startTime: now,
          endTime: new Date(now.getTime() + 30 * 60_000), // 30 min
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "DURATION_TOO_SHORT")).toBe(
        true,
      );
    });

    it("should reject activity with no leader", () => {
      const result = validateLokActivity(
        makeLokActivity({
          participants: [
            {
              userId: "p1",
              personnummer: "201001010001",
              role: "participant",
              attended: true,
            },
            {
              userId: "p2",
              personnummer: "201101010002",
              role: "participant",
              attended: true,
            },
            {
              userId: "p3",
              personnummer: "201201010003",
              role: "participant",
              attended: true,
            },
          ],
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "NO_LEADER")).toBe(true);
    });

    it("should reject activity with fewer than 3 eligible participants", () => {
      const result = validateLokActivity(
        makeLokActivity({
          participants: [
            {
              userId: "l1",
              personnummer: "200001010001",
              role: "leader",
              attended: true,
            },
            {
              userId: "p1",
              personnummer: "201001010001",
              role: "participant",
              attended: true,
            },
            {
              userId: "p2",
              personnummer: "201101010002",
              role: "participant",
              attended: true,
            },
            // only 2 participants
          ],
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "TOO_FEW_PARTICIPANTS")).toBe(
        true,
      );
    });

    it("should reject missing sport", () => {
      const result = validateLokActivity(makeLokActivity({ sport: "" }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "MISSING_SPORT")).toBe(true);
    });

    it("should reject invalid activity type", () => {
      const result = validateLokActivity(
        makeLokActivity({ activityType: "party" }),
      );
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.code === "INVALID_ACTIVITY_TYPE"),
      ).toBe(true);
    });

    it("should cap eligible participants at 30", () => {
      const participants: any[] = [
        {
          userId: "l1",
          personnummer: "200001010001",
          role: "leader",
          attended: true,
        },
      ];
      // Add 35 participants (all age-eligible)
      for (let i = 0; i < 35; i++) {
        participants.push({
          userId: `p${i}`,
          personnummer: `2010010100${String(i).padStart(2, "0")}`,
          role: "participant",
          attended: true,
        });
      }

      const result = validateLokActivity(makeLokActivity({ participants }));
      expect(result.valid).toBe(true);
      expect(result.summary.eligibleParticipants).toBe(35);
      expect(result.summary.countedParticipants).toBe(
        LOK_CONSTANTS.MAX_COUNTED_PARTICIPANTS,
      ); // 30
      expect(
        result.warnings.some((w) => w.code === "PARTICIPANTS_CAPPED"),
      ).toBe(true);
    });

    it("should exclude participants outside age range 7-25", () => {
      const result = validateLokActivity(
        makeLokActivity({
          participants: [
            {
              userId: "l1",
              personnummer: "200001010001",
              role: "leader",
              attended: true,
            },
            // Old participant (born 1950, age > 25)
            {
              userId: "old",
              personnummer: "195001010001",
              role: "participant",
              attended: true,
            },
            // Three eligible participants
            {
              userId: "p1",
              personnummer: "201001010001",
              role: "participant",
              attended: true,
            },
            {
              userId: "p2",
              personnummer: "201101010002",
              role: "participant",
              attended: true,
            },
            {
              userId: "p3",
              personnummer: "201201010003",
              role: "participant",
              attended: true,
            },
          ],
        }),
      );
      expect(result.valid).toBe(true);
      // Old participant not counted
      expect(result.summary.eligibleParticipants).toBe(3);
      expect(
        result.warnings.some(
          (w) => w.code === "PARTICIPANTS_OUTSIDE_AGE_RANGE",
        ),
      ).toBe(true);
    });
  });

  describe("getReportingPeriod", () => {
    it("Jan–Jun → H1", () => {
      expect(getReportingPeriod(new Date(2026, 0, 15))).toBe("2026-H1");
      expect(getReportingPeriod(new Date(2026, 5, 30))).toBe("2026-H1");
    });

    it("Jul–Dec → H2", () => {
      expect(getReportingPeriod(new Date(2026, 6, 1))).toBe("2026-H2");
      expect(getReportingPeriod(new Date(2026, 11, 31))).toBe("2026-H2");
    });
  });

  describe("getPeriodBounds", () => {
    it("should return Jan 1 – Jun 30 for H1", () => {
      const bounds = getPeriodBounds("2026-H1");
      expect(bounds).not.toBeNull();
      expect(bounds!.start.getMonth()).toBe(0);
      expect(bounds!.end.getMonth()).toBe(5);
    });

    it("should return Jul 1 – Dec 31 for H2", () => {
      const bounds = getPeriodBounds("2026-H2");
      expect(bounds).not.toBeNull();
      expect(bounds!.start.getMonth()).toBe(6);
      expect(bounds!.end.getMonth()).toBe(11);
    });

    it("should return null for invalid period", () => {
      expect(getPeriodBounds("bad")).toBeNull();
      expect(getPeriodBounds("2026-H3")).toBeNull();
    });
  });

  describe("validateLokReportPeriod", () => {
    it("should validate a period with eligible activities", () => {
      const jan15 = new Date(2026, 0, 15);
      const activity = makeLokActivity({
        date: jan15,
        startTime: new Date(2026, 0, 15, 18, 0),
        endTime: new Date(2026, 0, 15, 19, 30),
      });

      const result = validateLokReportPeriod([activity], "2026-H1");
      expect(result.valid).toBe(true);
      expect(result.eligibleActivities).toBe(1);
    });

    it("should reject invalid period format", () => {
      const result = validateLokReportPeriod([], "bad-format");
      expect(result.periodErrors.some((e) => e.code === "INVALID_PERIOD")).toBe(
        true,
      );
    });

    it("should reject activity outside period bounds", () => {
      const aug15 = new Date(2026, 7, 15); // August = H2
      const activity = makeLokActivity({
        date: aug15,
        startTime: new Date(2026, 7, 15, 18, 0),
        endTime: new Date(2026, 7, 15, 19, 30),
      });

      const result = validateLokReportPeriod([activity], "2026-H1"); // H1 but activity is in H2
      expect(
        result.periodErrors.some((e) => e.code === "ACTIVITY_OUTSIDE_PERIOD"),
      ).toBe(true);
    });

    it("should flag when all activities are ineligible", () => {
      // Activity with no participants → ineligible
      const now = new Date(2026, 0, 15);
      const activity = makeLokActivity({
        date: now,
        startTime: new Date(2026, 0, 15, 18, 0),
        endTime: new Date(2026, 0, 15, 19, 30),
        participants: [
          {
            userId: "l1",
            personnummer: "200001010001",
            role: "leader",
            attended: true,
          },
          // Not enough eligible participants
        ],
      });

      const result = validateLokReportPeriod([activity], "2026-H1");
      expect(result.eligibleActivities).toBe(0);
      expect(
        result.periodErrors.some((e) => e.code === "NO_ELIGIBLE_ACTIVITIES"),
      ).toBe(true);
    });
  });

  describe("LOK_CONSTANTS", () => {
    it("should have correct values", () => {
      expect(LOK_CONSTANTS.MIN_AGE).toBe(7);
      expect(LOK_CONSTANTS.MAX_AGE).toBe(25);
      expect(LOK_CONSTANTS.MIN_PARTICIPANTS).toBe(3);
      expect(LOK_CONSTANTS.MAX_COUNTED_PARTICIPANTS).toBe(30);
      expect(LOK_CONSTANTS.MIN_DURATION_MINUTES).toBe(60);
      expect(LOK_CONSTANTS.MIN_LEADERS).toBe(1);
    });
  });
});

// ─── Accounting Config — BAS Account Resolution ──────────────

import {
    BAS_ACCOUNT_MAP,
    EARMARKABLE_CATEGORIES,
    FEE_CATEGORIES,
    isValidFeeCategory,
    resolveBasAccount,
    SPECIAL_ACCOUNTS,
} from "../src/config/accounting";

describe("BAS Account Resolution (accounting.ts)", () => {
  describe("resolveBasAccount", () => {
    it("returns 3010 for membership_fee in SE", () => {
      expect(resolveBasAccount("membership_fee", "SE")).toBe(3010);
    });

    it("returns 3020 for training_fee in SE", () => {
      expect(resolveBasAccount("training_fee", "SE")).toBe(3020);
    });

    it("returns 3030 for event_fee in SE", () => {
      expect(resolveBasAccount("event_fee", "SE")).toBe(3030);
    });

    it("returns 3210 for sponsorship in SE", () => {
      expect(resolveBasAccount("sponsorship", "SE")).toBe(3210);
    });

    it("returns 3310 for sales_kiosk in SE", () => {
      expect(resolveBasAccount("sales_kiosk", "SE")).toBe(3310);
    });

    it("returns 3890 for other in SE", () => {
      expect(resolveBasAccount("other", "SE")).toBe(3890);
    });

    it("falls back to SE map for unknown country code", () => {
      // Unknown country → falls back to SE
      expect(resolveBasAccount("membership_fee", "XX")).toBe(3010);
    });

    it("falls back to other (3890) for unrecognised category in SE", () => {
      expect(resolveBasAccount("totally_unknown_cat", "SE")).toBe(3890);
    });

    it("is case-insensitive for country code (SE / se)", () => {
      expect(resolveBasAccount("membership_fee", "se")).toBe(3010);
    });
  });

  describe("isValidFeeCategory", () => {
    it("returns true for every known category", () => {
      for (const cat of FEE_CATEGORIES) {
        expect(isValidFeeCategory(cat)).toBe(true);
      }
    });

    it("returns false for an unknown string", () => {
      expect(isValidFeeCategory("invalid_category")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isValidFeeCategory("")).toBe(false);
    });

    it("returns false for a SQL injection string", () => {
      expect(isValidFeeCategory("' OR 1=1--")).toBe(false);
    });
  });

  describe("EARMARKABLE_CATEGORIES", () => {
    it("includes sales_kiosk and other", () => {
      expect(EARMARKABLE_CATEGORIES).toContain("sales_kiosk");
      expect(EARMARKABLE_CATEGORIES).toContain("other");
    });

    it("does not include membership_fee (not earmarkable)", () => {
      expect(EARMARKABLE_CATEGORIES).not.toContain("membership_fee");
    });
  });

  describe("SPECIAL_ACCOUNTS", () => {
    it("has correct BAS codes for bank, stripeFee, lagkassa", () => {
      expect(SPECIAL_ACCOUNTS.bank).toBe(1930);
      expect(SPECIAL_ACCOUNTS.stripeFee).toBe(6570);
      expect(SPECIAL_ACCOUNTS.lagkassa).toBe(2071);
    });
  });

  describe("BAS_ACCOUNT_MAP completeness", () => {
    it("SE map covers all six categories", () => {
      const seMap = BAS_ACCOUNT_MAP["SE"];
      expect(seMap).toBeDefined();

      for (const cat of FEE_CATEGORIES) {
        expect(seMap[cat]).toBeDefined();
        expect(typeof seMap[cat]).toBe("number");
      }
    });

    it("all SE account codes are in the 3xxx income range (except earmarked)", () => {
      const seMap = BAS_ACCOUNT_MAP["SE"];
      for (const cat of FEE_CATEGORIES) {
        expect(seMap[cat]).toBeGreaterThanOrEqual(3000);
        expect(seMap[cat]).toBeLessThan(4000);
      }
    });
  });
});
