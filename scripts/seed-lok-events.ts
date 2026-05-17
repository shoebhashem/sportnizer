/**
 * Seed script: Create test LOK-eligible completed events in Firestore.
 *
 * Usage (against emulator):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=sportnizer \
 *     npx ts-node scripts/seed-lok-events.ts
 *
 * Configuration:
 *   Set CLUB_ID env var or edit the constant below.
 */

import * as admin from "firebase-admin";

const CLUB_ID = process.env.CLUB_ID ?? "SEED_CLUB_001";
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? "sportnizer";

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

// ─── Helper: build a Firestore Timestamp from a local Date ────────

function ts(date: Date): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(date);
}

// ─── Members ─────────────────────────────────────────────────────

const MEMBERS = [
  { userId: "seed_u1", userName: "Alice Johansson", dateOfBirth: "2012-03-14", lokRole: "participant" },
  { userId: "seed_u2", userName: "Bob Karlsson",    dateOfBirth: "2011-07-22", lokRole: "participant" },
  { userId: "seed_u3", userName: "Clara Nilsson",   dateOfBirth: "2013-01-05", lokRole: "participant" },
  { userId: "seed_u4", userName: "David Eriksson",  dateOfBirth: "2010-09-30", lokRole: "participant" },
  { userId: "seed_u5", userName: "Emma Svensson",   dateOfBirth: "2012-11-17", lokRole: "participant" },
  { userId: "seed_u6", userName: "Fredrik Berg",    dateOfBirth: "2009-06-02", lokRole: "leader" },   // leader
];

// ─── Build a response record ──────────────────────────────────────

function mkResponse(
  member: (typeof MEMBERS)[number],
  attended: boolean,
): object {
  return {
    userId: member.userId,
    userName: member.userName,
    photoUrl: null,
    status: "going",
    actualAttendance: attended,
    lokRole: member.lokRole,
  };
}

// ─── Build an event document ─────────────────────────────────────

function mkEvent(opts: {
  title: string;
  groupId: string;
  groupName: string;
  startDate: Date;
  durationMinutes: number;
  attendingMemberIndexes: number[];
  eventType?: string;
}): object {
  const { title, groupId, groupName, startDate, durationMinutes, attendingMemberIndexes, eventType = "training" } = opts;
  const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);
  const attendedSet = new Set(attendingMemberIndexes);

  const responses = MEMBERS.map((m, idx) => mkResponse(m, attendedSet.has(idx)));
  const attendedCount = attendingMemberIndexes.length;

  return {
    title,
    groupId,
    groupName,
    eventType,
    startDate: ts(startDate),
    endDate: ts(endDate),
    status: "completed",
    completedAt: ts(endDate),
    responses,
    responseSummary: {
      total: MEMBERS.length,
      going: MEMBERS.length,
      attended: attendedCount,
    },
    lok: {
      eligible: true,
      durationMinutes,
      countedParticipants: attendedCount,
      reportId: null,
      reportingPeriod: null,
      conflictStatus: null,
      confirmedForPeriod: null,
    },
    createdAt: ts(startDate),
    updatedAt: ts(startDate),
    createdBy: "seed_u6",
    clubId: CLUB_ID,
  };
}

// ─── Seed events ─────────────────────────────────────────────────

const H1_2026_EVENTS = [
  // Group A — U12
  mkEvent({
    title: "Träning U12 v.5",
    groupId: "seed_g_u12",
    groupName: "U12",
    startDate: new Date("2026-01-28T17:00:00"),
    durationMinutes: 90,
    attendingMemberIndexes: [0, 1, 2, 5],
  }),
  mkEvent({
    title: "Träning U12 v.9",
    groupId: "seed_g_u12",
    groupName: "U12",
    startDate: new Date("2026-02-25T17:00:00"),
    durationMinutes: 90,
    attendingMemberIndexes: [0, 1, 3, 5],
  }),
  // TIME_OVERLAP conflict pair: same members (0,1,5) in overlapping windows
  mkEvent({
    title: "Träning U12 v.13 (A)",  // starts 17:00, ends 18:30
    groupId: "seed_g_u12",
    groupName: "U12",
    startDate: new Date("2026-03-25T17:00:00"),
    durationMinutes: 90,
    attendingMemberIndexes: [0, 1, 5],
  }),
  mkEvent({
    title: "Cupmatch U12 v.13 (B)", // starts 17:30, ends 19:00 — overlaps with (A)
    groupId: "seed_g_u12",
    groupName: "U12",
    startDate: new Date("2026-03-25T17:30:00"),
    durationMinutes: 90,
    attendingMemberIndexes: [0, 1, 5],  // same members → TIME_OVERLAP conflict
    eventType: "match",
  }),
  mkEvent({
    title: "Träning U12 v.17",
    groupId: "seed_g_u12",
    groupName: "U12",
    startDate: new Date("2026-04-22T17:00:00"),
    durationMinutes: 90,
    attendingMemberIndexes: [0, 2, 3, 5],
  }),

  // Group B — U14
  mkEvent({
    title: "Träning U14 v.6",
    groupId: "seed_g_u14",
    groupName: "U14",
    startDate: new Date("2026-02-04T18:00:00"),
    durationMinutes: 90,
    attendingMemberIndexes: [3, 4, 5],
  }),
  mkEvent({
    title: "Träning U14 v.11",
    groupId: "seed_g_u14",
    groupName: "U14",
    startDate: new Date("2026-03-11T18:00:00"),
    durationMinutes: 90,
    attendingMemberIndexes: [3, 4, 5],
  }),
  mkEvent({
    title: "Träning U14 v.20",
    groupId: "seed_g_u14",
    groupName: "U14",
    startDate: new Date("2026-05-13T18:00:00"),
    durationMinutes: 90,
    attendingMemberIndexes: [2, 3, 4, 5],
  }),
  mkEvent({
    title: "Träning U14 v.24",
    groupId: "seed_g_u14",
    groupName: "U14",
    startDate: new Date("2026-06-10T18:00:00"),
    durationMinutes: 90,
    attendingMemberIndexes: [3, 4, 5],
  }),
];

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌱 Seeding LOK events for club: ${CLUB_ID}`);
  console.log(`   Firestore emulator: ${process.env.FIRESTORE_EMULATOR_HOST ?? "(not set — using prod!)"}\n`);

  const collRef = db.collection("clubs").doc(CLUB_ID).collection("events");

  // Ensure the club doc exists (minimal)
  const clubRef = db.collection("clubs").doc(CLUB_ID);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) {
    await clubRef.set({
      name: "Seed FC",
      sport: "Fotboll",
      rf: {
        organizationNumber: "999999-9999",
        sportCode: "FOT",
        districtCode: "SDF",
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("  ✅ Created club doc for SEED_CLUB_001");
  }

  let created = 0;
  for (const event of H1_2026_EVENTS) {
    const docRef = await collRef.add(event);
    console.log(`  ✅ Created event: ${(event as any).title}  [${docRef.id}]`);
    created++;
  }

  console.log(`\n✨ Done. Created ${created} events in clubs/${CLUB_ID}/events`);
  console.log(`\nNext steps:`);
  console.log(`  1. Run listEligibleEvents({ clubId: "${CLUB_ID}", period: "${new Date().getFullYear()}-H1" })`);
  console.log(`  2. Hit "Bekräfta period" in the app to trigger conflict detection`);
  console.log(`  3. Expect TIME_OVERLAP on "Träning/Cupmatch U12 v.13"\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
