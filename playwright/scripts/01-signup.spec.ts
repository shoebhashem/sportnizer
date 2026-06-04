/**
 * VIDEO 01 — Get Started: Sign Up, Verify Email & Sign In
 *
 * Shows: Welcome screen → Sign Up → fill form → submit →
 *        open Strato webmail → click verification link → sign in to app
 *
 * Requires: NEW_USER_EMAIL, NEW_USER_PASSWORD, NEW_USER_NAME, WEBMAIL_PASSWORD in .env
 *
 * ⚠️  Run this script ONCE on a fresh account.
 *     Delete the Firebase Auth account before re-recording.
 */

import { test } from "@playwright/test";
import { fillByLabel, pause } from "../helpers/auth";

const email = process.env.NEW_USER_EMAIL!;
const password = process.env.NEW_USER_PASSWORD!;
const fullName = process.env.NEW_USER_NAME!;
const webmailPassword = process.env.WEBMAIL_PASSWORD!;

function assertEnv(name: string, value: string | undefined) {
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }

  const placeholderTokens = ["your_", "_here", "example", "placeholder"];

  const lower = value.toLowerCase();
  if (placeholderTokens.some((t) => lower.includes(t))) {
    throw new Error(`Env var ${name} still has a placeholder value.`);
  }
}

async function clickByTextAny(page: any, texts: string[]) {
  for (const text of texts) {
    const buttonLike = page.getByRole("button", { name: text }).first();
    if (await buttonLike.isVisible().catch(() => false)) {
      await buttonLike.click({ timeout: 2_500 }).catch(async () => {
        await buttonLike.click({ force: true, timeout: 2_500 });
      });
      return true;
    }

    // Prefer the last exact text match; first match is often static label text.
    const el = page.getByText(text, { exact: true }).last();
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 2_500 }).catch(async () => {
        await el.click({ force: true, timeout: 2_500 });
      });
      return true;
    }
  }

  // Fallback: partial match for any candidate text
  const regex = new RegExp(texts.join("|"), "i");
  const partial = page.getByText(regex).last();
  if (await partial.isVisible().catch(() => false)) {
    await partial.click({ timeout: 2_500 }).catch(async () => {
      await partial.click({ force: true, timeout: 2_500 });
    });
    return true;
  }

  return false;
}

async function clickActionByTextAny(page: any, texts: string[]) {
  for (const text of texts) {
    const buttonLike = page.getByRole("button", { name: text }).first();
    if (await buttonLike.isVisible().catch(() => false)) {
      await buttonLike.click();
      return true;
    }

    // In Expo web many Pressables render as generic divs. Prefer last match,
    // because first is often a non-clickable heading with the same text.
    const textMatch = page.getByText(text, { exact: true }).last();
    if (await textMatch.isVisible().catch(() => false)) {
      await textMatch.click();
      return true;
    }
  }

  return false;
}

async function fillByPlaceholderAny(
  page: any,
  placeholders: string[],
  value: string,
) {
  for (const placeholder of placeholders) {
    const el = page.getByPlaceholder(placeholder).first();
    if (await el.isVisible().catch(() => false)) {
      await el.fill(value);
      return;
    }
  }

  throw new Error(
    `Could not find input by placeholders: ${placeholders.join(", ")}`,
  );
}

async function clickFirstVisible(
  page: any,
  selectors: Array<
    { type: "text"; value: string } | { type: "css"; value: string }
  >,
  timeoutMs = 12_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (page.isClosed?.()) {
      return false;
    }

    for (const selector of selectors) {
      const locator =
        selector.type === "text"
          ? page.getByText(selector.value).first()
          : page.locator(selector.value).first();

      if (await locator.isVisible().catch(() => false)) {
        await locator.click().catch(() => {});
        return true;
      }
    }

    await page.waitForTimeout(500);
  }

  return false;
}

