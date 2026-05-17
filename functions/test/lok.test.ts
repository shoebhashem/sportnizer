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
    getFirestore,
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
  // Set clubAccess on user document so isClubAdmin() checks pass
  await db
    .collection("users")
    .doc(adminUid)
    .update({
      clubAccess: [{ clubId: clubRef.id, role: "club-admin" }],
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
      startDate: startTime,
      endDate: endTime,
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
      personnummer: "199001010009",
      consentVersion: "v1",
    });
    expect(result.success).toBe(true);
    expect(result.birthDate).toBe("19900101");

    const doc = await getDocument(`users/${user.uid}`);
    expect(doc?.personalNumber?.birthDate).toBe("19900101");
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
      personnummer: "199001010009",
      consentVersion: "v1",
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
    expect(result.hasPersonnummer).toBe(false);
  });

  it("returns stored=true after storing", async () => {
    const user = await createFullTestUser();
    await callFunction("storePersonnummer", user.idToken, {
      personnummer: "199001010009",
      consentVersion: "v1",
    });
    const result = await callFunction(
      "getPersonnummerStatus",
      user.idToken,
      {},
    );
    expect(result.hasPersonnummer).toBe(true);
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
      period: "2025-H2",
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
      { clubId, period: "2025-H2" },
      "permission-denied",
    );
  });

  it("rejects unauthenticated call", async () => {
    await expectFunctionError(
      "generateLokReport",
      "",
      { clubId: "any", period: "2025-H2" },
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
      period: "2025-H2",
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
      period: "2025-H2",
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
      period: "2025-H2",
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
      period: "2025-H2",
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
      period: "2025-H2",
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
      period: "2025-H2",
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
      period: "2025-H2",
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
      period: "2025-H2",
    });

    const result = await callFunction("generateKommunExport", admin.idToken, {
      clubId,
      period: "2025-H2",
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
      { clubId, period: "2025-H2", format: "csv" },
      "permission-denied",
    );
  });

  it("rejects missing clubId", async () => {
    const admin = await createFullTestUser();
    await expectFunctionError(
      "generateKommunExport",
      admin.idToken,
      { period: "2025-H2", format: "csv" },
      "invalid-argument",
    );
  });
});

// ─── reEditAttendance ─────────────────────────────────────────

