#!/usr/bin/env node

/**
 * Seed Marketing Data
 * -------------------
 * Populates Firestore with realistic-looking events, attendance statistics,
 * membership fees, payments, and news so the app looks rich for marketing
 * screenshots.
 *
 * Prerequisites:
 *   1. `firebase login`  (so Application Default Credentials work)
 *   2. Node >= 18
 *
 * Usage:
 *   node scripts/seed-marketing-data.js            # seed data
 *   node scripts/seed-marketing-data.js --cleanup   # remove seeded data
 *
 * IDs are prefixed with "seed_" so cleanup can find them reliably.
 */

const admin = require("firebase-admin");

// ─── Configuration ───────────────────────────────────────────────────────────
const CLUB_ID = "PTZ3F78Sif6G4gdx6dBL";
const GROUP_ID = "hdTTrqio9XJJk5etMCll";
const USER_ID = "9Y687B3ro0gWcxHgQE2jTwT4pMw2"; // your uid
const SEED_PREFIX = "seed_";
const STATS_YEAR = "2025";

// ─── Init ────────────────────────────────────────────────────────────────────
const path = require("path");
const serviceAccountPath = path.join(
  require("os").homedir(),
  "Downloads",
  "sportnizer-firebase-adminsdk-fbsvc-a28e6962f3.json"
);
const serviceAccount = require(serviceAccountPath);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "sportnizer",
});
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a prefixed doc ID */
const seedId = (suffix) => `${SEED_PREFIX}${suffix}`;

/** Create a Firestore Timestamp from a Date */
const ts = (date) => Timestamp.fromDate(date);

/** Days offset from now */
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setSeconds(0, 0);
  return d;
};

/** Hours offset from a date */
const addHours = (date, h) => new Date(date.getTime() + h * 60 * 60 * 1000);

/** Pick random item from array */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Random int in [min, max] */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Shuffle array (Fisher-Yates) */
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ─── Swedish-flavoured fake data ─────────────────────────────────────────────

const TRAINING_TITLES = [
  "Träning",
  "Teknikträning",
  "Konditionsträning",
  "Passningsövning",
  "Skottträning",
];

const MATCH_TITLES = [
  "Tävlingsmatch vs IFK Norrköping",
  "Vänskapsmatch vs Malmö FF",
  "Cupmatch vs AIK",
  "Seriematch vs Djurgården",
  "Träningsmatch vs Hammarby",
];

const LOCATIONS = [
  "Zinkensdamms IP",
  "Eriksdalsbadet Arena",
  "Konstgräsplan 3, Grimsta",
  "Kristinebergs IP",
  "Gärdet Bollplan",
];

const NEWS_ITEMS = [
  {
    title: "Välkommen till nya säsongen!",
    description:
      "Vi kickar igång den nya säsongen med full energi. Träningsschema finns nu tillgängligt — se till att svara på era event! 💪",
  },
  {
    title: "Cupen i maj – anmälan öppen",
    description:
      "Anmälan till vårens stora cup är nu öppen. Vi behöver minst 12 spelare. Kontakta tränarna om ni har frågor.",
  },
  {
    title: "Ny utrustning har anlänt",
    description:
      "De nya matchställen och träningsbollarna finns att hämta på klubbhuset. Passa på att prova innan nästa match!",
  },
];

// ─── Core logic ──────────────────────────────────────────────────────────────

async function getExistingMembers() {
  const doc = await db
    .doc(`clubs/${CLUB_ID}/groups/${GROUP_ID}/allMembers/members`)
    .get();
  if (!doc.exists) {
    throw new Error("No members doc found — check CLUB_ID / GROUP_ID");
  }
  return doc.data().members || [];
}

async function getGroupInfo() {
  const doc = await db.doc(`clubs/${CLUB_ID}/groups/${GROUP_ID}`).get();
  if (!doc.exists) throw new Error("Group doc not found");
  return doc.data();
}

async function getClubInfo() {
  const doc = await db.doc(`clubs/${CLUB_ID}`).get();
  if (!doc.exists) throw new Error("Club doc not found");
  return doc.data();
}