async function clickVerificationLinkInWebmail(webmailPage: any) {
  const isVerificationUrl = (url: string) => {
    return /oobCode=|mode=verifyEmail|accountAction|firebaseapp\.com\/.*action|\/verifyEmail\?token=/i.test(
      url || "",
    );
  };

  const verificationReached = async () => {
    if (isVerificationUrl(webmailPage.url?.() || "")) return true;
    for (const p of webmailPage.context().pages()) {
      if (isVerificationUrl(p.url?.() || "")) return true;
    }
    return false;
  };

  const contexts = [webmailPage, ...webmailPage.frames()];

  for (const ctx of contexts) {
    // Scroll the email body area to reveal CTA buttons that are below fold.
    await ctx
      .evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll(
            '[style*="overflow"], .scrollable, .mail-detail, .message-body',
          ),
        ) as HTMLElement[];
        for (const el of candidates) {
          try {
            el.scrollTop = 0;
          } catch {}
        }
        window.scrollTo(0, 0);
      })
      .catch(() => {});

    const clickAttempt = async () => {
      // Primary path: click the explicit CTA text after ensuring it is in view.
      const explicitCtas = [
        ctx.getByRole("link", { name: /Verify Your Email/i }).first(),
        ctx.getByRole("button", { name: /Verify Your Email/i }).first(),
        ctx.getByText(/Verify Your Email/i).first(),
      ];

      for (const cta of explicitCtas) {
        if (await cta.isVisible().catch(() => false)) {
          const popupPromise = webmailPage
            .waitForEvent("popup", { timeout: 2500 })
            .catch(() => null);
          await cta.scrollIntoViewIfNeeded().catch(() => {});
          await cta.click({ timeout: 3000 }).catch(async () => {
            await cta.click({ force: true, timeout: 3000 });
          });
          const popup = await popupPromise;
          if (popup) {
            await popup
              .waitForLoadState("domcontentloaded", { timeout: 8000 })
              .catch(() => {});
          }
          await webmailPage.waitForTimeout(1200).catch(() => {});
          if (await verificationReached()) return true;
        }
      }

      const selectors = [
        'a[href*="mode=verifyEmail"]',
        'a[href*="oobCode"]',
        'a[href*="accountAction"]',
        'a[href*="firebaseapp.com/action"]',
        'a[href*="/verifyEmail?token="]',
      ];

      for (const sel of selectors) {
        const link = ctx.locator(sel).first();
        if (await link.isVisible().catch(() => false)) {
          const popupPromise = webmailPage
            .waitForEvent("popup", { timeout: 2500 })
            .catch(() => null);
          await link.scrollIntoViewIfNeeded().catch(() => {});
          await link.click({ timeout: 3000 }).catch(async () => {
            await link.click({ force: true, timeout: 3000 });
          });
          const popup = await popupPromise;
          if (popup) {
            await popup
              .waitForLoadState("domcontentloaded", { timeout: 8000 })
              .catch(() => {});
          }
          await webmailPage.waitForTimeout(1200).catch(() => {});
          if (await verificationReached()) return true;
        }
      }

      const textButtons = [
        "Verify Email",
        "Verify Your Email",
        "Verify your email",
        "Verify your Clubnizer account",
      ];
      for (const text of textButtons) {
        const btn = ctx.getByText(new RegExp(text, "i")).first();
        if (await btn.isVisible().catch(() => false)) {
          const popupPromise = webmailPage
            .waitForEvent("popup", { timeout: 2500 })
            .catch(() => null);
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.click({ timeout: 3000 }).catch(async () => {
            await btn.click({ force: true, timeout: 3000 });
          });
          const popup = await popupPromise;
          if (popup) {
            await popup
              .waitForLoadState("domcontentloaded", { timeout: 8000 })
              .catch(() => {});
          }
          await webmailPage.waitForTimeout(1200).catch(() => {});
          if (await verificationReached()) return true;
        }
      }

      return false;
    };

    // Try at current scroll position, then progressively scroll down.
    for (let i = 0; i < 8; i++) {
      const clicked = await clickAttempt();
      if (clicked) return true;

      await ctx
        .evaluate(() => {
          window.scrollBy(0, 500);
          const candidates = Array.from(
            document.querySelectorAll(
              '[style*="overflow"], .scrollable, .mail-detail, .message-body',
            ),
          ) as HTMLElement[];
          for (const el of candidates) {
            try {
              el.scrollTop += 500;
            } catch {}
          }
        })
        .catch(() => {});
      await ctx.waitForTimeout(250).catch(() => {});
    }
  }

  // Last-resort fallback: extract verification href from DOM and navigate to it.
  for (const ctx of contexts) {
    const href = await ctx
      .evaluate(() => {
        const links = Array.from(
          document.querySelectorAll("a"),
        ) as HTMLAnchorElement[];
        const found = links.find((a) =>
          /oobCode=|mode=verifyEmail|accountAction|firebaseapp\.com\/.*action|\/verifyEmail\?token=/i.test(
            a.href || "",
          ),
        );
        return found?.href || null;
      })
      .catch(() => null);

    if (href) {
      await webmailPage
        .goto(href, { waitUntil: "domcontentloaded", timeout: 60_000 })
        .catch(() => {});
      await webmailPage.waitForTimeout(1200).catch(() => {});
      if (await verificationReached()) return true;
    }
  }

  return false;
}

