/**
 * LOK-stöd Integration Tests
 *
 * Tests: storePersonnummer, removePersonnummer, getPersonnummerStatus,
 *        generateLokReport, listLokReports, getLokReport, deleteLokReport,
 *        resolveReportConflict, updateClubRfSettings, generateKommunExport
 *
 * Runs against Firebase Emulators.
 */

import {
    callFunction,
    clearAll,
    createFullTestUser,
    expectFunctionError,
    getDocument,
    getFirestore
} from "./helpers";

// ─── Helpers ──────────────────────────────────────────────────

async function createSwedishClub(adminIdToken: string, adminUid: string) {
  const db = getFirestore();
  const clubRef = db.collection("clubs").doc();
  await clubRef.set({
    name: "LOK Test FC",
    isActive: true,
    country: "SE",
    createdBy: adminUid,
  });
  await db
    .collection("clubs")
    .doc(clubRef.id)
    .collection("allMembers")
    .doc("members")
    .set({
      admins: { [adminUid]: { role: "admin", joinedAt: new Date() } },
      members: {},
    });
  return clubRef.id;
}

/** Build a minimal valid event doc for an activity date. */
async function seedEligibleEvent(
  clubId: string,
  eventId: string,
  date: Date,
): Promise<void> {
  const db = getFirestore();
  const startTime = new Date(date);
  startTime.setHours(10, 0, 0, 0);
  const endTime = new Date(date);
  endTime.setHours(12, 0, 0, 0);

  await db
    .collection("clubs")
    .doc(clubId)
    .collection("events")
    .doc(eventId)
    .set({
      title: "Träning",
      sport: "fotboll",
      date: date,
      startTime: startTime,
      endTime: endTime,
      status: "completed",
      attendees: [
        { userId: "leader1", role: "leader", attended: true },
        { userId: "member1", role: "participant", attended: true },
        { userId: "member2", role: "participant", attended: true },
        { userId: "member3", role: "participant", attended: true },
      ],
      lok: { eligible: true },
      completedAt: new Date(),
    });

  // Seed user DOB so validation knows ages
  const db2 = getFirestore();
  for (const uid of ["leader1", "member1", "member2", "member3"]) {
    const userDoc = await db2.doc(`users/${uid}`).get();
    if (!userDoc.exists) {
      await db2.doc(`users/${uid}`).set({
        fullName: uid,
        email: `${uid}@test.com`,
        isActive: true,
        dateOfBirth: new Date("2005-01-01"), // aged 20
        personnummer: null,
      });
    }
  }
}

// ─── storePersonnummer ────────────────────────────────────────

describe("storePersonnummer", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("stores personnummer for self", async () => {
    const user = await createFullTestUser();
    const result = await callFunction("storePersonnummer", user.idToken, {
      personnummer: "199001011234",
    });
    expect(result.success).toBe(true);

    const doc = await getDocument(`users/${user.uid}/private/personnummer`);
    expect(doc).toBeDefined();
  });

  it("rejects unauthenticated call", async () => {
    await expectFunctionError(
      "storePersonnummer",
      "",
      { personnummer: "199001011234" },
      "unauthenticated",
    );
  });

  it("rejects missing personnummer", async () => {
    const user = await createFullTestUser();
    await expectFunctionError(
      "storePersonnummer",
      user.idToken,
      {},
      "invalid-argument",
    );
  });
});

// ─── removePersonnummer ───────────────────────────────────────

describe("removePersonnummer", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("removes stored personnummer", async () => {
    const user = await createFullTestUser();
    await callFunction("storePersonnummer", user.idToken, {
      personnummer: "199001011234",
    });
    const result = await callFunction("removePersonnummer", user.idToken, {});
    expect(result.success).toBe(true);
  });

  it("rejects unauthenticated call", async () => {
    await expectFunctionError("removePersonnummer", "", {}, "unauthenticated");
  });
});

// ─── getPersonnummerStatus ────────────────────────────────────

describe("getPersonnummerStatus", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("returns stored=false before storing", async () => {
    const user = await createFullTestUser();
    const result = await callFunction(
      "getPersonnummerStatus",
      user.idToken,
      {},
    );
    expect(result.stored).toBe(false);
  });

  it("returns stored=true after storing", async () => {
    const user = await createFullTestUser();
    await callFunction("storePersonnummer", user.idToken, {
      personnummer: "199001011234",
    });
    const result = await callFunction(
      "getPersonnummerStatus",
      user.idToken,
      {},
    );
    expect(result.stored).toBe(true);
  });

  it("rejects unauthenticated call", async () => {
    await expectFunctionError(
      "getPersonnummerStatus",
      "",
      {},
      "unauthenticated",
    );
  });
});

// ─── updateClubRfSettings ─────────────────────────────────────