describe("reEditAttendance", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("allows club admin to re-edit attendance on a completed event", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);
    const db = getFirestore();

    // Seed a completed event with responses
    const eventRef = db.collection("clubs").doc(clubId).collection("events").doc("ev_redit_1");
    await eventRef.set({
      title: "Träning",
      startDate: new Date("2026-03-01T10:00:00"),
      endDate: new Date("2026-03-01T11:30:00"),
      status: "completed",
      completedAt: new Date(),
      lok: { eligible: true },
      responses: [
        { userId: "u1", userName: "Alice", actualAttendance: true,  lokRole: "participant" },
        { userId: "u2", userName: "Bob",   actualAttendance: false, lokRole: "participant" },
        { userId: "u3", userName: "Clara", actualAttendance: true,  lokRole: "leader" },
      ],
      responseSummary: { total: 3, going: 3, attended: 2 },
    });

    const result = await callFunction("reEditAttendance", admin.idToken, {
      eventId: "ev_redit_1",
      clubId,
      attendanceRecords: [
        { userId: "u1", attended: false },
        { userId: "u2", attended: true },
        { userId: "u3", attended: true },
      ],
      recordedBy: admin.uid,
    });
    expect(result.success).toBe(true);
    expect(result.attendedCount).toBe(2);

    const updated = await eventRef.get();
    const u1 = updated.data()!.responses.find((r: any) => r.userId === "u1");
    expect(u1.actualAttendance).toBe(false);
    const u2 = updated.data()!.responses.find((r: any) => r.userId === "u2");
    expect(u2.actualAttendance).toBe(true);
    // Conflict status should be cleared
    expect(updated.data()!.lok.conflictStatus).toBeUndefined();
  });

  it("marks linked LOK report as stale when re-editing", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);
    const db = getFirestore();

    // Create a draft LOK report first
    const reportRef = await db.collection("lokReports").add({
      clubId,
      period: "2026-H1",
      status: "draft",
      activities: [{ eventId: "ev_stale_1" }],
      createdAt: new Date(),
    });

    // Seed an event that references this report
    await db.collection("clubs").doc(clubId).collection("events").doc("ev_stale_1").set({
      title: "Träning",
      startDate: new Date("2026-02-01T10:00:00"),
      endDate:   new Date("2026-02-01T11:30:00"),
      status: "completed",
      completedAt: new Date(),
      lok: { eligible: true, reportId: reportRef.id, reportingPeriod: "2026-H1" },
      responses: [
        { userId: "u1", userName: "Alice", actualAttendance: true,  lokRole: "participant" },
        { userId: "u2", userName: "Bob",   actualAttendance: true,  lokRole: "participant" },
        { userId: "u3", userName: "Clara", actualAttendance: true,  lokRole: "leader" },
      ],
      responseSummary: { total: 3, going: 3, attended: 3 },
    });

    await callFunction("reEditAttendance", admin.idToken, {
      eventId: "ev_stale_1",
      clubId,
      attendanceRecords: [
        { userId: "u1", attended: false },
        { userId: "u2", attended: true },
        { userId: "u3", attended: true },
      ],
      recordedBy: admin.uid,
    });

    const updatedReport = await db.collection("lokReports").doc(reportRef.id).get();
    expect(updatedReport.data()!.status).toBe("stale");
    expect(updatedReport.data()!.staledByEvent).toBe("ev_stale_1");
  });

  it("rejects non-admin caller", async () => {
    const admin = await createFullTestUser();
    const nonAdmin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    await expectFunctionError(
      "reEditAttendance",
      nonAdmin.idToken,
      { eventId: "ev_x", clubId, attendanceRecords: [{ userId: "u1", attended: false }], recordedBy: nonAdmin.uid },
      "permission-denied",
    );
  });

  it("rejects non-completed events", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);
    const db = getFirestore();

    await db.collection("clubs").doc(clubId).collection("events").doc("ev_open").set({
      title: "Öppen träning",
      status: "open",
      lok: { eligible: true },
      responses: [],
    });

    await expectFunctionError(
      "reEditAttendance",
      admin.idToken,
      { eventId: "ev_open", clubId, attendanceRecords: [{ userId: "u1", attended: false }], recordedBy: admin.uid },
      "failed-precondition",
    );
  });

  it("rejects unauthenticated call", async () => {
    await expectFunctionError(
      "reEditAttendance",
      "",
      { eventId: "ev_x", clubId: "c1", attendanceRecords: [], recordedBy: "u1" },
      "unauthenticated",
    );
  });
});

// ─── listEligibleEvents ───────────────────────────────────────

describe("listEligibleEvents", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("returns eligible events for a period", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    // Seed two eligible events in H1 2026
    await seedEligibleEvent(clubId, "ev_h1_a", new Date("2026-02-10"));
    await seedEligibleEvent(clubId, "ev_h1_b", new Date("2026-04-15"));
    // One outside the period (H2 2026)
    await seedEligibleEvent(clubId, "ev_h2_a", new Date("2026-08-01"));

    const result = await callFunction("listEligibleEvents", admin.idToken, {
      clubId,
      period: "2026-H1",
    });
    expect(result.success).toBe(true);
    expect(result.events.length).toBeGreaterThanOrEqual(2);
    const ids = result.events.map((e: any) => e.id);
    expect(ids).toContain("ev_h1_a");
    expect(ids).toContain("ev_h1_b");
    expect(ids).not.toContain("ev_h2_a");
  });

  it("returns empty array when no eligible events", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    const result = await callFunction("listEligibleEvents", admin.idToken, {
      clubId,
      period: "2020-H1",
    });
    expect(result.success).toBe(true);
    expect(result.events).toEqual([]);
  });

  it("filters by groupId when provided", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);
    const db = getFirestore();

    // Seed events in two groups
    for (const [id, gId] of [["ev_ga1", "group_a"], ["ev_ga2", "group_a"], ["ev_gb1", "group_b"]]) {
      await db.collection("clubs").doc(clubId).collection("events").doc(id).set({
        title: id,
        groupId: gId,
        groupName: gId,
        startDate: new Date("2026-03-01T10:00:00"),
        endDate: new Date("2026-03-01T11:30:00"),
        status: "completed",
        completedAt: new Date(),
        lok: { eligible: true },
        responses: [
          { userId: "l1", userName: "Leader", actualAttendance: true, lokRole: "leader" },
          { userId: "m1", userName: "Member1", actualAttendance: true, lokRole: "participant" },
          { userId: "m2", userName: "Member2", actualAttendance: true, lokRole: "participant" },
          { userId: "m3", userName: "Member3", actualAttendance: true, lokRole: "participant" },
        ],
      });
    }

    const result = await callFunction("listEligibleEvents", admin.idToken, {
      clubId,
      period: "2026-H1",
      groupId: "group_a",
    });
    expect(result.success).toBe(true);
    const ids = result.events.map((e: any) => e.id);
    expect(ids).toContain("ev_ga1");
    expect(ids).toContain("ev_ga2");
    expect(ids).not.toContain("ev_gb1");
  });

  it("rejects non-admin caller", async () => {
    const admin = await createFullTestUser();
    const nonAdmin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);

    await expectFunctionError(
      "listEligibleEvents",
      nonAdmin.idToken,
      { clubId, period: "2026-H1" },
      "permission-denied",
    );
  });
});