function resolveLiveWebmailPage(context: any, currentPage: any) {
  if (currentPage && !currentPage.isClosed?.()) {
    return currentPage;
  }

  const byUrl = context
    .pages()
    .find(
      (p: any) =>
        !p.isClosed?.() && /webmail\.strato\.com/i.test(p.url?.() || ""),
    );
  if (byUrl) return byUrl;

  const anyOpen = context.pages().find((p: any) => !p.isClosed?.());
  return anyOpen || currentPage;
}

async function openVerificationEmailInInbox(
  webmailPage: any,
  timeoutMs = 20_000,
) {
  const deadline = Date.now() + timeoutMs;

  const openInbox = async () => {
    const inboxItem = webmailPage
      .getByRole("treeitem", { name: /Inkorg|Inbox/i })
      .first();
    if (await inboxItem.isVisible().catch(() => false)) {
      await inboxItem.click({ timeout: 2_500 }).catch(async () => {
        await inboxItem.click({ force: true, timeout: 2_500 }).catch(() => {});
      });
      await webmailPage.waitForTimeout(500).catch(() => {});
      return true;
    }
    return false;
  };

  const tryOpenLatestVerificationRow = async () => {
    // Prefer newest message in the list (topmost) with sender+subject.
    const optionBySenderAndSubject = webmailPage
      .getByRole("option", {
        name: /noreply@clubnizer\.com.*Verify Your Clubnizer Account/i,
      })
      .first();
    const optionBySubject = webmailPage
      .getByRole("option", { name: /Verify Your Clubnizer Account/i })
      .first();
    const optionBySender = webmailPage
      .getByRole("option", { name: /noreply@clubnizer\.com/i })
      .first();

    const candidates = [
      optionBySenderAndSubject,
      optionBySubject,
      optionBySender,
    ];

    for (const row of candidates) {
      if (await row.isVisible().catch(() => false)) {
        if (webmailPage.isClosed?.()) return false;
        await row.scrollIntoViewIfNeeded().catch(() => {});
        await row.click({ timeout: 2_500 }).catch(async () => {
          if (webmailPage.isClosed?.()) return;
          await row.click({ force: true, timeout: 2_500 }).catch(() => {});
        });
        if (webmailPage.isClosed?.()) return false;
        await row.press("Enter").catch(() => {});

        const conversationHeading = webmailPage
          .getByRole("heading", { name: /Verify Your Clubnizer Account/i })
          .first();
        const messagePanel = webmailPage
          .getByRole("region", { name: /Konversation|Conversation/i })
          .first();
        const mailIframe = webmailPage.locator("iframe").first();
        if (
          (await conversationHeading.isVisible().catch(() => false)) ||
          (await messagePanel.isVisible().catch(() => false)) ||
          (await mailIframe.isVisible().catch(() => false))
        ) {
          return true;
        }
      }
    }

    return false;
  };

  while (Date.now() < deadline) {
    if (webmailPage.isClosed?.()) {
      return false;
    }

    await openInbox().catch(() => false);
    const opened = await tryOpenLatestVerificationRow();
    if (opened) return true;

    // Last fallback: click visible subject text, then confirm conversation panel/heading.
    const subjectText = webmailPage
      .getByText(/Verify Your Clubnizer Account/i)
      .first();
    if (await subjectText.isVisible().catch(() => false)) {
      await subjectText.click({ timeout: 2_500 }).catch(async () => {
        if (webmailPage.isClosed?.()) return;
        await subjectText
          .click({ force: true, timeout: 2_500 })
          .catch(() => {});
      });
      if (webmailPage.isClosed?.()) return false;

      const conversationHeading = webmailPage
        .getByRole("heading", { name: /Verify Your Clubnizer Account/i })
        .first();
      if (await conversationHeading.isVisible().catch(() => false)) {
        return true;
      }
    }

    await webmailPage.waitForTimeout(500);
  }

  return false;
}