// ─── Event seeding ───────────────────────────────────────────────────────────

function buildEvents(members, clubName, groupName) {
  const events = [];
  const now = new Date();

  // 8 past events (completed, with attendance)
  for (let i = 0; i < 8; i++) {
    const isPast = true;
    const dayOffset = -(i * 3 + randInt(1, 3)); // scattered in the past
    const startDate = daysFromNow(dayOffset);
    startDate.setHours(randInt(17, 19), 0, 0, 0);
    const endDate = addHours(startDate, 1.5);
    const eventType = i < 5 ? "training" : "match";
    const title =
      eventType === "training" ? pick(TRAINING_TITLES) : pick(MATCH_TITLES);
    const location = pick(LOCATIONS);

    const responses = members.map((m) => {
      const accepted = Math.random() > 0.2; // 80% acceptance
      const attended = accepted ? Math.random() > 0.1 : false; // 90% of accepted attend
      return {
        userId: m.userId,
        userName: m.name,
        photoUrl: m.photoURL || "",
        response: accepted ? "accepted" : "declined",
        respondedAt: ts(addHours(startDate, -24)),
        isYouthMember: (m.roles || []).includes("player-underage"),
        guardianIds: (m.guardiansContacts || []).map((g) => g.guardianUid),
        guardianNames: (m.guardiansContacts || []).map((g) => g.guardianName),
        actualAttendance: attended,
        recordedBy: USER_ID,
        recordedAt: ts(endDate),
        lokRole: (m.roles || []).includes("coach") ? "leader" : "participant",
      };
    });

    const accepted = responses.filter((r) => r.response === "accepted").length;
    const declined = responses.filter((r) => r.response === "declined").length;
    const attended = responses.filter((r) => r.actualAttendance === true).length;

    events.push({
      id: seedId(`event_past_${i}`),
      data: {
        eventId: seedId(`event_past_${i}`),
        title,
        description: eventType === "training"
          ? "Vanlig träning, ta med vattenflaska."
          : "Samling 30 min före avspark. Full matchutrustning.",
        eventType,
        startDate: ts(startDate),
        endDate: ts(endDate),
        gatheringTime: eventType === "match" ? ts(addHours(startDate, -0.5)) : null,
        responseDeadline: ts(addHours(startDate, -2)),
        location,
        targetScope: {
          level: "group",
          clubId: CLUB_ID,
          clubName,
          groupId: GROUP_ID,
          groupName,
        },
        invitedUserIds: members.map((m) => m.userId),
        roleFilter: null,
        capacity: eventType === "match" ? { min: 11, max: 16 } : null,
        responses,
        responseSummary: {
          totalInvited: members.length,
          accepted,
          declined,
          pending: 0,
          attended,
        },
        createdBy: USER_ID,
        createdByName: members.find((m) => m.userId === USER_ID)?.name || "Admin",
        createdAt: ts(addHours(startDate, -72)),
        updatedAt: ts(endDate),
        status: "completed",
        completedAt: ts(endDate),
        completedBy: USER_ID,
        completedByName:
          members.find((m) => m.userId === USER_ID)?.name || "Admin",
        isActive: true,
        isRecurring: false,
        version: 1,
      },
    });
  }

  // 5 upcoming events (with mixed responses)
  for (let i = 0; i < 5; i++) {
    const dayOffset = i * 3 + randInt(1, 3); // scattered in the future
    const startDate = daysFromNow(dayOffset);
    startDate.setHours(randInt(17, 19), 0, 0, 0);
    const endDate = addHours(startDate, 1.5);
    const eventType = i < 3 ? "training" : "match";
    const title =
      eventType === "training" ? pick(TRAINING_TITLES) : pick(MATCH_TITLES);
    const location = pick(LOCATIONS);

    const shuffled = shuffle(members);
    const responses = shuffled.map((m, idx) => {
      // First ~40% accepted, next ~20% declined, rest pending
      let response;
      if (idx < Math.floor(members.length * 0.4)) response = "accepted";
      else if (idx < Math.floor(members.length * 0.6)) response = "declined";
      else response = "pending";

      return {
        userId: m.userId,
        userName: m.name,
        photoUrl: m.photoURL || "",
        response,
        respondedAt: response !== "pending" ? ts(addHours(now, -randInt(1, 48))) : null,
        isYouthMember: (m.roles || []).includes("player-underage"),
        guardianIds: (m.guardiansContacts || []).map((g) => g.guardianUid),
        guardianNames: (m.guardiansContacts || []).map((g) => g.guardianName),
        lokRole: (m.roles || []).includes("coach") ? "leader" : "participant",
      };
    });

    const accepted = responses.filter((r) => r.response === "accepted").length;
    const declined = responses.filter((r) => r.response === "declined").length;
    const pending = responses.filter((r) => r.response === "pending").length;

    events.push({
      id: seedId(`event_upcoming_${i}`),
      data: {
        eventId: seedId(`event_upcoming_${i}`),
        title,
        description: eventType === "training"
          ? "Vanlig träning, ta med vattenflaska."
          : "Samling 30 min före avspark. Full matchutrustning.",
        eventType,
        startDate: ts(startDate),
        endDate: ts(endDate),
        gatheringTime: eventType === "match" ? ts(addHours(startDate, -0.5)) : null,
        responseDeadline: ts(addHours(startDate, -2)),
        location,
        targetScope: {
          level: "group",
          clubId: CLUB_ID,
          clubName,
          groupId: GROUP_ID,
          groupName,
        },
        invitedUserIds: members.map((m) => m.userId),
        roleFilter: null,
        capacity: eventType === "match" ? { min: 11, max: 16 } : null,
        responses,
        responseSummary: {
          totalInvited: members.length,
          accepted,
          declined,
          pending,
        },
        createdBy: USER_ID,
        createdByName: members.find((m) => m.userId === USER_ID)?.name || "Admin",
        createdAt: ts(addHours(startDate, -72)),
        updatedAt: ts(now),
        status: "scheduled",
        isActive: true,
        isRecurring: false,
        version: 1,
      },
    });
  }

  return events;
}

