/* eslint-disable */
/**
 * Club admin operations for support requests, run from the
 * "Club admin (support)" GitHub Actions workflow.
 *
 *   ACTION=lookup       Find a club by ID or name and report a summary.
 *                       Read-only.
 *   ACTION=soft-delete  Mark ONE club (by exact ID) for deletion, exactly like
 *                       the app's deleteClub function: isActive=false and
 *                       deletionScheduledAt = now + 30 days on the club, its
 *                       groups and subgroups, and deactivates the club on
 *                       every member's profile. If the club is already
 *                       marked, only the profiles are synced. The weekly
 *                       cleanup deletes it
 *                       permanently afterwards; until then it can be
 *                       reactivated. Only allowed if the requester e-mail belongs
 *                       to a club-admin of that club.
 *
 * The repository is public, so GitHub Actions logs are public too:
 * this script never prints e-mail addresses, names or member details,
 * only counts, IDs, yes/no checks and masked e-mails.
 *
 * The requester's e-mail is passed only as a SHA-256 hash (workflow inputs are
 * public in a public repo), and compared with hashes of the admins' e-mails.
 *
 * Env: ACTION, CLUB (ID or name),
 *      REQUESTER_EMAIL_SHA256 (sha256 of the lower-cased, trimmed e-mail;
 *      optional for lookup, required for soft-delete),
 *      GOOGLE_APPLICATION_CREDENTIALS (set by google-github-actions/auth).
 */

const fs = require("fs");
const crypto = require("crypto");
const admin = require("firebase-admin");

