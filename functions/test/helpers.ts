/**
 * Test Helpers for Cloud Functions Integration Tests
 *
 * Provides utilities to:
 * - Initialize Firebase Admin pointing at emulators
 * - Create test users in Auth emulator
 * - Call onCall Cloud Functions with authentication
 * - Clean up Firestore between tests
 */

import * as admin from "firebase-admin";
import * as http from "http";

// ─── Emulator Configuration ───────────────────────────────────

const PROJECT_ID = "sportnizer";
const AUTH_EMULATOR = "127.0.0.1:9099";
const FIRESTORE_EMULATOR = "127.0.0.1:8080";
const FUNCTIONS_EMULATOR = "http://127.0.0.1:5001";
const STORAGE_EMULATOR = "127.0.0.1:9199";

// Set emulator env vars before anything imports firebase-admin
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR;
process.env.FIREBASE_STORAGE_EMULATOR_HOST = STORAGE_EMULATOR;
process.env.GCLOUD_PROJECT = PROJECT_ID;

// ─── Firebase Admin Singleton ─────────────────────────────────

let initialized = false;

export function getAdmin(): typeof admin {
  if (!initialized) {
    admin.initializeApp({ projectId: PROJECT_ID });
    initialized = true;
  }
  return admin;
}

export function getFirestore(): admin.firestore.Firestore {
  return getAdmin().firestore();
}

export function getAuth(): admin.auth.Auth {
  return getAdmin().auth();
}

// ─── Test User Management ─────────────────────────────────────

interface TestUser {
  uid: string;
  email: string;
  displayName: string;
  /** Real Firebase ID token from Auth emulator */
  idToken: string;
}

let userCounter = 0;

/**
 * Sign up a user via the Auth emulator REST API.
 * Returns a real Firebase ID token that the functions emulator accepts.
 */