// ─── generateLokReport – force mode ──────────────────────────

describe("generateLokReport (force mode)", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("replaces an existing draft report when force=true", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);
    const db = getFirestore();

    // Seed eligible events
    await seedEligibleEvent(clubId, "ev_force_1", new Date("2026-02-01"));
    await seedEligibleEvent(clubId, "ev_force_2", new Date("2026-04-01"));

    // First generate — creates draft
    const first = await callFunction("generateLokReport", admin.idToken, {
      clubId,
      period: "2026-H1",
    });
    expect(first.success).toBe(true);
    const firstId = first.reportId;

    // Second generate with force=true — should replace
    const second = await callFunction("generateLokReport", admin.idToken, {
      clubId,
      period: "2026-H1",
      force: true,
    });
    expect(second.success).toBe(true);
    expect(second.reportId).not.toEqual(firstId);

    // Old report should be deleted
    const oldReport = await db.collection("lokReports").doc(firstId).get();
    expect(oldReport.exists).toBe(false);
  });

  it("replaces a stale report when force=true", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);
    const db = getFirestore();

    // Manually seed a stale report
    const staleRef = await db.collection("lokReports").add({
      clubId,
      period: "2026-H1",
      status: "stale",
      activities: [],
      createdAt: new Date(),
    });

    await seedEligibleEvent(clubId, "ev_stale_force", new Date("2026-03-15"));

    const result = await callFunction("generateLokReport", admin.idToken, {
      clubId,
      period: "2026-H1",
      force: true,
    });
    expect(result.success).toBe(true);

    const staleReport = await db.collection("lokReports").doc(staleRef.id).get();
    expect(staleReport.exists).toBe(false);
  });

  it("blocks overwriting a submitted/accepted report even with force=true", async () => {
    const admin = await createFullTestUser();
    const clubId = await createSwedishClub(admin.idToken, admin.uid);
    const db = getFirestore();

    // Seed a submitted report
    await db.collection("lokReports").add({
      clubId,
      period: "2026-H1",
      status: "submitted",
      activities: [],
      createdAt: new Date(),
    });

    await expectFunctionError(
      "generateLokReport",
      admin.idToken,
      { clubId, period: "2026-H1", force: true },
      "already-exists",
    );
  });
});

// ─── storePersonnummer (birthDate field) ─────────────────────

describe("storePersonnummer – birthDate field", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("returns birthDate (not lastFour) on success", async () => {
    const user = await createFullTestUser();
    const result = await callFunction("storePersonnummer", user.idToken, {
      personnummer: "199001010009",
      consentVersion: "v1",
    });
    expect(result.success).toBe(true);
    expect(result.birthDate).toBe("19900101");
    // Ensure legacy field is not present
    expect(result.lastFour).toBeUndefined();
  });

  it("persists birthDate on the user document", async () => {
    const user = await createFullTestUser();
    await callFunction("storePersonnummer", user.idToken, {
      personnummer: "198503121231",
      consentVersion: "v1",
    });
    const doc = await getDocument(`users/${user.uid}`);
    expect(doc?.personalNumber?.birthDate).toBe("19850312");
    expect(doc?.personalNumber?.lastFour).toBeUndefined();
  });
});

// ─── getPersonnummerStatus – birthDate field ──────────────────