// ─── Statistics seeding ──────────────────────────────────────────────────────

function buildStatistics(members, groupName) {
  const memberStats = {};

  for (const m of members) {
    const isCoach = (m.roles || []).includes("coach");
    const invited = randInt(10, 15);
    const attended = randInt(Math.floor(invited * 0.4), invited);
    const acceptedCount = randInt(attended, Math.min(invited, attended + 2));
    const declinedCount = randInt(0, invited - acceptedCount);
    const attendanceRate = Math.round((attended / invited) * 100);
    const responseRate = Math.round(
      ((acceptedCount + declinedCount) / invited) * 100
    );

    const trainingInvited = randInt(6, 10);
    const trainingAttended = randInt(
      Math.floor(trainingInvited * 0.5),
      trainingInvited
    );
    const matchInvited = invited - trainingInvited;
    const matchAttended = attended - trainingAttended;

    memberStats[m.userId] = {
      userName: m.name,
      eventsInvitedTo: invited,
      eventsAccepted: acceptedCount,
      eventsDeclined: declinedCount,
      eventsAttended: attended,
      attendanceRate,
      responseRate,
      byEventType: {
        training: {
          invited: trainingInvited,
          attended: Math.max(0, trainingAttended),
        },
        match: {
          invited: Math.max(0, matchInvited),
          attended: Math.max(0, matchAttended),
        },
        meeting: { invited: 0, attended: 0 },
        other: { invited: 0, attended: 0 },
      },
      lastUpdated: ts(new Date()),
    };
  }

  const allRates = Object.values(memberStats).map((s) => s.attendanceRate);
  const avgRate = Math.round(
    allRates.reduce((a, b) => a + b, 0) / allRates.length
  );

  return {
    year: parseInt(STATS_YEAR),
    groupId: GROUP_ID,
    groupName,
    clubId: CLUB_ID,
    memberStats,
    groupAggregates: {
      totalEvents: 13, // 8 past events + 5 upcoming
      totalEventsByType: {
        training: 8,
        match: 5,
        meeting: 0,
        other: 0,
      },
      averageAttendanceRate: avgRate,
    },
    createdAt: ts(new Date()),
    lastUpdated: ts(new Date()),
  };
}