describe("updateClubRfSettings", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("allows club admin to update RF settings", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    const result = await callFunction("updateClubRfSettings", admin.idToken, {
      clubId,
      rfSettings: {
        organizationNumber: "123456-7890",
        rfOrganizationId: "RF-99",
        districtId: "district-01",
        kommunKod: "0180",
        defaultSport: "fotboll",
        integrationEnabled: true,
      },
    });

    expect(result.success).toBe(true);

    const club = await getDocument(`clubs/${clubId}`);
    expect(club?.rf?.organizationNumber).toBe("123456-7890");
  });

  it("rejects non-admin user", async () => {
    const admin = await createFullTestUser();
    const nonAdmin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    await expectFunctionError(
      "updateClubRfSettings",
      nonAdmin.idToken,
      {
        clubId,
        rfSettings: { organizationNumber: "123456-7890" },
      },
      "permission-denied",
    );
  });

  it("rejects unauthenticated call", async () => {
    await expectFunctionError(
      "updateClubRfSettings",
      "",
      { clubId: "any", rfSettings: {} },
      "unauthenticated",
    );
  });
});

// ─── generateLokReport ────────────────────────────────────────

describe("generateLokReport", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("generates a draft report for eligible SE club", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    const eventDate = new Date("2025-09-10");
    await seedEligibleEvent(clubId, "event1", eventDate);

    const result = await callFunction("generateLokReport", admin.idToken, {
      clubId,
      period: "2025-Q3",
    });

    expect(result.success).toBe(true);
    expect(result.reportId).toBeDefined();

    const report = await getDocument(`lokReports/${result.reportId}`);
    expect(report).toBeDefined();
    expect(report!.status).toBe("draft");
    expect(report!.clubId).toBe(clubId);
  });

  it("rejects non-admin caller", async () => {
    const admin = await createFullTestUser();
    const nonAdmin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    await expectFunctionError(
      "generateLokReport",
      nonAdmin.idToken,
      { clubId, period: "2025-Q3" },
      "permission-denied",
    );
  });

  it("rejects unauthenticated call", async () => {
    await expectFunctionError(
      "generateLokReport",
      "",
      { clubId: "any", period: "2025-Q3" },
      "unauthenticated",
    );
  });

  it("rejects missing period", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    await expectFunctionError(
      "generateLokReport",
      admin.idToken,
      { clubId },
      "invalid-argument",
    );
  });
});

// ─── listLokReports ───────────────────────────────────────────

describe("listLokReports", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("returns empty array when no reports exist", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    const result = await callFunction("listLokReports", admin.idToken, {
      clubId,
    });

    expect(result.success).toBe(true);
    expect(result.reports).toEqual([]);
  });

  it("lists generated reports", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);
    await seedEligibleEvent(clubId, "ev1", new Date("2025-09-05"));

    await callFunction("generateLokReport", admin.idToken, {
      clubId,
      period: "2025-Q3",
    });

    const result = await callFunction("listLokReports", admin.idToken, {
      clubId,
    });

    expect(result.success).toBe(true);
    expect(result.reports.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects non-admin caller", async () => {
    const admin = await createFullTestUser();
    const nonAdmin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    await expectFunctionError(
      "listLokReports",
      nonAdmin.idToken,
      { clubId },
      "permission-denied",
    );
  });
});

// ─── getLokReport ─────────────────────────────────────────────

describe("getLokReport", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("returns report detail for valid reportId", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);
    await seedEligibleEvent(clubId, "ev1", new Date("2025-09-05"));

    const genResult = await callFunction("generateLokReport", admin.idToken, {
      clubId,
      period: "2025-Q3",
    });

    const getResult = await callFunction("getLokReport", admin.idToken, {
      reportId: genResult.reportId,
    });

    expect(getResult.success).toBe(true);
    expect(getResult.report).toBeDefined();
    expect(getResult.report.status).toBe("draft");
  });

  it("returns not-found for invalid reportId", async () => {
    const admin = await createFullTestUser();
    await expectFunctionError(
      "getLokReport",
      admin.idToken,
      { reportId: "nonexistent" },
      "not-found",
    );
  });
});

// ─── deleteLokReport ──────────────────────────────────────────

describe("deleteLokReport", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("deletes a draft report", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);
    await seedEligibleEvent(clubId, "ev1", new Date("2025-09-05"));

    const genResult = await callFunction("generateLokReport", admin.idToken, {
      clubId,
      period: "2025-Q3",
    });

    const deleteResult = await callFunction("deleteLokReport", admin.idToken, {
      reportId: genResult.reportId,
    });

    expect(deleteResult.success).toBe(true);

    // Document should no longer exist
    const deleted = await getDocument(`lokReports/${genResult.reportId}`);
    expect(deleted).toBeUndefined();
  });

  it("rejects non-admin caller", async () => {
    const admin = await createFullTestUser();
    const nonAdmin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);
    await seedEligibleEvent(clubId, "ev1", new Date("2025-09-05"));

    const genResult = await callFunction("generateLokReport", admin.idToken, {
      clubId,
      period: "2025-Q3",
    });

    await expectFunctionError(
      "deleteLokReport",
      nonAdmin.idToken,
      { reportId: genResult.reportId },
      "permission-denied",
    );
  });

  it("returns not-found for invalid reportId", async () => {
    const admin = await createFullTestUser();
    await expectFunctionError(
      "deleteLokReport",
      admin.idToken,
      { reportId: "nonexistent" },
      "not-found",
    );
  });
});

