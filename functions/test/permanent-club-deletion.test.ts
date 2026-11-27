/**
 * Permanent club / group deletion tests
 *
 * Verifies that permanentlyDeleteClub removes ALL club data (including nested
 * subcollections, invitations and Storage files) while KEEPING bookkeeping
 * records, payments, membership fees and LOK reports, and never touching
 * other clubs.
 *
 * Calls the helpers directly (they are not callable functions).
 * Runs against Firebase Emulators (Firestore + Storage).
 */

import {
  clearAll,
  documentExists,
  getAdmin,
  getFirestore,
} from "./helpers";
import { permanentlyDeleteClub } from "../src/clubs/permanentlyDeleteClub";
import { permanentlyDeleteGroup } from "../src/groups/permanentlyDeleteGroup";

const BUCKET = "sportnizer.firebasestorage.app";
const CLUB = "club-to-delete";
const OTHER_CLUB = "club-to-keep";
const GROUP = "group-to-delete";
const OTHER_GROUP = "group-in-other-club";

// Paths that must be GONE after deleting CLUB
const DELETED_DOCS = [
  `clubs/${CLUB}`,
  `clubs/${CLUB}/allMembers/members`,
  `clubs/${CLUB}/events/e1`,
  `clubs/${CLUB}/events/e1/responses/r1`,
  `clubs/${CLUB}/news/n1`,
  `clubs/${CLUB}/news/n1/comments/c1`,
  `clubs/${CLUB}/news/n1/reactions/u1`,
  `clubs/${CLUB}/news/n1/comments/c1/reactions/u1`,
  `clubs/${CLUB}/settings/general`,
  `clubs/${CLUB}/recurringEvents/re1`,
  `clubs/${CLUB}/metadata/m1`,
  `clubs/${CLUB}/groups/${GROUP}`,
  `clubs/${CLUB}/groups/${GROUP}/allMembers/members`,
  `clubs/${CLUB}/groups/${GROUP}/events/ge1`,
  `clubs/${CLUB}/groups/${GROUP}/results/res1`,
  `clubs/${CLUB}/groups/${GROUP}/statistics/s1`,
  `clubs/${CLUB}/groups/${GROUP}/subgroups/sg1`,
  `clubs/${CLUB}/groups/${GROUP}/subgroups/sg1/allMembers/members`,
  "invitations/inv-club",
  "guardianInvitations/ginv-club",
];

// Paths that must STAY after deleting CLUB
const KEPT_DOCS = [
  // bookkeeping records of the deleted club
  `clubs/${CLUB}/chartOfAccounts/acc1`,
  `clubs/${CLUB}/accountingConfig/config`,
  `clubs/${CLUB}/accountingMeta/meta`,
  `clubs/${CLUB}/verifications/v1`,
  // payments, fees, LOK reports of the deleted club
  "membershipFees/fee-club",
  "payments/pay-club",
  "stripeEvents/stripe-1",
  "lokReports/lok-club",
  // another club, completely untouched
  `clubs/${OTHER_CLUB}`,
  `clubs/${OTHER_CLUB}/allMembers/members`,
  `clubs/${OTHER_CLUB}/events/e1`,
  `clubs/${OTHER_CLUB}/news/n1`,
  `clubs/${OTHER_CLUB}/groups/${OTHER_GROUP}`,
  `clubs/${OTHER_CLUB}/groups/${OTHER_GROUP}/events/ge1`,
  "invitations/inv-other",
];

const DELETED_FILES = [
  `profilePictures/clubs/${CLUB}/logo.jpg`,
  `profilePictures/clubs/${CLUB}/customProfilePictures/logo_200x200.png`,
  `profilePictures/groups/${GROUP}/logo.jpg`,
  `profilePictures/groups/${GROUP}/customProfilePictures/logo_200x200.png`,
];

const KEPT_FILES = [
  `profilePictures/clubs/${OTHER_CLUB}/logo.jpg`,
  `profilePictures/groups/${OTHER_GROUP}/logo.jpg`,
];

async function seedDocs(paths: string[]): Promise<void> {
  const db = getFirestore();
  for (const path of paths) {
    const clubId = path.includes(OTHER_CLUB) || path.endsWith("-other") ?
      OTHER_CLUB :
      CLUB;
    const data: Record<string, any> = { seeded: true, clubId };
    if (path.endsWith("/allMembers/members")) data.members = [];
    if (path === `clubs/${CLUB}` || path === `clubs/${CLUB}/groups/${GROUP}`) {
      data.isActive = false;
    }
    await db.doc(path).set(data);
  }
}

