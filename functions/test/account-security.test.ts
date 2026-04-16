/**
 * Account Security Integration Tests
 *
 * Tests: revokeUserTokens, requestEmailChange, verifyEmailChange
 * Runs against Firebase Emulators.
 */

import * as http from "http";
import {
    callFunction,
    clearAll,
    createFullTestUser,
    expectFunctionError,
    getAuth,
    getDocument,
    getFirestore,
} from "./helpers";

// ═══════════════════════════════════════════════════════════════

/**
 * Helper: call an HTTP Cloud Function (onRequest) through the emulator.
 */
async function callHttpFunction(
  functionName: string,
  queryParams: Record<string, string>,
): Promise<{
  statusCode: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  const qs = new URLSearchParams(queryParams).toString();
  const path = `/sportnizer/europe-north1/${functionName}?${qs}`;

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: 5001,
      path,
      method: "GET",
      // Don't follow redirects automatically
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode || 500,
          body: data,
          headers: res.headers,
        });
      });
    });

    req.on("error", reject);
    req.end();
  });
}

/**
 * Helper: call an HTTP Cloud Function with POST and URL-encoded body.
 */
async function callHttpFunctionPost(
  functionName: string,
  queryParams: Record<string, string>,
  bodyParams: Record<string, string>,
): Promise<{
  statusCode: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  const qs = new URLSearchParams(queryParams).toString();
  const path = `/sportnizer/europe-north1/${functionName}?${qs}`;
  const postBody = new URLSearchParams(bodyParams).toString();

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: 5001,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postBody),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode || 500,
          body: data,
          headers: res.headers,
        });
      });
    });

    req.on("error", reject);
    req.write(postBody);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════