async function submitStratoLogin(page: any, passwordInput: any) {
  const submitSelectors = [
    'button:has-text("Logga in")',
    'button:has-text("Login")',
    'button[type="submit"]',
    'input[type="submit"]',
    '[data-action="login"]',
  ];

  for (const sel of submitSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 3000 }).catch(async () => {
        await btn.click({ force: true, timeout: 3000 });
      });
      return true;
    }
  }

  const roleBtn = page
    .getByRole("button", { name: /Logga in|Login|Sign in/i })
    .first();
  if (await roleBtn.isVisible().catch(() => false)) {
    await roleBtn.click({ timeout: 3000 }).catch(async () => {
      await roleBtn.click({ force: true, timeout: 3000 });
    });
    return true;
  }

  // Final fallback: submit form by pressing Enter in password field.
  await passwordInput.press("Enter").catch(async () => {
    await page.keyboard.press("Enter");
  });
  return true;
}

async function isAnyTextVisible(
  page: any,
  patterns: RegExp[],
  timeoutMs = 12_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (page.isClosed?.()) return false;

    for (const pattern of patterns) {
      if (
        await page
          .getByText(pattern)
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        return true;
      }
    }

    await page.waitForTimeout(400);
  }

  return false;
}

async function waitForAnyVisible(
  page: any,
  selectors: Array<
    | { type: "role"; role: "heading" | "button" | "textbox"; name: string }
    | { type: "text"; value: string }
  >,
  timeoutMs = 20_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (page.isClosed?.()) return null;

    for (const s of selectors) {
      const locator =
        s.type === "role"
          ? page.getByRole(s.role, { name: s.name }).first()
          : page.getByText(s.value).first();

      if (await locator.isVisible().catch(() => false)) {
        return s;
      }
    }

    await page.waitForTimeout(400);
  }

  return null;
}

function logStep(message: string) {
  // Visible in terminal while running `npm run record:01`
  console.log(`[video-01] ${message}`);
}