// ─── Membership fee & payments ───────────────────────────────────────────────

function buildFeeAndPayments(members, groupName) {
  const feeId = seedId("fee_spring_2025");
  const playingMembers = members.filter(
    (m) =>
      (m.roles || []).includes("player") ||
      (m.roles || []).includes("player-underage")
  );
  // If no players, fall back to all members
  const targetMembers = playingMembers.length > 0 ? playingMembers : members;

  const dueDate = daysFromNow(14);
  dueDate.setHours(23, 59, 59, 0);

  // ~60% have paid
  const shuffledMembers = shuffle(targetMembers);
  const paidCount = Math.max(1, Math.floor(targetMembers.length * 0.6));
  const paidMembers = shuffledMembers.slice(0, paidCount);
  const unpaidMembers = shuffledMembers.slice(paidCount);

  const fee = {
    id: feeId,
    data: {
      clubId: CLUB_ID,
      groupId: GROUP_ID,
      groupName,
      title: "Säsongsavgift Vår 2025",
      description: "Avgift för vårsäsongen inklusive plannyror och utrustning.",
      amount: 150000, // 1500 SEK in öre
      currency: "sek",
      dueDate: ts(dueDate),
      targetRoles: ["player", "player-underage"],
      includedMembers: targetMembers.map((m) => m.userId),
      totalExpected: targetMembers.length,
      totalPaid: paidCount,
      status: "active",
      createdBy: USER_ID,
      createdAt: ts(daysFromNow(-30)),
      lastModifiedAt: ts(new Date()),
    },
  };

  const payments = [];

  // Create payment records for paid members
  for (const m of paidMembers) {
    const paymentId = seedId(`pay_${m.userId.slice(0, 8)}`);
    const paidAt = daysFromNow(-randInt(1, 25));
    payments.push({
      id: paymentId,
      data: {
        feeId,
        feeTitle: "Säsongsavgift Vår 2025",
        clubId: CLUB_ID,
        groupId: GROUP_ID,
        payerId: m.userId,
        payerName: m.name,
        beneficiaryId: m.userId,
        beneficiaryName: m.name,
        amount: 150000,
        currency: "sek",
        platformFee: 4500, // 3%
        status: "succeeded",
        createdAt: ts(paidAt),
        paidAt: ts(paidAt),
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
      },
    });
  }

  // Build paymentStatus updates for group members doc
  const paymentStatusUpdates = {};
  for (const m of paidMembers) {
    paymentStatusUpdates[m.userId] = {
      activeFeeId: feeId,
      status: "paid",
      amount: 150000,
      currency: "sek",
      dueDate: ts(dueDate),
      paidBy: m.userId,
      paidAt: ts(daysFromNow(-randInt(1, 25))),
    };
  }
  for (const m of unpaidMembers) {
    paymentStatusUpdates[m.userId] = {
      activeFeeId: feeId,
      status: "pending",
      amount: 150000,
      currency: "sek",
      dueDate: ts(dueDate),
    };
  }

  // Notifications for unpaid members (so they show on home screen)
  const notifications = [];
  for (const m of unpaidMembers) {
    notifications.push({
      userId: m.userId,
      id: seedId(`notif_pay_${m.userId.slice(0, 8)}`),
      data: {
        type: "payment_request",
        title: "Betalningspåminnelse",
        message: `Säsongsavgift Vår 2025 — 1 500 kr. Förfaller ${dueDate.toLocaleDateString("sv-SE")}.`,
        sourceId: feeId,
        sourceCollection: "membershipFees",
        read: false,
        dismissed: false,
        clubId: CLUB_ID,
        clubName: "", // filled at write time
        groupId: GROUP_ID,
        groupName: "", // filled at write time
        metadata: {
          feeId,
          beneficiaryId: m.userId,
          beneficiaryName: m.name,
          amount: 150000,
          currency: "sek",
          dueDate: ts(dueDate),
        },
        createdAt: ts(daysFromNow(-5)),
        priority: "high",
      },
    });
  }

  return { fee, payments, paymentStatusUpdates, notifications };
}