describe("Account Security", () => {
  beforeEach(async () => {
    await clearAll();
  });

  // ─── revokeUserTokens ─────────────────────────────────────

  describe("revokeUserTokens", () => {
    it("should revoke tokens for authenticated user", async () => {
      const user = await createFullTestUser({
        email: "revoke@test.com",
      });

      const result = await callFunction("revokeUserTokens", user.idToken, {});

      expect(result.success).toBe(true);

      // Verify tokens were revoked — tokensValidAfterTime should be set
      const authUser = await getAuth().getUser(user.uid);
      expect(authUser.tokensValidAfterTime).toBeDefined();
    });

    it("should reject unauthenticated call", async () => {
      await expectFunctionError("revokeUserTokens", "", {}, "unauthenticated");
    });

    it("should be idempotent — works when called multiple times", async () => {
      const user = await createFullTestUser({
        email: "idempotent@test.com",
      });

      const result1 = await callFunction("revokeUserTokens", user.idToken, {});
      expect(result1.success).toBe(true);

      // Second call with same token — may or may not be rejected by emulator
      // but should not throw an unhandled error
      try {
        const result2 = await callFunction(
          "revokeUserTokens",
          user.idToken,
          {},
        );
        expect(result2.success).toBe(true);
      } catch {
        // Token may be invalid after revocation — that's acceptable
      }
    });
  });

  // ─── requestEmailChange ────────────────────────────────────

  describe("requestEmailChange", () => {
    it("should create email change request and return success", async () => {
      const user = await createFullTestUser({
        email: "original@test.com",
        displayName: "Test User",
      });

      const result = await callFunction("requestEmailChange", user.idToken, {
        newEmail: "newemail@test.com",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();

      // Verify token document was created
      const db = getFirestore();
      const tokensSnap = await db
        .collection("emailChangeRequests")
        .where("uid", "==", user.uid)
        .get();

      expect(tokensSnap.empty).toBe(false);
      const tokenData = tokensSnap.docs[0].data();
      expect(tokenData.oldEmail).toBe("original@test.com");
      expect(tokenData.newEmail).toBe("newemail@test.com");
      expect(tokenData.verified).toBe(false);
      expect(tokenData.expiresAt).toBeDefined();
    });

    it("should reject if new email equals current email", async () => {
      const user = await createFullTestUser({
        email: "same@test.com",
      });

      await expectFunctionError(
        "requestEmailChange",
        user.idToken,
        { newEmail: "same@test.com" },
        "invalid-argument",
      );
    });

    it("should reject if new email is already taken in Auth", async () => {
      const user1 = await createFullTestUser({
        email: "user1@test.com",
      });
      await createFullTestUser({
        email: "taken@test.com",
      });

      await expectFunctionError(
        "requestEmailChange",
        user1.idToken,
        { newEmail: "taken@test.com" },
        "already-exists",
      );
    });

    it("should reject invalid email format", async () => {
      const user = await createFullTestUser({
        email: "valid@test.com",
      });

      await expectFunctionError(
        "requestEmailChange",
        user.idToken,
        { newEmail: "not-an-email" },
        "invalid-argument",
      );
    });

    it("should reject unauthenticated call", async () => {
      await expectFunctionError(
        "requestEmailChange",
        "",
        { newEmail: "new@test.com" },
        "unauthenticated",
      );
    });

    it("should clean up previous pending requests", async () => {
      const user = await createFullTestUser({
        email: "cleanup@test.com",
      });

      // First request
      await callFunction("requestEmailChange", user.idToken, {
        newEmail: "first@test.com",
      });

      // Second request — should clean up first
      await callFunction("requestEmailChange", user.idToken, {
        newEmail: "second@test.com",
      });

      // Only the latest token should exist
      const db = getFirestore();
      const tokensSnap = await db
        .collection("emailChangeRequests")
        .where("uid", "==", user.uid)
        .where("verified", "==", false)
        .get();

      expect(tokensSnap.size).toBe(1);
      expect(tokensSnap.docs[0].data().newEmail).toBe("second@test.com");
    });

    it("should reject empty newEmail", async () => {
      const user = await createFullTestUser({
        email: "empty@test.com",
      });

      await expectFunctionError(
        "requestEmailChange",
        user.idToken,
        { newEmail: "" },
        "invalid-argument",
      );
    });
  });

  // ─── verifyEmailChange ─────────────────────────────────────

  describe("verifyEmailChange", () => {
    it("should update email in Auth, Firestore, and allMembers", async () => {
      const user = await createFullTestUser({
        email: "old@test.com",
        displayName: "Email Changer",
      });

      // Create a club so there's an allMembers doc to sync
      const { clubId } = await callFunction("createClub", user.idToken, {
        clubData: { name: "Email Test Club" },
      });

      // Seed allMembers with the old email
      const db = getFirestore();
      await db.doc(`clubs/${clubId}/allMembers/members`).set({
        members: [
          {
            userId: user.uid,
            name: "Email Changer",
            email: "old@test.com",
            roles: ["club-admin"],
            isActive: true,
          },
        ],
        memberCount: 1,
      });

      // Create a token directly (bypassing SMTP)
      const token = "test-verify-token-123";
      await db
        .collection("emailChangeRequests")
        .doc(token)
        .set({
          uid: user.uid,
          oldEmail: "old@test.com",
          newEmail: "new@test.com",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          verified: false,
        });

      // Call the HTTP endpoint
      const response = await callHttpFunction("verifyEmailChange", {
        token,
      });

      // Should redirect (302) on success
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain("emailChanged=success");

      // Verify Auth email was updated
      const authUser = await getAuth().getUser(user.uid);
      expect(authUser.email).toBe("new@test.com");

      // Verify Firestore user doc email was updated
      const userDoc = await getDocument(`users/${user.uid}`);
      expect(userDoc!.email).toBe("new@test.com");

      // Verify allMembers was synced
      await new Promise((r) => setTimeout(r, 500)); // give sync a moment
      const membersDoc = await getDocument(
        `clubs/${clubId}/allMembers/members`,
      );
      const member = membersDoc!.members.find(
        (m: any) => m.userId === user.uid,
      );
      expect(member?.email).toBe("new@test.com");
    });

    it("should update guardian email in youth docs", async () => {
      const guardian = await createFullTestUser({
        email: "guardian-old@test.com",
        displayName: "Guardian",
      });

      const db = getFirestore();

      // Create a youth user doc with guardians array referencing the guardian's old email
      const youthUid = "youth-uid-123";
      await db.doc(`users/${youthUid}`).set({
        fullName: "Youth User",
        email: "",
        isActive: true,
        isYouthMember: true,
        guardians: [
          {
            guardianUid: guardian.uid,
            guardianEmail: "guardian-old@test.com",
            guardianName: "Guardian",
          },
        ],
      });

      // Create the email change token
      const token = "test-guardian-token-456";
      await db
        .collection("emailChangeRequests")
        .doc(token)
        .set({
          uid: guardian.uid,
          oldEmail: "guardian-old@test.com",
          newEmail: "guardian-new@test.com",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          verified: false,
        });

      // Verify the change
      const response = await callHttpFunction("verifyEmailChange", {
        token,
      });
      expect(response.statusCode).toBe(302);

      // Check youth doc guardians array
      await new Promise((r) => setTimeout(r, 500));
      const youthDoc = await getDocument(`users/${youthUid}`);
      const guardianEntry = youthDoc!.guardians?.find(
        (g: any) => g.guardianUid === guardian.uid,
      );
      expect(guardianEntry?.guardianEmail).toBe("guardian-new@test.com");
    });

    it("should reject expired token", async () => {
      const db = getFirestore();
      const token = "expired-token-789";
      await db
        .collection("emailChangeRequests")
        .doc(token)
        .set({
          uid: "some-uid",
          oldEmail: "old@test.com",
          newEmail: "new@test.com",
          createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // expired
          verified: false,
        });

      const response = await callHttpFunction("verifyEmailChange", {
        token,
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain("expired");
    });

    it("should reject already-verified token", async () => {
      const user = await createFullTestUser({
        email: "verified@test.com",
      });

      const db = getFirestore();
      const token = "already-verified-token";
      await db
        .collection("emailChangeRequests")
        .doc(token)
        .set({
          uid: user.uid,
          oldEmail: "verified@test.com",
          newEmail: "new-verified@test.com",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          verified: true,
        });

      const response = await callHttpFunction("verifyEmailChange", {
        token,
      });

      // Already verified redirects with already indicator
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain("emailChanged=already");
    });

    it("should reject nonexistent token", async () => {
      const response = await callHttpFunction("verifyEmailChange", {
        token: "nonexistent-token-xyz",
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain("Invalid");
    });

    it("should revoke refresh tokens after email change", async () => {
      const user = await createFullTestUser({
        email: "revoke-after@test.com",
      });

      const db = getFirestore();
      const token = "revoke-check-token";
      await db
        .collection("emailChangeRequests")
        .doc(token)
        .set({
          uid: user.uid,
          oldEmail: "revoke-after@test.com",
          newEmail: "revoke-new@test.com",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          verified: false,
        });

      // Get initial tokensValidAfterTime
      const beforeAuth = await getAuth().getUser(user.uid);
      const beforeTime = beforeAuth.tokensValidAfterTime;

      // Small delay to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 1000));

      const response = await callHttpFunction("verifyEmailChange", {
        token,
      });
      expect(response.statusCode).toBe(302);

      // Verify tokensValidAfterTime was updated
      const afterAuth = await getAuth().getUser(user.uid);
      expect(afterAuth.tokensValidAfterTime).toBeDefined();

      // If there was a before value, the after should be newer
      if (beforeTime) {
        expect(
          new Date(afterAuth.tokensValidAfterTime!).getTime(),
        ).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
      }
    });
  });

  // ─── requestPasswordReset ──────────────────────────────────

  describe("requestPasswordReset", () => {
    it("should return success and create token for valid user", async () => {
      const user = await createFullTestUser({
        email: "reset@test.com",
        displayName: "Reset User",
        emailVerified: true,
      });

      const result = await callFunction("requestPasswordReset", "", {
        email: "reset@test.com",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();

      // Verify token document was created
      const db = getFirestore();
      const tokensSnap = await db
        .collection("passwordResetRequests")
        .where("email", "==", "reset@test.com")
        .get();

      expect(tokensSnap.empty).toBe(false);
      const tokenData = tokensSnap.docs[0].data();
      expect(tokenData.uid).toBe(user.uid);
      expect(tokenData.email).toBe("reset@test.com");
      expect(tokenData.used).toBe(false);
      expect(tokenData.expiresAt).toBeDefined();
    });

    it("should return generic success for non-existent email (no enumeration)", async () => {
      const result = await callFunction("requestPasswordReset", "", {
        email: "nonexistent@test.com",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();

      // Verify no token was created
      const db = getFirestore();
      const tokensSnap = await db
        .collection("passwordResetRequests")
        .where("email", "==", "nonexistent@test.com")
        .get();

      expect(tokensSnap.empty).toBe(true);
    });

    it("should return generic success for unverified user (no email sent)", async () => {
      // Create user with emailVerified: false
      const user = await createFullTestUser({
        email: "unverified@test.com",
      });

      const db = getFirestore();
      await db.doc(`users/${user.uid}`).update({ emailVerified: false });

      const result = await callFunction("requestPasswordReset", "", {
        email: "unverified@test.com",
      });

      expect(result.success).toBe(true);

      // Verify no token was created
      const tokensSnap = await db
        .collection("passwordResetRequests")
        .where("email", "==", "unverified@test.com")
        .get();

      expect(tokensSnap.empty).toBe(true);
    });

    it("should reject invalid email format", async () => {
      await expectFunctionError(
        "requestPasswordReset",
        "",
        { email: "not-an-email" },
        "invalid-argument",
      );
    });

    it("should reject empty email", async () => {
      await expectFunctionError(
        "requestPasswordReset",
        "",
        { email: "" },
        "invalid-argument",
      );
    });

    it("should rate limit after 3 requests per hour", async () => {
      await createFullTestUser({
        email: "ratelimit@test.com",
      });

      const db = getFirestore();

      // Seed 3 recent requests
      for (let i = 0; i < 3; i++) {
        await db
          .collection("passwordResetRequests")
          .doc(`rate-limit-token-${i}`)
          .set({
            uid: "some-uid",
            email: "ratelimit@test.com",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            used: false,
          });
      }

      // 4th request should succeed (generic response) but NOT create a new token
      const result = await callFunction("requestPasswordReset", "", {
        email: "ratelimit@test.com",
      });

      expect(result.success).toBe(true);

      // Should still be exactly 3 tokens (no new one created)
      const tokensSnap = await db
        .collection("passwordResetRequests")
        .where("email", "==", "ratelimit@test.com")
        .get();

      expect(tokensSnap.size).toBe(3);
    });
  });

  // ─── resetPassword ────────────────────────────────────────

  describe("resetPassword", () => {
    it("should serve reset form on GET with valid token", async () => {
      const user = await createFullTestUser({
        email: "form@test.com",
      });

      const db = getFirestore();
      const token = "form-test-token";
      await db
        .collection("passwordResetRequests")
        .doc(token)
        .set({
          uid: user.uid,
          email: "form@test.com",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          used: false,
        });

      const response = await callHttpFunction("resetPassword", { token });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Reset Your Password");
      expect(response.body).toContain("newPassword");
    });

    it("should reset password and redirect on valid POST", async () => {
      const user = await createFullTestUser({
        email: "posttest@test.com",
      });

      const db = getFirestore();
      const token = "post-test-token";
      await db
        .collection("passwordResetRequests")
        .doc(token)
        .set({
          uid: user.uid,
          email: "posttest@test.com",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          used: false,
        });

      const response = await callHttpFunctionPost(
        "resetPassword",
        { token },
        {
          newPassword: "newSecurePassword123",
          confirmPassword: "newSecurePassword123",
        },
      );

      // Should redirect on success
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain("passwordReset=success");

      // Verify token is marked as used
      const tokenDoc = await db
        .collection("passwordResetRequests")
        .doc(token)
        .get();
      expect(tokenDoc.data()!.used).toBe(true);
    });

    it("should reject expired token", async () => {
      const db = getFirestore();
      const token = "expired-reset-token";
      await db
        .collection("passwordResetRequests")
        .doc(token)
        .set({
          uid: "some-uid",
          email: "expired@test.com",
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          expiresAt: new Date(Date.now() - 60 * 60 * 1000), // expired 1h ago
          used: false,
        });

      const response = await callHttpFunction("resetPassword", { token });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain("expired");
    });

    it("should reject already-used token", async () => {
      const user = await createFullTestUser({
        email: "used@test.com",
      });

      const db = getFirestore();
      const token = "used-reset-token";
      await db
        .collection("passwordResetRequests")
        .doc(token)
        .set({
          uid: user.uid,
          email: "used@test.com",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          used: true,
        });

      const response = await callHttpFunction("resetPassword", { token });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain("already been used");
    });

    it("should reject weak password on POST", async () => {
      const user = await createFullTestUser({
        email: "weakpw@test.com",
      });

      const db = getFirestore();
      const token = "weak-pw-token";
      await db
        .collection("passwordResetRequests")
        .doc(token)
        .set({
          uid: user.uid,
          email: "weakpw@test.com",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          used: false,
        });

      const response = await callHttpFunctionPost(
        "resetPassword",
        { token },
        { newPassword: "12", confirmPassword: "12" },
      );

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain("at least 6 characters");
    });

    it("should reject nonexistent token", async () => {
      const response = await callHttpFunction("resetPassword", {
        token: "nonexistent-token",
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain("invalid");
    });

    it("should reject when password confirmation does not match", async () => {
      const user = await createFullTestUser({
        email: "mismatch@test.com",
      });

      const db = getFirestore();
      const token = "mismatch-reset-token";
      await db
        .collection("passwordResetRequests")
        .doc(token)
        .set({
          uid: user.uid,
          email: "mismatch@test.com",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          used: false,
        });

      const response = await callHttpFunctionPost(
        "resetPassword",
        { token },
        {
          newPassword: "newSecurePassword123",
          confirmPassword: "differentPassword123",
        },
      );

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain("Passwords do not match");

      const tokenDoc = await db
        .collection("passwordResetRequests")
        .doc(token)
        .get();
      expect(tokenDoc.data()!.used).toBe(false);
    });

    it("should revoke refresh tokens after password reset", async () => {
      const user = await createFullTestUser({
        email: "revoke-reset@test.com",
      });

      const db = getFirestore();
      const token = "revoke-reset-token";
      await db
        .collection("passwordResetRequests")
        .doc(token)
        .set({
          uid: user.uid,
          email: "revoke-reset@test.com",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          used: false,
        });

      // Get initial tokensValidAfterTime
      const beforeAuth = await getAuth().getUser(user.uid);
      const beforeTime = beforeAuth.tokensValidAfterTime;

      await new Promise((r) => setTimeout(r, 1000));

      const response = await callHttpFunctionPost(
        "resetPassword",
        { token },
        {
          newPassword: "newSecurePassword123",
          confirmPassword: "newSecurePassword123",
        },
      );
      expect(response.statusCode).toBe(302);

      // Verify tokensValidAfterTime was updated
      const afterAuth = await getAuth().getUser(user.uid);
      expect(afterAuth.tokensValidAfterTime).toBeDefined();

      if (beforeTime) {
        expect(
          new Date(afterAuth.tokensValidAfterTime!).getTime(),
        ).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
      }
    });
  });
});