// ─── resolveReportConflict ────────────────────────────────────

describe("resolveReportConflict", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("resolves a conflict with keep_first resolution", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    // Seed a report with a synthetic conflict directly in Firestore
    const db = getFirestore();
    const reportRef = db.collection("lokReports").doc();
    await reportRef.set({
      clubId,
      status: "draft",
      period: "2025-Q3",
      activities: [],
      conflicts: [
        {
          type: "TIME_OVERLAP",
          activityIds: ["event1", "event2"],
          affectedUserIds: ["member1"],
          resolved: false,
        },
      ],
      hasUnresolvedConflicts: true,
      createdAt: new Date(),
    });

    const result = await callFunction("resolveReportConflict", admin.idToken, {
      reportId: reportRef.id,
      conflictIndex: 0,
      resolution: "keep_first",
    });

    expect(result.success).toBe(true);
    expect(result.hasUnresolvedConflicts).toBe(false);

    const updatedReport = await getDocument(`lokReports/${reportRef.id}`);
    expect(updatedReport!.conflicts[0].resolved).toBe(true);
    expect(updatedReport!.conflicts[0].resolution).toBe("keep_first");
    expect(updatedReport!.hasUnresolvedConflicts).toBe(false);
  });

  it("rejects invalid resolution value", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    const db = getFirestore();
    const reportRef = db.collection("lokReports").doc();
    await reportRef.set({
      clubId,
      status: "draft",
      period: "2025-Q3",
      activities: [],
      conflicts: [
        {
          type: "TIME_OVERLAP",
          activityIds: [],
          affectedUserIds: [],
          resolved: false,
        },
      ],
      hasUnresolvedConflicts: true,
      createdAt: new Date(),
    });

    await expectFunctionError(
      "resolveReportConflict",
      admin.idToken,
      { reportId: reportRef.id, conflictIndex: 0, resolution: "invalid_value" },
      "invalid-argument",
    );
  });

  it("rejects out-of-range conflictIndex", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    const db = getFirestore();
    const reportRef = db.collection("lokReports").doc();
    await reportRef.set({
      clubId,
      status: "draft",
      period: "2025-Q3",
      activities: [],
      conflicts: [],
      hasUnresolvedConflicts: false,
      createdAt: new Date(),
    });

    await expectFunctionError(
      "resolveReportConflict",
      admin.idToken,
      { reportId: reportRef.id, conflictIndex: 5, resolution: "keep_first" },
      "out-of-range",
    );
  });

  it("rejects non-admin caller", async () => {
    const admin = await createFullTestUser();
    const nonAdmin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    const db = getFirestore();
    const reportRef = db.collection("lokReports").doc();
    await reportRef.set({
      clubId,
      status: "draft",
      activities: [],
      conflicts: [
        {
          type: "TIME_OVERLAP",
          activityIds: [],
          affectedUserIds: [],
          resolved: false,
        },
      ],
      hasUnresolvedConflicts: true,
      createdAt: new Date(),
    });

    await expectFunctionError(
      "resolveReportConflict",
      nonAdmin.idToken,
      { reportId: reportRef.id, conflictIndex: 0, resolution: "keep_first" },
      "permission-denied",
    );
  });

  it("rejects unauthenticated call", async () => {
    await expectFunctionError(
      "resolveReportConflict",
      "",
      { reportId: "any", conflictIndex: 0, resolution: "keep_first" },
      "unauthenticated",
    );
  });
});

// ─── generateKommunExport ─────────────────────────────────────

describe("generateKommunExport", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("generates CSV export for a submitted report", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);
    await seedEligibleEvent(clubId, "ev1", new Date("2025-09-05"));

    await callFunction("generateLokReport", admin.idToken, {
      clubId,
      period: "2025-Q3",
    });

    const result = await callFunction("generateKommunExport", admin.idToken, {
      clubId,
      period: "2025-Q3",
      format: "csv",
    });

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.mimeType).toContain("csv");
  });

  it("rejects non-admin caller", async () => {
    const admin = await createFullTestUser();
    const nonAdmin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    await expectFunctionError(
      "generateKommunExport",
      nonAdmin.idToken,
      { clubId, period: "2025-Q3", format: "csv" },
      "permission-denied",
    );
  });

  it("rejects missing clubId", async () => {
    const admin = await createFullTestUser();
    await expectFunctionError(
      "generateKommunExport",
      admin.idToken,
      { period: "2025-Q3", format: "csv" },
      "invalid-argument",
    );
  });
});