async function seedFiles(paths: string[]): Promise<void> {
  const bucket = getAdmin().storage().bucket(BUCKET);
  for (const path of paths) {
    await bucket.file(path).save(Buffer.from("test-image"));
  }
}

async function fileExists(path: string): Promise<boolean> {
  const [exists] = await getAdmin().storage().bucket(BUCKET).file(path).exists();
  return exists;
}

async function clearTestFiles(): Promise<void> {
  const bucket = getAdmin().storage().bucket(BUCKET);
  for (const id of [CLUB, OTHER_CLUB]) {
    await bucket.deleteFiles({ prefix: `profilePictures/clubs/${id}/`, force: true });
  }
  for (const id of [GROUP, OTHER_GROUP]) {
    await bucket.deleteFiles({ prefix: `profilePictures/groups/${id}/`, force: true });
  }
}

describe("Permanent club deletion", () => {
  beforeEach(async () => {
    await clearAll();
    await clearTestFiles();
    await seedDocs([...DELETED_DOCS, ...KEPT_DOCS]);
    await seedFiles([...DELETED_FILES, ...KEPT_FILES]);
  });

  afterAll(async () => {
    await clearTestFiles();
  });

  it("deletes all club data, including nested subcollections", async () => {
    const result = await permanentlyDeleteClub(CLUB);

    expect(result.success).toBe(true);
    expect(result.deletedGroups).toBe(1);
    expect(result.deletedSubgroups).toBe(1);

    for (const path of DELETED_DOCS) {
      expect({ path, exists: await documentExists(path) })
        .toEqual({ path, exists: false });
    }
  });

  it("keeps bookkeeping records, payments, fees and LOK reports", async () => {
    const result = await permanentlyDeleteClub(CLUB);

    expect(result.retainedSubcollections.sort()).toEqual(
      ["accountingConfig", "accountingMeta", "chartOfAccounts", "verifications"],
    );
    for (const path of KEPT_DOCS.filter((p) => !p.includes(OTHER_CLUB) && !p.endsWith("-other"))) {
      expect({ path, exists: await documentExists(path) })
        .toEqual({ path, exists: true });
    }
  });

  it("does not touch any other club", async () => {
    await permanentlyDeleteClub(CLUB);

    for (const path of KEPT_DOCS.filter((p) => p.includes(OTHER_CLUB) || p.endsWith("-other"))) {
      expect({ path, exists: await documentExists(path) })
        .toEqual({ path, exists: true });
    }
    for (const path of KEPT_FILES) {
      expect({ path, exists: await fileExists(path) })
        .toEqual({ path, exists: true });
    }
  });

  it("deletes the club logo and group pictures from Storage", async () => {
    await permanentlyDeleteClub(CLUB);

    for (const path of DELETED_FILES) {
      expect({ path, exists: await fileExists(path) })
        .toEqual({ path, exists: false });
    }
  });

  it("is safe to run twice (weekly cleanup retry)", async () => {
    await permanentlyDeleteClub(CLUB);
    const second = await permanentlyDeleteClub(CLUB);

    expect(second.success).toBe(true);
    expect(second.deletedGroups).toBe(0);
    expect(await documentExists(`clubs/${CLUB}/chartOfAccounts/acc1`)).toBe(true);
    expect(await documentExists(`clubs/${OTHER_CLUB}`)).toBe(true);
  });

  it("rejects an empty clubId instead of deleting anything", async () => {
    await expect(permanentlyDeleteClub("")).rejects.toThrow();
    expect(await documentExists(`clubs/${CLUB}`)).toBe(true);
  });
});

describe("Permanent group deletion", () => {
  beforeEach(async () => {
    await clearAll();
    await seedDocs([...DELETED_DOCS, ...KEPT_DOCS]);
  });

  it("deletes the group with all its subcollections, leaving the club intact", async () => {
    const result = await permanentlyDeleteGroup(CLUB, GROUP);

    expect(result.success).toBe(true);
    expect(result.deletedSubgroups).toBe(1);
    for (const path of DELETED_DOCS.filter((p) => p.includes(`/groups/${GROUP}`))) {
      expect({ path, exists: await documentExists(path) })
        .toEqual({ path, exists: false });
    }
    // The club itself and its other data are untouched
    expect(await documentExists(`clubs/${CLUB}`)).toBe(true);
    expect(await documentExists(`clubs/${CLUB}/events/e1`)).toBe(true);
    expect(await documentExists(`clubs/${CLUB}/news/n1`)).toBe(true);
    expect(await documentExists(`clubs/${OTHER_CLUB}/groups/${OTHER_GROUP}`)).toBe(true);
  });
});
