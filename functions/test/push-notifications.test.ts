/// <reference types="jest" />

/**
 * Suite R: Push Notification Dispatch
 *
 * Tests for sendPushNotification backend helper and its integration with
 * createNotificationDirect. All Expo Push API calls are mocked.
 *
 * Tested behaviors:
 *  R1  sendPushNotification — no-op when user has no tokens
 *  R2  sendPushNotification — sends to all registered devices
 *  R3  sendPushNotification — removes DeviceNotRegistered tokens automatically
 *  R4  sendPushNotification — handles multiple devices, partial failure
 *  R5  sendPushNotification — uses correct Android channel for each type
 *  R6  sendPushNotification — push failure does NOT throw (graceful degradation)
 *  R7  createNotificationDirect — Firestore write succeeds even when push fails
 *  R8  createNotificationDirect — high-priority push sent for payment_request
 */

import {
    afterAll,
    beforeAll,
    beforeEach,
    expect,
    jest,
    test,
} from "@jest/globals";
import { sendPushNotification } from "../src/notifications/sendPushNotification";
import { NotificationType } from "../src/types/interfaces";
import {
    callFunction,
    clearAll,
    createFullTestUser,
    getDocument,
    getFirestore,
} from "./helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedPushToken(
  userId: string,
  token: string,
  platform: "android" | "ios" = "android",
): Promise<string> {
  const db = getFirestore();
  const ref = await db
    .collection("users")
    .doc(userId)
    .collection("pushTokens")
    .add({
      token,
      platform,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  return ref.id;
}

async function getPushTokens(userId: string): Promise<string[]> {
  const db = getFirestore();
  const snap = await db
    .collection("users")
    .doc(userId)
    .collection("pushTokens")
    .get();
  return snap.docs.map((d) => d.data().token as string);
}

function mockFetchSuccess(
  ticketStatuses: ("ok" | "DeviceNotRegistered")[] = ["ok"],
): void {
  const tickets = ticketStatuses.map((status) =>
    status === "ok"
      ? { status: "ok", id: "ticket_" + Math.random() }
      : {
          status: "error",
          details: { error: "DeviceNotRegistered" },
          message: "Token invalid",
        },
  );

  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ data: tickets }),
  } as Response);
}

function mockFetchNetworkError(): void {
  jest.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));
}

function mockFetchApiError(status: number): void {
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: "Service error" }),
  } as Response);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let testUserId: string;
let testUserIdToken: string;

beforeAll(async () => {
  const user = await createFullTestUser({
    email: `push_test_${Date.now()}@test.com`,
    displayName: "Push Test User",
  });
  testUserId = user.uid;
  testUserIdToken = user.idToken;
});

beforeEach(async () => {
  jest.restoreAllMocks();
  // Clear any push tokens from previous test
  const db = getFirestore();
  const tokens = await db
    .collection("users")
    .doc(testUserId)
    .collection("pushTokens")
    .get();
  await Promise.all(tokens.docs.map((d) => d.ref.delete()));
});

afterAll(async () => {
  await clearAll();
});

// ---------------------------------------------------------------------------
// R1: No-op when user has no tokens
// ---------------------------------------------------------------------------