// ─── News seeding ────────────────────────────────────────────────────────────

function buildNews(members, clubName, groupName) {
  return NEWS_ITEMS.map((item, i) => {
    const createdAt = daysFromNow(-(i * 7 + randInt(1, 5)));
    const readBy = shuffle(members)
      .slice(0, randInt(Math.floor(members.length * 0.3), members.length))
      .map((m) => ({
        userId: m.userId,
        readAt: ts(addHours(createdAt, randInt(1, 48))),
      }));

    return {
      id: seedId(`news_${i}`),
      data: {
        newsId: seedId(`news_${i}`),
        title: item.title,
        description: item.description,
        targetScope: {
          level: "group",
          clubId: CLUB_ID,
          clubName,
          groupId: GROUP_ID,
          groupName,
        },
        recipientUserIds: members.map((m) => m.userId),
        roleFilter: null,
        emailDelivery: { enabled: false },
        readBy,
        readCount: readBy.length,
        createdBy: USER_ID,
        createdByName:
          members.find((m) => m.userId === USER_ID)?.name || "Admin",
        createdAt: ts(createdAt),
        isActive: true,
        version: 1,
      },
    };
  });
}

// ─── Write to Firestore ──────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Reading existing data...");
  const [members, groupInfo, clubInfo] = await Promise.all([
    getExistingMembers(),
    getGroupInfo(),
    getClubInfo(),
  ]);
  const clubName = clubInfo.name || "Club";
  const groupName = groupInfo.name || "Group";

  console.log(`   Found ${members.length} members in ${groupName} (${clubName})`);

  if (members.length === 0) {
    console.error("❌ No members found. Aborting.");
    process.exit(1);
  }

  // Build all data
  console.log("🔨 Building seed data...");
  const events = buildEvents(members, clubName, groupName);
  const statistics = buildStatistics(members, groupName);
  const {
    fee,
    payments,
    paymentStatusUpdates,
    notifications,
  } = buildFeeAndPayments(members, groupName);
  const news = buildNews(members, clubName, groupName);

  // Write in batches (Firestore max 500 ops per batch)
  console.log("📝 Writing events...");
  {
    const batch = db.batch();
    for (const e of events) {
      batch.set(db.doc(`clubs/${CLUB_ID}/events/${e.id}`), e.data);
    }
    await batch.commit();
    console.log(`   ✅ ${events.length} events written`);
  }

  console.log("📊 Writing statistics...");
  {
    await db
      .doc(`clubs/${CLUB_ID}/groups/${GROUP_ID}/statistics/${STATS_YEAR}`)
      .set(statistics);
    console.log(`   ✅ Statistics for ${STATS_YEAR} written`);
  }

  console.log("💰 Writing membership fee...");
  {
    await db.doc(`membershipFees/${fee.id}`).set(fee.data);
    console.log(`   ✅ Fee "${fee.data.title}" written`);
  }

  console.log("💳 Writing payments...");
  {
    const batch = db.batch();
    for (const p of payments) {
      batch.set(db.doc(`payments/${p.id}`), p.data);
    }
    await batch.commit();
    console.log(`   ✅ ${payments.length} payment records written`);
  }

  console.log("📋 Updating member paymentStatus in group...");
  {
    // Read current members doc, update paymentStatus on each
    const membersRef = db.doc(
      `clubs/${CLUB_ID}/groups/${GROUP_ID}/allMembers/members`
    );
    const membersDoc = await membersRef.get();
    const currentMembers = membersDoc.data().members || [];
    const updatedMembers = currentMembers.map((m) => {
      if (paymentStatusUpdates[m.userId]) {
        return { ...m, paymentStatus: paymentStatusUpdates[m.userId] };
      }
      return m;
    });
    await membersRef.update({ members: updatedMembers });
    console.log(`   ✅ paymentStatus updated for ${Object.keys(paymentStatusUpdates).length} members`);
  }

  console.log("🔔 Writing payment notifications...");
  {
    const batch = db.batch();
    for (const n of notifications) {
      const notifData = { ...n.data, clubName, groupName };
      batch.set(db.doc(`users/${n.userId}/notifications/${n.id}`), notifData);
    }
    await batch.commit();
    console.log(`   ✅ ${notifications.length} notifications written`);
  }

  console.log("📰 Writing news...");
  {
    const batch = db.batch();
    for (const n of news) {
      batch.set(db.doc(`clubs/${CLUB_ID}/news/${n.id}`), n.data);
    }
    await batch.commit();
    console.log(`   ✅ ${news.length} news items written`);
  }

  console.log("\n🎉 Seeding complete! Your app should now look rich and full.");
  console.log("   Run with --cleanup to remove all seeded data.\n");
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log("🧹 Cleaning up seed data...\n");

  // 1. Events
  console.log("🗑  Deleting seeded events...");
  const eventsSnap = await db
    .collection(`clubs/${CLUB_ID}/events`)
    .where("eventId", ">=", SEED_PREFIX)
    .where("eventId", "<", SEED_PREFIX + "\uf8ff")
    .get();
  {
    const batch = db.batch();
    eventsSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`   ✅ ${eventsSnap.size} events deleted`);
  }

  // 2. Statistics
  console.log("🗑  Deleting seeded statistics...");
  await db
    .doc(`clubs/${CLUB_ID}/groups/${GROUP_ID}/statistics/${STATS_YEAR}`)
    .delete();
  console.log(`   ✅ Statistics for ${STATS_YEAR} deleted`);

  // 3. Membership fee
  console.log("🗑  Deleting seeded membership fee...");
  const feeId = seedId("fee_spring_2025");
  await db.doc(`membershipFees/${feeId}`).delete();
  console.log(`   ✅ Fee deleted`);

  // 4. Payments
  console.log("🗑  Deleting seeded payments...");
  const paymentsSnap = await db
    .collection("payments")
    .where("feeId", "==", feeId)
    .get();
  {
    const batch = db.batch();
    paymentsSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`   ✅ ${paymentsSnap.size} payments deleted`);
  }

  // 5. Remove paymentStatus from group members
  console.log("🗑  Removing paymentStatus from members...");
  const membersRef = db.doc(
    `clubs/${CLUB_ID}/groups/${GROUP_ID}/allMembers/members`
  );
  const membersDoc = await membersRef.get();
  if (membersDoc.exists) {
    const members = membersDoc.data().members || [];
    const cleaned = members.map((m) => {
      const { paymentStatus, ...rest } = m;
      return rest;
    });
    await membersRef.update({ members: cleaned });
    console.log(`   ✅ paymentStatus removed`);
  }

  // 6. Notifications (across all users with seed_ prefix)
  console.log("🗑  Deleting seeded notifications...");
  // Read members to get user IDs
  const membersDoc2 = await membersRef.get();
  const memberList = membersDoc2.exists ? membersDoc2.data().members || [] : [];
  let notifCount = 0;
  for (const m of memberList) {
    const notifsSnap = await db
      .collection(`users/${m.userId}/notifications`)
      .where("sourceId", "==", feeId)
      .get();
    if (notifsSnap.size > 0) {
      const batch = db.batch();
      notifsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      notifCount += notifsSnap.size;
    }
  }
  console.log(`   ✅ ${notifCount} notifications deleted`);

  // 7. News
  console.log("🗑  Deleting seeded news...");
  const newsSnap = await db
    .collection(`clubs/${CLUB_ID}/news`)
    .where("newsId", ">=", SEED_PREFIX)
    .where("newsId", "<", SEED_PREFIX + "\uf8ff")
    .get();
  {
    const batch = db.batch();
    newsSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`   ✅ ${newsSnap.size} news items deleted`);
  }

  console.log("\n🧹 Cleanup complete! All seeded data removed.\n");
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  try {
    if (process.argv.includes("--cleanup")) {
      await cleanup();
    } else {
      await seed();
    }
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message || err);
    console.error(err.stack);
    process.exit(1);
  }
})();