const PROJECT_ID = "sportnizer";
const GRACE_PERIOD_DAYS = 30;

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const summaryLines = [];
function out(line = "") {
  console.log(line);
  summaryLines.push(line);
}
function flushSummary() {
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryLines.join("\n") + "\n");
  }
}
function fail(message) {
  out(`❌ ${message}`);
  flushSummary();
  process.exit(1);
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "(none)";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}
function sha256(text) {
  return crypto.createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
}
function normalize(text) {
  return (text || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function fmtDate(value) {
  if (!value) return "-";
  const d = value.toDate ? value.toDate() : new Date(value);
  return isNaN(d.getTime()) ? "-" : d.toISOString().slice(0, 10);
}

/** Find clubs by exact document ID, else by name (accent/case-insensitive). */
async function findClubs(query) {
  const byId = await db.collection("clubs").doc(query).get();
  if (byId.exists) return { matches: [byId], how: "id" };

  const all = await db.collection("clubs").select("name").get();
  const q = normalize(query);
  const exact = all.docs.filter((d) => normalize(d.get("name")) === q);
  if (exact.length) return { matches: exact, how: "exact name" };
  const partial = all.docs.filter((d) => normalize(d.get("name")).includes(q));
  return { matches: partial, how: "partial name" };
}

/** Collect club info. Returns admin e-mails separately (never printed). */
async function describeClub(clubDoc) {
  const clubRef = clubDoc.ref;
  const club = (await clubRef.get()).data() || {};

  const membersDoc = await clubRef.collection("allMembers").doc("members").get();
  const members = (membersDoc.exists && membersDoc.data().members) || [];
  const activeMembers = members.filter((m) => m.isActive !== false);
  const adminIds = members
    .filter((m) => (m.roles || []).includes("club-admin") && m.isActive !== false)
    .map((m) => m.userId)
    .filter(Boolean);

  const adminEmails = [];
  for (const uid of adminIds) {
    const user = await db.collection("users").doc(uid).get();
    const email = user.exists ? user.get("email") : null;
    if (email) {
      adminEmails.push({ uid, email: email.toLowerCase(), hash: sha256(email) });
    }
  }

  const groups = await clubRef.collection("groups").get();
  return {
    id: clubRef.id,
    name: club.name || "(no name)",
    isActive: club.isActive !== false,
    deletionScheduledAt: club.deletionScheduledAt,
    createdAt: club.createdAt,
    memberCount: activeMembers.length,
    groupCount: groups.size,
    adminIds,
    adminEmails,
  };
}

function printClub(info, requesterHash) {
  const requesterAdmin = requesterHash ?
    info.adminEmails.find((a) => a.hash === requesterHash) :
    null;
  out(`### ${info.name}`);
  out("");
  out("| | |");
  out("|---|---|");
  out(`| Club ID | \`${info.id}\` |`);
  out(`| Status | ${info.isActive ? "active" : `marked for deletion (on ${fmtDate(info.deletionScheduledAt)})`} |`);
  out(`| Created | ${fmtDate(info.createdAt)} |`);
  out(`| Active members | ${info.memberCount} |`);
  out(`| Groups | ${info.groupCount} |`);
  out(`| Club admins | ${info.adminIds.length} (${info.adminEmails.map((a) => maskEmail(a.email)).join(", ") || "no e-mail found"}) |`);
  if (requesterHash) {
    out(`| Requester is a club admin | ${requesterAdmin ? `✅ YES (${maskEmail(requesterAdmin.email)})` : "❌ NO"} |`);
  }
  out("");
  return requesterAdmin;
}

// Mirrors functions/src/clubs/clubAccessDeletionSync.ts (markClubAccessDeleted).
// Keep the two in sync.
const CLUB_DELETION_REASON = "club-deletion";

function buildFlatArrays(clubAccess) {
  // Mirrors functions/src/utils/flatArrayHelpers.ts (without guardianOfGroups)
  const r = { adminOfClubs: [], memberOfClubs: [], adminOfGroups: [], coachOfGroups: [], memberOfGroups: [] };
  for (const ca of clubAccess || []) {
    if (ca.isActive === false) continue;
    if (ca.role === "club-admin") r.adminOfClubs.push(ca.clubId);
    else if (ca.role === "member") r.memberOfClubs.push(ca.clubId);
    for (const ga of ca.groupAccess || []) {
      if (ga.isActive === false) continue;
      const roles = ga.roles || [];
      if (roles.length > 0) r.memberOfGroups.push(ga.groupId);
      if (roles.includes("admin")) r.adminOfGroups.push(ga.groupId);
      if (roles.includes("coach")) r.coachOfGroups.push(ga.groupId);
    }
  }
  return r;
}

async function markClubAccessDeleted(clubId, deletionScheduledAt) {
  const ids = new Set();
  const membersDoc = await db.collection("clubs").doc(clubId).collection("allMembers").doc("members").get();
  for (const m of (membersDoc.exists && membersDoc.data().members) || []) if (m && m.userId) ids.add(m.userId);
  for (const field of ["adminOfClubs", "memberOfClubs"]) {
    const snap = await db.collection("users").where(field, "array-contains", clubId).select().get();
    snap.docs.forEach((d) => ids.add(d.id));
  }

  let updated = 0;
  let errors = 0;
  for (const userId of ids) {
    try {
      const userRef = db.collection("users").doc(userId);
      const changed = await db.runTransaction(async (tx) => {
        const userDoc = await tx.get(userRef);
        if (!userDoc.exists) return false;
        const clubAccess = userDoc.get("clubAccess") || [];
        let didChange = false;
        const next = clubAccess.map((entry) => {
          if (!entry || entry.clubId !== clubId || entry.isActive === false) return entry;
          didChange = true;
          return {
            ...entry,
            isActive: false,
            deletionScheduledAt,
            inactiveReason: CLUB_DELETION_REASON,
            groupAccess: (entry.groupAccess || []).map((g) =>
              g && g.isActive === false ? g : { ...g, isActive: false, deletionScheduledAt, inactiveReason: CLUB_DELETION_REASON },
            ),
          };
        });
        if (!didChange) return false;
        tx.update(userRef, { clubAccess: next, ...buildFlatArrays(next), version: FieldValue.increment(1) });
        return true;
      });
      if (changed) updated++;
    } catch (e) {
      errors++;
      console.error("profile update failed for one member:", e.message);
    }
  }
  return { checked: ids.size, updated, errors };
}

async function softDelete(info, requesterAdmin) {
  const clubRef = db.collection("clubs").doc(info.id);
  const deletionTimestamp = Timestamp.fromMillis(
    Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );
  const deletedBy = requesterAdmin.uid;

  // Same fields as functions/src/clubs/deleteClub.ts
  await clubRef.update({
    isActive: false,
    deletionScheduledAt: deletionTimestamp,
    deletedBy,
    deletedAt: FieldValue.serverTimestamp(),
    deletionReason: "support-request",
    verificationToken: null,
    lastModifiedAt: FieldValue.serverTimestamp(),
    version: FieldValue.increment(1),
  });

  // Same as deleteClub: decrement the requesting admin's active clubs counter
  await db.collection("users").doc(deletedBy).update({
    activeClubsAsAdmin: FieldValue.increment(-1),
  });

  const groups = await clubRef.collection("groups").get();
  let groupCount = 0;
  let subgroupCount = 0;
  let batch = db.batch();
  let ops = 0;
  const commitIfFull = async () => {
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };
  const softDeleteFields = {
    isActive: false,
    deletionScheduledAt: deletionTimestamp,
    deletedBy,
    deletedAt: FieldValue.serverTimestamp(),
    deletionReason: "club-deletion",
  };
  for (const groupDoc of groups.docs) {
    batch.update(groupDoc.ref, softDeleteFields);
    ops++;
    groupCount++;
    await commitIfFull();
    const subgroups = await groupDoc.ref.collection("subgroups").get();
    for (const sub of subgroups.docs) {
      batch.update(sub.ref, softDeleteFields);
      ops++;
      subgroupCount++;
      await commitIfFull();
    }
  }
  if (ops > 0) await batch.commit();

  const profiles = await markClubAccessDeleted(info.id, deletionTimestamp);

  out(`✅ Club \`${info.id}\` marked for deletion: ${groupCount} groups and ${subgroupCount} subgroups too.`);
  out(`   Member profiles updated: ${profiles.updated} of ${profiles.checked} (${profiles.errors} errors).`);
  out(`   Permanent deletion by the weekly cleanup after ${fmtDate(deletionTimestamp)}.`);
  out("   Until then it can be undone with reactivateClub.");
}

async function main() {
  const action = (process.env.ACTION || "").trim();
  const query = (process.env.CLUB || "").trim();
  const requesterHash = (process.env.REQUESTER_EMAIL_SHA256 || "").trim().toLowerCase() || null;
  if (requesterHash && !/^[0-9a-f]{64}$/.test(requesterHash)) {
    fail("REQUESTER_EMAIL_SHA256 must be a 64-character hex SHA-256 hash");
  }

  if (!["lookup", "soft-delete"].includes(action)) fail(`Unknown action "${action}"`);
  if (!query) fail("CLUB (club ID or name) is required");

  out(`## Club admin: ${action}`);
  out("");

  if (action === "lookup") {
    const { matches, how } = await findClubs(query);
    if (!matches.length) fail(`No club found for "${query}"`);
    out(`Found ${matches.length} club(s) by ${how}.`);
    out("");
    for (const doc of matches.slice(0, 10)) {
      printClub(await describeClub(doc), requesterHash);
    }
    if (matches.length > 10) out(`…and ${matches.length - 10} more. Narrow the search.`);
    flushSummary();
    return;
  }

  // soft-delete: exact club ID only, requester must be a club admin
  if (!requesterHash) fail("REQUESTER_EMAIL_SHA256 is required for soft-delete");
  const clubDoc = await db.collection("clubs").doc(query).get();
  if (!clubDoc.exists) fail(`soft-delete needs an exact club ID; no club with ID "${query}"`);

  const info = await describeClub(clubDoc);
  const requesterAdmin = printClub(info, requesterHash);
  if (!requesterAdmin) fail("Requester is NOT a club admin of this club. Nothing changed.");

  if (!info.isActive) {
    // Already marked: only make sure members' profiles are in sync
    // (clubs soft-deleted before profiles were updated automatically).
    const profiles = await markClubAccessDeleted(info.id, info.deletionScheduledAt);
    out("ℹ️ Club is already marked for deletion; the club itself was not changed.");
    out(`   Member profiles updated: ${profiles.updated} of ${profiles.checked} (${profiles.errors} errors).`);
    flushSummary();
    return;
  }

  await softDelete(info, requesterAdmin);
  flushSummary();
}

main().catch((error) => {
  console.error(error);
  fail(`Unexpected error: ${error.message}`);
});