test("R1: sendPushNotification is a no-op when user has no push tokens", async () => {
  const fetchSpy = jest.spyOn(global, "fetch");

  await sendPushNotification(testUserId, {
    title: "Test",
    body: "Hello",
    priority: "normal",
  });

  // fetch should never be called — no tokens to send to
  expect(fetchSpy).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// R2: Sends to all registered devices
// ---------------------------------------------------------------------------

test("R2: sendPushNotification sends to all registered devices", async () => {
  await seedPushToken(testUserId, "ExponentPushToken[device1]", "android");
  await seedPushToken(testUserId, "ExponentPushToken[device2]", "ios");

  mockFetchSuccess(["ok", "ok"]);

  await sendPushNotification(testUserId, {
    title: "New Event",
    body: "You have a new event",
    priority: "normal",
    type: "event",
  });

  expect(global.fetch).toHaveBeenCalledTimes(1);

  const callArgs = (global.fetch as jest.Mock).mock.calls[0];
  const body = JSON.parse((callArgs[1] as { body: string }).body);

  expect(body).toHaveLength(2);
  expect(body[0].to).toBe("ExponentPushToken[device1]");
  expect(body[1].to).toBe("ExponentPushToken[device2]");
  expect(body[0].title).toBe("New Event");
  expect(body[0].body).toBe("You have a new event");
});

// ---------------------------------------------------------------------------
// R3: Removes DeviceNotRegistered tokens
// ---------------------------------------------------------------------------

test("R3: sendPushNotification removes invalid DeviceNotRegistered tokens", async () => {
  await seedPushToken(testUserId, "ExponentPushToken[valid]");
  await seedPushToken(testUserId, "ExponentPushToken[invalid]");

  // First token ok, second token invalid
  mockFetchSuccess(["ok", "DeviceNotRegistered"]);

  await sendPushNotification(testUserId, {
    title: "Test",
    body: "Test",
    priority: "normal",
  });

  // Invalid token should be removed; valid token should remain
  const remaining = await getPushTokens(testUserId);
  expect(remaining).toHaveLength(1);
  expect(remaining[0]).toBe("ExponentPushToken[valid]");
});

// ---------------------------------------------------------------------------
// R4: Multiple devices, partial failure cleans up only invalid tokens
// ---------------------------------------------------------------------------

test("R4: handles multiple devices with partial DeviceNotRegistered failures", async () => {
  await seedPushToken(testUserId, "ExponentPushToken[A]");
  await seedPushToken(testUserId, "ExponentPushToken[B]");
  await seedPushToken(testUserId, "ExponentPushToken[C]");

  // A ok, B invalid, C ok
  mockFetchSuccess(["ok", "DeviceNotRegistered", "ok"]);

  await sendPushNotification(testUserId, {
    title: "Invitation",
    body: "You have been invited",
    priority: "high",
    type: "group_invitation",
  });

  const remaining = await getPushTokens(testUserId);
  expect(remaining).toHaveLength(2);
  expect(remaining).not.toContain("ExponentPushToken[B]");
  expect(remaining).toContain("ExponentPushToken[A]");
  expect(remaining).toContain("ExponentPushToken[C]");
});

// ---------------------------------------------------------------------------
// R5: Correct Android channel ID per notification type
// ---------------------------------------------------------------------------

test("R5: sendPushNotification uses correct Android channelId for each type", async () => {
  await seedPushToken(testUserId, "ExponentPushToken[device]");

  const typeToChannel: [NotificationType, string][] = [
    ["event", "events"],
    ["event_cancelled", "events"],
    ["group_invitation", "invitations"],
    ["youth_member_invitation", "invitations"],
    ["news", "news"],
    ["payment_request", "payments"],
    ["announcement", "default"],
  ];

  for (const [type, expectedChannel] of typeToChannel) {
    mockFetchSuccess(["ok"]);

    await sendPushNotification(testUserId, {
      title: "Test",
      body: "Test",
      priority: "normal",
      type,
    });

    const callArgs = (global.fetch as jest.Mock).mock.calls.at(-1)!;
    const body = JSON.parse((callArgs[1] as { body: string }).body);
    expect(body[0].channelId).toBe(expectedChannel);
    expect(body[0].categoryIdentifier).toBe(expectedChannel);

    jest.restoreAllMocks();
  }
});

// ---------------------------------------------------------------------------
// R6: Push failure does NOT throw — graceful degradation
// ---------------------------------------------------------------------------

test("R6: sendPushNotification does not throw on network error", async () => {
  await seedPushToken(testUserId, "ExponentPushToken[device]");
  mockFetchNetworkError();

  // Must not throw
  await expect(
    sendPushNotification(testUserId, { title: "Test", body: "Test" }),
  ).resolves.toBeUndefined();
});

test("R6b: sendPushNotification does not throw on Expo API error response", async () => {
  await seedPushToken(testUserId, "ExponentPushToken[device]");
  mockFetchApiError(500);

  await expect(
    sendPushNotification(testUserId, { title: "Test", body: "Test" }),
  ).resolves.toBeUndefined();
});

// ---------------------------------------------------------------------------
// R7: createNotificationDirect — Firestore write succeeds even when push fails
// ---------------------------------------------------------------------------

test("R7: Firestore notification is written even when Expo push API fails", async () => {
  await seedPushToken(testUserId, "ExponentPushToken[device]");
  mockFetchNetworkError();

  // Call the callable Cloud Function which internally calls createNotificationDirect
  const result = await callFunction<{
    success: boolean;
    notificationId: string;
  }>("createNotification", testUserIdToken, {
    userId: testUserId,
    type: "announcement",
    title: "Push Failure Test",
    message: "This should still be written to Firestore",
    clubId: "club_r7",
    clubName: "R7 Club",
    priority: "normal",
  });

  expect(result.success).toBe(true);
  expect(result.notificationId).toBeDefined();

  // Verify Firestore notification was written
  const notification = await getDocument(
    `users/${testUserId}/notifications/${result.notificationId}`,
  );
  expect(notification).not.toBeNull();
  expect(notification!.title).toBe("Push Failure Test");
  expect(notification!.read).toBe(false);
  expect(notification!.dismissed).toBe(false);
});

// ---------------------------------------------------------------------------
// R8: High-priority push for payment_request
// ---------------------------------------------------------------------------

test("R8: payment_request notifications use high priority and payments channel", async () => {
  await seedPushToken(testUserId, "ExponentPushToken[device]");
  mockFetchSuccess(["ok"]);

  await sendPushNotification(testUserId, {
    title: "Payment Due",
    body: "You have a payment due",
    priority: "high",
    type: "payment_request",
  });

  const callArgs = (global.fetch as jest.Mock).mock.calls[0];
  const body = JSON.parse((callArgs[1] as { body: string }).body);

  expect(body[0].priority).toBe("high");
  expect(body[0].channelId).toBe("payments");
  expect(body[0].sound).toBe("default");
});
