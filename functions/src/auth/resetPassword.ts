import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { config } from "../utils/config";

/**
 * HTTP endpoint for password reset.
 *
 * GET  ?token=xxx  → Serves a branded HTML form for entering a new password.
 * POST ?token=xxx  → Validates the token, updates the password, and redirects.
 *
 * Steps (POST):
 * 1. Validate token (exists, not expired, not used).
 * 2. Validate new password (min 6 chars).
 * 3. Update password in Firebase Auth via Admin SDK.
 * 4. Revoke all refresh tokens → force re-login.
 * 5. Mark token as used.
 * 6. Redirect to login page with success indicator.
 */
export const resetPassword = onRequest(
  {
    region: config.region,
  },
  async (req, res) => {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
      res.status(400).send(errorPage("Invalid or missing reset token."));
      return;
    }

    if (req.method === "GET") {
      await handleGet(req, res, token);
    } else if (req.method === "POST") {
      await handlePost(req, res, token);
    } else {
      res.status(405).send("Method not allowed");
    }
  },
);

// ─── GET: Serve the reset form ───────────────────────────────

async function handleGet(_req: any, res: any, token: string): Promise<void> {
  try {
    const db = admin.firestore();
    const tokenDoc = await db
      .collection("passwordResetRequests")
      .doc(token)
      .get();

    if (!tokenDoc.exists) {
      res.status(400).send(errorPage("This password reset link is invalid."));
      return;
    }

    const data = tokenDoc.data()!;

    if (data.used) {
      res
        .status(400)
        .send(
          errorPage(
            "This password reset link has already been used. Please request a new one.",
          ),
        );
      return;
    }

    const expiresAt = data.expiresAt?.toDate
      ? data.expiresAt.toDate()
      : new Date(data.expiresAt);

    if (new Date() > expiresAt) {
      await db.collection("passwordResetRequests").doc(token).delete();
      res
        .status(400)
        .send(
          errorPage(
            "This password reset link has expired. Please request a new one.",
          ),
        );
      return;
    }

    res.status(200).send(resetFormPage(token));
  } catch (error) {
    console.error("Error serving reset form:", error);
    res.status(500).send(errorPage("An unexpected error occurred."));
  }
}

// ─── POST: Process the password reset ────────────────────────

async function handlePost(req: any, res: any, token: string): Promise<void> {
  try {
    // Parse URL-encoded body
    let newPassword = "";
    if (typeof req.body === "string") {
      const params = new URLSearchParams(req.body);
      newPassword = params.get("newPassword") || "";
    } else if (req.body && typeof req.body === "object") {
      newPassword = req.body.newPassword || "";
    }

    if (!newPassword || newPassword.length < 6) {
      res
        .status(400)
        .send(
          resetFormPage(token, "Password must be at least 6 characters long."),
        );
      return;
    }

    const db = admin.firestore();
    const tokenDoc = await db
      .collection("passwordResetRequests")
      .doc(token)
      .get();

    if (!tokenDoc.exists) {
      res.status(400).send(errorPage("This password reset link is invalid."));
      return;
    }

    const data = tokenDoc.data()!;

    if (data.used) {
      res
        .status(400)
        .send(
          errorPage(
            "This password reset link has already been used. Please request a new one.",
          ),
        );
      return;
    }

    const expiresAt = data.expiresAt?.toDate
      ? data.expiresAt.toDate()
      : new Date(data.expiresAt);

    if (new Date() > expiresAt) {
      await db.collection("passwordResetRequests").doc(token).delete();
      res
        .status(400)
        .send(
          errorPage(
            "This password reset link has expired. Please request a new one.",
          ),
        );
      return;
    }

    const { uid } = data;

    // ── 1. Update password in Firebase Auth ────────────────
    await admin.auth().updateUser(uid, { password: newPassword });

    // ── 2. Revoke all refresh tokens ───────────────────────
    await admin.auth().revokeRefreshTokens(uid);

    // ── 3. Mark token as used ──────────────────────────────
    await db.collection("passwordResetRequests").doc(token).update({
      used: true,
      usedAt: FieldValue.serverTimestamp(),
    });

    console.log(`Password reset completed for user ${uid}`);

    // ── 4. Redirect to login with success indicator ────────
    res.redirect(`${config.baseUrl}/login?passwordReset=success`);
  } catch (error: any) {
    console.error("Error resetting password:", error);

    if (error.code === "auth/weak-password") {
      res
        .status(400)
        .send(
          resetFormPage(
            token,
            "Password is too weak. Please use a stronger password.",
          ),
        );
      return;
    }

    res
      .status(500)
      .send(errorPage("An unexpected error occurred. Please try again."));
  }
}