test("01 – Sign up, verify email, sign in", async ({ page }) => {
  test.setTimeout(420_000); // 7 minutes for signup + external webmail interaction

  assertEnv("NEW_USER_EMAIL", email);
  assertEnv("NEW_USER_PASSWORD", password);
  assertEnv("NEW_USER_NAME", fullName);
  assertEnv("WEBMAIL_PASSWORD", webmailPassword);
  logStep("Environment variables validated");

  // ── Step 1: Welcome screen ──────────────────────────────────────────────────
  logStep("Opening app welcome screen");
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page
    .waitForLoadState("networkidle", { timeout: 20_000 })
    .catch(() => {});
  await pause(page, 2000); // let viewer see the welcome screen

  // If we're already on /signup, skip the welcome CTA click.
  if (!/\/signup/.test(page.url())) {
    await clickByTextAny(page, ["Get Started", "Kom igång"]);
    await pause(page, 1000);
  }

  // ── Step 2: Fill in the sign-up form ────────────────────────────────────────
  logStep("Navigated to signup and filling account form");
  await page.waitForURL(/\/signup/, { timeout: 25_000 });
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});
  await pause(page, 800);

  await fillByPlaceholderAny(
    page,
    ["Enter your full name", "Ange ditt fullständiga namn"],
    fullName,
  ).catch(async () => {
    await fillByLabel(page, "Full Name", fullName);
  });
  await pause(page, 500);

  await fillByPlaceholderAny(
    page,
    ["your@email.com", "din@epost.se"],
    email,
  ).catch(async () => {
    await fillByLabel(page, "Email", email);
  });
  await pause(page, 500);

  await fillByPlaceholderAny(
    page,
    [
      "Create a password (min 6 characters)",
      "Create a password (min. 6 chars)",
      "Skapa ett lösenord (minst 6 tecken)",
    ],
    password,
  ).catch(async () => {
    await fillByLabel(page, "Password", password);
  });
  await pause(page, 500);

  await fillByPlaceholderAny(
    page,
    ["Confirm your password", "Bekräfta ditt lösenord"],
    password,
  ).catch(async () => {
    await fillByLabel(page, "Confirm Password", password);
  });
  await pause(page, 800);

  // Accept terms & conditions checkbox
  // The legal checkbox is a Pressable — find it by the surrounding text
  await clickActionByTextAny(page, [
    "I have read and agree to the Terms of Service and Privacy Policy",
    "Jag har läst och godkänner användarvillkoren och integritetspolicyn",
  ]).catch(() => {});

  // Fallback: click any explicit checkbox role if present.
  const checkboxRole = page.locator('[role="checkbox"]').first();
  if (await checkboxRole.isVisible().catch(() => false)) {
    await checkboxRole.click().catch(() => {});
  }
  await pause(page, 500);

  const submitted = await clickActionByTextAny(page, [
    "Create Account",
    "Sign Up",
    "Skapa konto",
  ]);
  if (!submitted) {
    throw new Error("Could not find clickable Create Account/Sign Up button.");
  }
  logStep("Signup submitted");
  await pause(page, 2000); // wait for "verify email" confirmation screen

  // Confirm signup actually succeeded before moving to inbox.
  const signupSuccess = await isAnyTextVisible(
    page,
    [
      /Account created successfully/i,
      /Verify Your Email/i,
      /check your email/i,
      /Verifiera din e-post/i,
      /Kontrollera din e-post/i,
    ],
    20_000,
  );

  if (!signupSuccess) {
    const existingAccountError = await isAnyTextVisible(
      page,
      [
        /An account already exists with this email address/i,
        /Ett konto finns redan med denna e-postadress/i,
      ],
      5_000,
    );

    if (existingAccountError) {
      throw new Error(
        `Signup failed because ${email} already exists. Delete this user in Firebase Auth (or use a brand new email) before recording Video 01.`,
      );
    }

    const snippet = (
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    )
      .slice(0, 600)
      .replace(/\s+/g, " ");
    throw new Error(
      `Signup was submitted but no success/verification message appeared. Page snippet: ${snippet}`,
    );
  }
  logStep("Signup success message confirmed");

  // ── Step 3: Open Strato webmail to verify the email ────────────────────────
  logStep("Opening Strato webmail");
  const browserContext = page.context();
  let webmailPage = await browserContext.newPage();

  await webmailPage.goto("https://webmail.strato.com/appsuite/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await webmailPage
    .waitForLoadState("networkidle", { timeout: 20_000 })
    .catch(() => {});
  await pause(webmailPage, 1500);

  // Strato can open either on login form or directly in inbox.
  // Detect login inputs directly and fill when present.
  const loginInput = webmailPage
    .locator(
      'input[name="login"], input[placeholder*="E-post"], input[placeholder*="Email"], input[type="text"]',
    )
    .first();
  const passwordInput = webmailPage
    .locator(
      'input[name="password"], input[placeholder*="Lösenord"], input[placeholder*="Password"], input[type="password"]',
    )
    .first();

  const loginInputVisible = await loginInput.isVisible().catch(() => false);
  const passwordInputVisible = await passwordInput
    .isVisible()
    .catch(() => false);

  if (loginInputVisible && passwordInputVisible) {
    logStep("Strato login inputs detected; filling credentials");

    await loginInput.fill(email);
    await pause(webmailPage, 400);

    await passwordInput.fill(webmailPassword);
    await pause(webmailPage, 400);

    await submitStratoLogin(webmailPage, passwordInput);

    logStep("Submitted Strato login form");
    await waitForAnyVisible(
      webmailPage,
      [
        { type: "text", value: "Inkorg" },
        { type: "text", value: "E-post" },
        { type: "text", value: "Inloggning" },
        { type: "text", value: "Login" },
      ],
      20_000,
    ).catch(() => null);
    logStep("Strato post-login readiness check completed");
    await pause(webmailPage, 2500);
    webmailPage = resolveLiveWebmailPage(browserContext, webmailPage);
  } else {
    logStep(
      "Strato login inputs not visible; assuming inbox/session is already open",
    );
    await pause(webmailPage, 1200);
  }

  webmailPage = resolveLiveWebmailPage(browserContext, webmailPage);

  // Find the Firebase verification email in the inbox.
  // If the exact row is not found quickly, continue without hard-failing the run.
  let emailOpened = await openVerificationEmailInInbox(webmailPage, 20_000);
  logStep(
    emailOpened
      ? "Verification email opened"
      : "Verification email not found in inbox",
  );

  // If inbox is empty, trigger resend from app login, then check inbox again.
  if (!emailOpened) {
    logStep("Triggering resend verification email from app login");

    await page.bringToFront();
    await page.goto("/login", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});
    await pause(page, 1000);

    await fillByPlaceholderAny(
      page,
      ["your@email.com", "din@epost.se"],
      email,
    ).catch(async () => {
      await fillByLabel(page, "Email", email).catch(async () => {
        await fillByLabel(page, "E-post", email);
      });
    });
    await pause(page, 300);

    await fillByPlaceholderAny(
      page,
      ["Enter your password", "Ange ditt lösenord"],
      password,
    ).catch(async () => {
      await fillByLabel(page, "Password", password).catch(async () => {
        await fillByLabel(page, "Lösenord", password);
      });
    });
    await pause(page, 300);

    await clickByTextAny(page, ["Sign In", "Logga in"]);
    await pause(page, 1500);

    // Dismiss any blocking modal before clicking resend.
    await clickActionByTextAny(page, ["OK", "Continue", "Fortsätt"]).catch(
      () => {},
    );
    await pause(page, 500);

    const resent = await clickByTextAny(page, [
      "Resend Verification Email",
      "Skicka verifieringsmail igen",
    ]);
    if (resent) {
      logStep("Resend verification email clicked");
      await pause(page, 2000);
    } else {
      logStep("Resend button not visible, continuing to inbox recheck");
    }

    webmailPage = resolveLiveWebmailPage(browserContext, webmailPage);
    await webmailPage.bringToFront().catch(() => {});
    if (!webmailPage.isClosed()) {
      await webmailPage
        .reload({ waitUntil: "domcontentloaded", timeout: 60_000 })
        .catch(() => {});
      await webmailPage
        .waitForLoadState("networkidle", { timeout: 20_000 })
        .catch(() => {});
      await pause(webmailPage, 2000);

      emailOpened = await openVerificationEmailInInbox(webmailPage, 20_000);
      logStep(
        emailOpened
          ? "Verification email found after resend"
          : "Verification email still not found after resend",
      );
    }
  }
  webmailPage = resolveLiveWebmailPage(browserContext, webmailPage);
  if (!webmailPage.isClosed()) {
    await pause(webmailPage, 1500); // viewer sees the email content
  }

  // Click the verification link inside the email body
  // Firebase sends a button/link labelled "Verify Email" or similar
  if (emailOpened && !webmailPage.isClosed()) {
    logStep("Attempting to click verification link in email");
    const verificationClicked =
      await clickVerificationLinkInWebmail(webmailPage);
    if (!verificationClicked) {
      throw new Error(
        "Could not find/click verification link in webmail message body after scrolling.",
      );
    }
    logStep("Verification link clicked");
  }
  if (!webmailPage.isClosed()) {
    await pause(webmailPage, 2000);
  }

  // Close webmail tab — viewer sees app again
  if (!webmailPage.isClosed()) {
    await webmailPage.close();
  }
  logStep("Returned from webmail to app");

  // After email verification, app shows a success modal on create-account screen.
  // Click Continue so the flow naturally transitions toward sign-in.
  await page.bringToFront();
  await page
    .waitForLoadState("domcontentloaded", { timeout: 20_000 })
    .catch(() => {});
  await pause(page, 800);

  const continueAfterVerify = await clickActionByTextAny(page, [
    "Continue",
    "Fortsätt",
  ]);
  if (continueAfterVerify) {
    logStep("Clicked verification success modal Continue");
    await pause(page, 1000);
    await page.waitForURL(/\/login/, { timeout: 10_000 }).catch(() => {});
  } else {
    logStep(
      "Verification success modal Continue not visible, continuing with login navigation fallback",
    );
  }

  // ── Step 4: Sign in to the app ──────────────────────────────────────────────
  logStep("Navigating to app login and signing in");
  await page.bringToFront();
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page
    .waitForLoadState("networkidle", { timeout: 20_000 })
    .catch(() => {});
  await pause(page, 1000);

  await fillByLabel(page, "Email", email).catch(async () => {
    await fillByLabel(page, "E-post", email).catch(async () => {
      await fillByPlaceholderAny(
        page,
        ["your@email.com", "din@epost.se"],
        email,
      ).catch(async () => {
        await fillByLabel(page, "Email", email);
      });
    });
  });
  await pause(page, 500);
  await fillByLabel(page, "Password", password).catch(async () => {
    await fillByLabel(page, "Lösenord", password).catch(async () => {
      await fillByPlaceholderAny(
        page,
        ["Enter your password", "Ange ditt lösenord"],
        password,
      ).catch(async () => {
        await fillByLabel(page, "Password", password);
      });
    });
  });
  await pause(page, 500);

  await clickByTextAny(page, ["Sign In", "Logga in"]);
  await page
    .waitForLoadState("networkidle", { timeout: 20_000 })
    .catch(() => {});
  logStep("Video 01 flow finished");
  await pause(page, 2500); // hold on the home screen so viewers see the result
});