describe("getPersonnummerStatus – birthDate field", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("returns birthDate after storing", async () => {
    const user = await createFullTestUser();
    await callFunction("storePersonnummer", user.idToken, {
      personnummer: "199001010009",
      consentVersion: "v1",
    });
    const result = await callFunction("getPersonnummerStatus", user.idToken, {});
    expect(result.hasPersonnummer).toBe(true);
    expect(result.birthDate).toBe("19900101");
  });

  it("returns birthDate=null when no personnummer stored", async () => {
    const user = await createFullTestUser();
    const result = await callFunction("getPersonnummerStatus", user.idToken, {});
    expect(result.hasPersonnummer).toBe(false);
    expect(result.birthDate).toBeNull();
  });
});

// ─── storePersonnummerForDependent ────────────────────────────

describe("storePersonnummerForDependent", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("allows guardian to store personnummer for dependent", async () => {
    const guardian = await createFullTestUser();
    const child = await createFullTestUser();
    const db = getFirestore();

    // Set up guardian relationship on child document
    await db.doc(`users/${child.uid}`).update({
      guardians: [{ guardianUid: guardian.uid, name: "Guardian" }],
    });

    const result = await callFunction(
      "storePersonnummerForDependent",
      guardian.idToken,
      {
        targetUserId: child.uid,
        personnummer: "201001012341",
        consentVersion: "v1",
      },
    );
    expect(result.success).toBe(true);
    expect(result.birthDate).toBe("20100101");

    const doc = await getDocument(`users/${child.uid}`);
    expect(doc?.personalNumber?.birthDate).toBe("20100101");
  });

  it("rejects non-guardian caller", async () => {
    const caller = await createFullTestUser();
    const child = await createFullTestUser();

    await expectFunctionError(
      "storePersonnummerForDependent",
      caller.idToken,
      {
        targetUserId: child.uid,
        personnummer: "201001012345",
        consentVersion: "v1",
      },
      "permission-denied",
    );
  });

  it("rejects unauthenticated call", async () => {
    await expectFunctionError(
      "storePersonnummerForDependent",
      "",
      { targetUserId: "someuid", personnummer: "201001012345", consentVersion: "v1" },
      "unauthenticated",
    );
  });
});

// ─── removePersonnummerForDependent ──────────────────────────

describe("removePersonnummerForDependent", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("allows guardian to remove personnummer for dependent", async () => {
    const guardian = await createFullTestUser();
    const child = await createFullTestUser();
    const db = getFirestore();

    await db.doc(`users/${child.uid}`).update({
      guardians: [{ guardianUid: guardian.uid, name: "Guardian" }],
      personalNumber: { birthDate: "20100101", encrypted: "enc-value" },
    });

    const result = await callFunction(
      "removePersonnummerForDependent",
      guardian.idToken,
      { targetUserId: child.uid },
    );
    expect(result.success).toBe(true);

    const doc = await getDocument(`users/${child.uid}`);
    expect(doc?.personalNumber).toBeUndefined();
  });

  it("rejects non-guardian caller", async () => {
    const caller = await createFullTestUser();
    const child = await createFullTestUser();

    await expectFunctionError(
      "removePersonnummerForDependent",
      caller.idToken,
      { targetUserId: child.uid },
      "permission-denied",
    );
  });
});

// ─── getPersonnummerStatusForDependent ───────────────────────

describe("getPersonnummerStatusForDependent", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("allows guardian to get personnummer status for dependent", async () => {
    const guardian = await createFullTestUser();
    const child = await createFullTestUser();
    const db = getFirestore();

    await db.doc(`users/${child.uid}`).update({
      guardians: [{ guardianUid: guardian.uid, name: "Guardian" }],
      personalNumber: { birthDate: "20100101", encrypted: "enc-value" },
    });

    const result = await callFunction(
      "getPersonnummerStatusForDependent",
      guardian.idToken,
      { targetUserId: child.uid },
    );
    expect(result.hasPersonnummer).toBe(true);
    expect(result.birthDate).toBe("20100101");
  });

  it("rejects non-guardian caller", async () => {
    const caller = await createFullTestUser();
    const child = await createFullTestUser();

    await expectFunctionError(
      "getPersonnummerStatusForDependent",
      caller.idToken,
      { targetUserId: child.uid },
      "permission-denied",
    );
  });

  it("rejects unauthenticated call", async () => {
    await expectFunctionError(
      "getPersonnummerStatusForDependent",
      "",
      { targetUserId: "someuid" },
      "unauthenticated",
    );
  });
});