// ─── HTML Templates ──────────────────────────────────────────

const BRAND = {
  primaryDark: "#25292e",
  accent: "#ffcb3deb",
  white: "#ffffff",
  textDark: "#333333",
  textLight: "#666666",
  error: "#ff4444",
  background: "#1a1d21",
  inputBg: "#3a3f44",
};

const LOGO_URL =
  "https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fsportnizer_logo.png?alt=media";

function pageWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password — Clubnizer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: ${BRAND.background};
      color: ${BRAND.white};
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background-color: ${BRAND.primaryDark};
      border-radius: 16px;
      padding: 40px 32px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    .logo { display: block; margin: 0 auto 12px; width: 50px; height: 50px; }
    .brand {
      text-align: center;
      color: ${BRAND.accent};
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .subtitle {
      text-align: center;
      color: ${BRAND.textLight};
      font-size: 14px;
      margin-bottom: 28px;
    }
    h2 {
      text-align: center;
      color: ${BRAND.white};
      font-size: 20px;
      margin-bottom: 8px;
    }
    label {
      display: block;
      color: ${BRAND.white};
      font-size: 14px;
      margin-bottom: 6px;
      font-weight: 500;
    }
    input[type="password"] {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid #555;
      border-radius: 10px;
      background-color: ${BRAND.inputBg};
      color: ${BRAND.white};
      font-size: 16px;
      margin-bottom: 6px;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="password"]:focus {
      border-color: ${BRAND.accent};
    }
    .hint { color: ${BRAND.textLight}; font-size: 12px; margin-bottom: 20px; }
    .error-msg {
      background-color: rgba(255,68,68,0.15);
      color: ${BRAND.error};
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 16px;
      text-align: center;
    }
    button {
      width: 100%;
      padding: 14px;
      background-color: ${BRAND.accent};
      color: ${BRAND.primaryDark};
      border: none;
      border-radius: 9999px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    button:active { opacity: 0.8; }
    .info {
      text-align: center;
      color: ${BRAND.textLight};
      font-size: 14px;
      line-height: 1.6;
      margin-top: 16px;
    }
    .footer {
      text-align: center;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #444;
    }
    .footer span { color: ${BRAND.accent}; font-weight: 600; }
    .footer p { color: ${BRAND.textLight}; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <img src="${LOGO_URL}" alt="Clubnizer" class="logo" />
    <div class="brand">Clubnizer</div>
    ${content}
    <div class="footer">
      <p><span>Clubnizer</span> — Organize your club, simplify your game.</p>
    </div>
  </div>
</body>
</html>`;
}

function resetFormPage(token: string, errorMsg?: string): string {
  return pageWrapper(`
    <h2>Reset Your Password</h2>
    <p class="subtitle">Enter your new password below.</p>
    ${errorMsg ? `<div class="error-msg">${errorMsg}</div>` : ""}
    <form method="POST" action="?token=${encodeURIComponent(token)}">
      <label for="newPassword">New Password</label>
      <input type="password" id="newPassword" name="newPassword"
             placeholder="Enter new password" required minlength="6"
             autocomplete="new-password" />
      <p class="hint">Must be at least 6 characters.</p>
      <button type="submit">Reset Password</button>
    </form>
  `);
}

function errorPage(message: string): string {
  return pageWrapper(`
    <h2>Oops!</h2>
    <p class="info">${message}</p>
    <div style="text-align:center; margin-top:20px;">
      <a href="${config.baseUrl}/login" style="
        color: ${BRAND.accent};
        text-decoration: none;
        font-weight: 600;
        font-size: 14px;
      ">← Back to Login</a>
    </div>
  `);
}