async function signUpViaAuthEmulator(
  email: string,
  password: string,
): Promise<{ localId: string; idToken: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    });

    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: 9099,
      path: "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Auth signup failed: ${parsed.error.message}`));
          } else {
            resolve({
              localId: parsed.localId,
              idToken: parsed.idToken,
            });
          }
        } catch {
          reject(new Error(`Auth signup parse error: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Create a test user in Firebase Auth emulator with a real ID token.
 * Returns { uid, email, displayName, idToken }.
 */
export async function createTestUser(
  overrides: { email?: string; displayName?: string } = {},
): Promise<TestUser> {
  userCounter++;
  const email =
    overrides.email || `testuser${userCounter}_${Date.now()}@test.com`;
  const displayName = overrides.displayName || `Test User ${userCounter}`;

  const { localId, idToken } = await signUpViaAuthEmulator(
    email,
    "testpass123",
  );

  // Update display name via Admin SDK
  await getAuth().updateUser(localId, {
    displayName,
    emailVerified: true,
  });

  return {
    uid: localId,
    email,
    displayName,
    idToken,
  };
}

// ─── Call Cloud Functions via Emulator ────────────────────────

/**
 * Call an onCall v2 Cloud Function through the emulator.
 *
 * Uses a real Firebase ID token from the Auth emulator.
 */
export async function callFunction<T = any>(
  functionName: string,
  idToken: string,
  data: Record<string, any>,
  region: string = "europe-north1",
): Promise<T> {
  const url = `${FUNCTIONS_EMULATOR}/${PROJECT_ID}/${region}/${functionName}`;
  const body = JSON.stringify({ data });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
    };

    // Only add auth header if token is provided (empty = unauthenticated test)
    if (idToken) {
      headers["Authorization"] = `Bearer ${idToken}`;
    }

    const options: http.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: "POST",
      headers,
    };

    const req = http.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => (responseData += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseData);
          if (parsed.error) {
            const err = new FunctionError(
              parsed.error.message || "Function error",
              parsed.error.status || "INTERNAL",
              parsed.error.details,
            );
            reject(err);
          } else if (parsed.result !== undefined) {
            resolve(parsed.result as T);
          } else {
            resolve(parsed as T);
          }
        } catch {
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new FunctionError(
                `HTTP ${res.statusCode}: ${responseData}`,
                "INTERNAL",
              ),
            );
          } else {
            resolve(responseData as unknown as T);
          }
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Call a function and expect it to fail with a specific error code.
 */
export async function expectFunctionError(
  functionNameOrPromise: string | Promise<any>,
  idTokenOrCode: string,
  data?: Record<string, any>,
  expectedCode?: string,
): Promise<FunctionError> {
  let promise: Promise<any>;
  let code: string;

  if (typeof functionNameOrPromise === "string") {
    promise = callFunction(functionNameOrPromise, idTokenOrCode, data!);
    code = expectedCode!;
  } else {
    promise = functionNameOrPromise;
    code = idTokenOrCode;
  }

  try {
    await promise;
    throw new Error(`Expected function to throw ${code} but it succeeded`);
  } catch (error) {
    if (error instanceof FunctionError) {
      // Normalize: emulator returns underscores (permission_denied),
      // Firebase SDK uses hyphens (permission-denied). Accept both.
      const normalise = (s: string) => s.toLowerCase().replace(/-/g, "_");
      expect(normalise(error.code)).toContain(normalise(code));
      return error;
    }
    throw error;
  }
}

export class FunctionError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
  ) {
    super(message);
    this.name = "FunctionError";
  }
}

// ─── Firestore Direct Access (for seeding & assertions) ──────

/**
 * Write a user document directly to Firestore (for setting up test state).
 */
export async function seedUserDocument(
  uid: string,
  data: Record<string, any>,
): Promise<void> {
  const db = getFirestore();
  await db.doc(`users/${uid}`).set(
    {
      fullName: data.fullName || "Test User",
      email: data.email || "test@test.com",
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      clubAccess: [],
      ...data,
    },
    { merge: true },
  );
}

/**
 * Write a club document directly to Firestore.
 */
export async function seedClubDocument(
  clubId: string,
  data: Record<string, any>,
): Promise<void> {
  const db = getFirestore();
  await db.doc(`clubs/${clubId}`).set(
    {
      name: data.name || "Test Club",
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...data,
    },
    { merge: true },
  );
}

/**
 * Read a Firestore document and return its data.
 */
export async function getDocument(
  path: string,
): Promise<Record<string, any> | undefined> {
  const db = getFirestore();
  const doc = await db.doc(path).get();
  return doc.exists ? (doc.data() as Record<string, any>) : undefined;
}

/**
 * Check if a Firestore document exists.
 */
export async function documentExists(path: string): Promise<boolean> {
  const db = getFirestore();
  const doc = await db.doc(path).get();
  return doc.exists;
}

// ─── Cleanup ─────────────────────────────────────────────────

/**
 * Clear all data from the Firestore emulator.
 * Call this in beforeEach or afterAll to ensure test isolation.
 */
export async function clearFirestore(): Promise<void> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: 8080,
      path: `/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
      method: "DELETE",
    };

    const req = http.request(options, (res) => {
      res.resume();
      res.on("end", resolve);
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Clear all users from the Auth emulator.
 */
export async function clearAuth(): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ deleteAllAccounts: true });
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: 9099,
      path: `/emulator/v1/projects/${PROJECT_ID}/accounts`,
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      res.resume();
      res.on("end", resolve);
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Clear everything — call between test suites for full isolation.
 */
export async function clearAll(): Promise<void> {
  await Promise.all([clearFirestore(), clearAuth()]);
}

// ─── Convenience: Full User Setup ────────────────────────────

/**
 * Create a complete test user with Auth record + Firestore user document.
 * Returns { uid, email, displayName }.
 */
export async function createFullTestUser(
  overrides: {
    email?: string;
    displayName?: string;
    clubAccess?: any[];
    emailVerified?: boolean;
  } = {},
): Promise<TestUser> {
  const user = await createTestUser({
    email: overrides.email,
    displayName: overrides.displayName,
  });

  await seedUserDocument(user.uid, {
    fullName: user.displayName,
    email: user.email,
    clubAccess: overrides.clubAccess || [],
    ...(overrides.emailVerified !== undefined && {
      emailVerified: overrides.emailVerified,
    }),
  });

  return user;
}

/**
 * Small delay utility — useful if emulator needs time to process triggers.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
