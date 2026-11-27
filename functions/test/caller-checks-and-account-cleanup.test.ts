/**
 * C) Caller checks on the functions that edit another user's club/group access
 *    (updateUserClubDeletion, updateUserClubRemoval, updateUserGroupDeletion,
 *    updateUserGroupRemoval).
 * D) deleteUserAccount also removes pushTokens and profile pictures.
 *
 * Runs against Firebase Emulators.
 */

import {
  callFunction,
  clearAll,
  createFullTestUser,
  documentExists,
  expectFunctionError,
  getAdmin,
  getDocument,
  getFirestore,
  seedClubDocument,
  seedUserDocument,
} from "./helpers";

const CLUB = "checks-club";
const GROUP = "checks-group";
const BUCKET = "sportnizer.firebasestorage.app";

async function setUp() {
  const clubAdmin = await createFullTestUser({ email: `cadmin_${Date.now()}@test.com` });
  const groupAdmin = await createFullTestUser({ email: `gadmin_${Date.now()}@test.com` });
  const member = await createFullTestUser({ email: `member_${Date.now()}@test.com` });
  const stranger = await createFullTestUser({ email: `stranger_${Date.now()}@test.com` });

  await seedClubDocument(CLUB, { name: "Checks Club" });
  await getFirestore().doc(`clubs/${CLUB}/groups/${GROUP}`).set({ name: "G", isActive: true });

  await seedUserDocument(clubAdmin.uid, {
    clubAccess: [{ clubId: CLUB, clubName: "Checks Club", role: "club-admin", isActive: true, groupAccess: [] }],
  });
  await seedUserDocument(groupAdmin.uid, {
    clubAccess: [{
      clubId: CLUB, clubName: "Checks Club", role: "member", isActive: true,
      groupAccess: [{ groupId: GROUP, groupName: "G", roles: ["admin"] }],
    }],
  });
  const memberAccess = [{
    clubId: CLUB, clubName: "Checks Club", role: "member", isActive: true,
    groupAccess: [{ groupId: GROUP, groupName: "G", roles: ["player"] }],
  }];
  await seedUserDocument(member.uid, { clubAccess: memberAccess, memberOfClubs: [CLUB] });

  return { clubAdmin, groupAdmin, member, stranger };
}

describe("C) caller checks", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("CHK-1: a stranger cannot change another user's club access", async () => {
    const { member, stranger } = await setUp();

    await expectFunctionError("updateUserClubDeletion", stranger.idToken,
      { userId: member.uid, clubId: CLUB, isActive: false }, "permission-denied");
    await expectFunctionError("updateUserClubRemoval", stranger.idToken,
      { userId: member.uid, clubId: CLUB }, "permission-denied");
    await expectFunctionError("updateUserGroupDeletion", stranger.idToken,
      { userId: member.uid, clubId: CLUB, groupId: GROUP, isActive: false }, "permission-denied");
    await expectFunctionError("updateUserGroupRemoval", stranger.idToken,
      { userId: member.uid, clubId: CLUB, groupId: GROUP }, "permission-denied");

    // The member's profile is unchanged
    const doc = await getDocument(`users/${member.uid}`);
    expect(doc!.clubAccess).toHaveLength(1);
    expect(doc!.clubAccess[0].isActive).toBe(true);
    expect(doc!.clubAccess[0].groupAccess).toHaveLength(1);
  });

  it("CHK-2: unauthenticated calls are rejected", async () => {
    const { member } = await setUp();

    await expectFunctionError("updateUserClubRemoval", "",
      { userId: member.uid, clubId: CLUB }, "unauthenticated");
    await expectFunctionError("updateUserGroupRemoval", "",
      { userId: member.uid, clubId: CLUB, groupId: GROUP }, "unauthenticated");
  });

  it("CHK-3: a club admin can update a member's club access", async () => {
    const { clubAdmin, member } = await setUp();

    const result = await callFunction("updateUserClubDeletion", clubAdmin.idToken,
      { userId: member.uid, clubId: CLUB, isActive: false });
    expect(result.success).toBe(true);

    const doc = await getDocument(`users/${member.uid}`);
    expect(doc!.clubAccess[0].isActive).toBe(false);
  });

  it("CHK-4: a group admin can update a member's group access", async () => {
    const { groupAdmin, member } = await setUp();

    const result = await callFunction("updateUserGroupRemoval", groupAdmin.idToken,
      { userId: member.uid, clubId: CLUB, groupId: GROUP });
    expect(result.success).toBe(true);

    const doc = await getDocument(`users/${member.uid}`);
    expect(doc!.clubAccess[0].groupAccess).toHaveLength(0);
  });

  it("CHK-5: a group admin cannot change club-level access", async () => {
    const { groupAdmin, member } = await setUp();

    await expectFunctionError("updateUserClubDeletion", groupAdmin.idToken,
      { userId: member.uid, clubId: CLUB, isActive: false }, "permission-denied");
  });

  it("CHK-6: a user can remove a club or group from their own profile (leaving)", async () => {
    const { member } = await setUp();

    const groupResult = await callFunction("updateUserGroupRemoval", member.idToken,
      { userId: member.uid, clubId: CLUB, groupId: GROUP });
    expect(groupResult.success).toBe(true);

    const clubResult = await callFunction("updateUserClubRemoval", member.idToken,
      { userId: member.uid, clubId: CLUB });
    expect(clubResult.success).toBe(true);
  });
});

describe("D) deleteUserAccount cleans up everything", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("ACC-1: deletes pushTokens and profile pictures with the account", async () => {
    const user = await createFullTestUser({ email: `cleanup_${Date.now()}@test.com` });
    await seedUserDocument(user.uid, { clubAccess: [], dependents: [] });
    await getFirestore().doc(`users/${user.uid}/pushTokens/token1`).set({ token: "x" });
    await getFirestore().doc(`users/${user.uid}/notifications/n1`).set({ title: "hi" });

    const bucket = getAdmin().storage().bucket(BUCKET);
    const picture = `profilePictures/users/${user.uid}/profile.jpg`;
    const resized = `profilePictures/users/${user.uid}/customProfilePictures/profile_200x200.png`;
    const otherUsersPicture = "profilePictures/users/someone-else/profile.jpg";
    await bucket.file(picture).save(Buffer.from("img"));
    await bucket.file(resized).save(Buffer.from("img"));
    await bucket.file(otherUsersPicture).save(Buffer.from("img"));

    const result = await callFunction("deleteUserAccount", user.idToken, {});
    expect(result.success).toBe(true);

    expect(await documentExists(`users/${user.uid}`)).toBe(false);
    expect(await documentExists(`users/${user.uid}/pushTokens/token1`)).toBe(false);
    expect(await documentExists(`users/${user.uid}/notifications/n1`)).toBe(false);
    expect((await bucket.file(picture).exists())[0]).toBe(false);
    expect((await bucket.file(resized).exists())[0]).toBe(false);
    // Nobody else's files are touched
    expect((await bucket.file(otherUsersPicture).exists())[0]).toBe(true);
    await bucket.file(otherUsersPicture).delete();
  });
});
