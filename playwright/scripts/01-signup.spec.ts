/**
 * VIDEO 01 — Get Started: Sign Up, Verify Email & Sign In
 *
 * Shows: Welcome screen → Sign Up → fill form → submit →
 *        open Gmail → click verification link → sign in to app
 *
 * Requires: NEW_USER_EMAIL, NEW_USER_PASSWORD, NEW_USER_NAME, GMAIL_APP_PASSWORD in .env
 *
 * ⚠️  Run this script ONCE on a fresh account.
 *     Delete the Firebase Auth account before re-recording.
 */

import { test } from '@playwright/test';
import { fillByLabel, pause, tapText, waitForText } from '../helpers/auth';

const email = process.env.NEW_USER_EMAIL!;
const password = process.env.NEW_USER_PASSWORD!;
const fullName = process.env.NEW_USER_NAME!;
const webmailPassword = process.env.WEBMAIL_PASSWORD!;

test('01 – Sign up, verify email, sign in', async ({ page }) => {
  // ── Step 1: Welcome screen ──────────────────────────────────────────────────
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000); // let viewer see the welcome screen

  await tapText(page, 'Get Started');
  await pause(page, 1000);

  // ── Step 2: Fill in the sign-up form ────────────────────────────────────────
  await waitForText(page, 'Sign Up');
  await pause(page, 800);

  await fillByLabel(page, 'Full Name', fullName);
  await pause(page, 500);

  await fillByLabel(page, 'Email', email);
  await pause(page, 500);

  await fillByLabel(page, 'Password', password);
  await pause(page, 500);

  await fillByLabel(page, 'Confirm Password', password);
  await pause(page, 800);

  // Accept terms & conditions checkbox
  // The legal checkbox is a Pressable — find it by the surrounding text
  const legalCheckbox = page.locator('xpath=//span[contains(text(),"Terms") or contains(text(),"Privacy")]/ancestor::div[1]/preceding-sibling::div[1]');
  await legalCheckbox.click().catch(() => {
    // Fallback: tap the first checkbox-like element on the page
    page.locator('[role="checkbox"]').first().click();
  });
  await pause(page, 500);

  await tapText(page, 'Sign Up');
  await pause(page, 2000); // wait for "verify email" confirmation screen

  // ── Step 3: Open Strato webmail to verify the email ────────────────────────
  const webmailPage = await page.context().newPage();

  await webmailPage.goto('https://webmail.strato.com/appsuite/');
  await webmailPage.waitForLoadState('networkidle');
  await pause(webmailPage, 1500);

  // Log in to Strato App Suite
  const loginInput = webmailPage.locator('input[name="login"], input[type="text"]').first();
  await loginInput.fill(email);
  await pause(webmailPage, 500);

  const passwordInput = webmailPage.locator('input[name="password"], input[type="password"]').first();
  await passwordInput.fill(webmailPassword);
  await pause(webmailPage, 500);

  await webmailPage.locator('button[type="submit"], input[type="submit"]').first().click();
  await webmailPage.waitForLoadState('networkidle');
  await pause(webmailPage, 2500); // inbox loads — viewer sees the inbox

  // Find the Firebase verification email in the inbox
  // Strato App Suite lists emails as rows — click the one about email verification
  await webmailPage.getByText('Verify your email').first().click().catch(async () => {
    await webmailPage.getByText('Verify').first().click().catch(async () => {
      // Fallback: look for the noreply sender row
      await webmailPage.getByText('noreply').first().click();
    });
  });
  await pause(webmailPage, 1500); // viewer sees the email content

  // Click the verification link inside the email body
  // Firebase sends a button/link labelled "Verify Email" or similar
  await webmailPage.getByText('Verify Email').first().click().catch(async () => {
    // Fallback: find any link that contains the Firebase action URL
    await webmailPage.locator('a[href*="firebaseapp.com/action"]').first().click().catch(async () => {
      await webmailPage.locator('a[href*="accountAction"]').first().click();
    });
  });
  await pause(webmailPage, 2000);

  // Close webmail tab — viewer sees app again
  await webmailPage.close();

  // ── Step 4: Sign in to the app ──────────────────────────────────────────────
  await page.bringToFront();
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  await fillByLabel(page, 'Email', email);
  await pause(page, 500);
  await fillByLabel(page, 'Password', password);
  await pause(page, 500);

  await tapText(page, 'Sign In');
  await page.waitForLoadState('networkidle');
  await pause(page, 2500); // hold on the home screen so viewers see the result
});
