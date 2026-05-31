/**
 * VIDEO 03 — Invite Members
 *
 * Shows: Admin opens the club → navigates to a group →
 *        invites an existing user (Jordan Lee / tester1) as player →
 *        invites a non-existing user (newcoach@clubnizer.com) as coach
 *
 * Covers two invitation flows:
 *   A) Inviting someone who already has a Clubnizer account
 *   B) Inviting someone who does NOT have a Clubnizer account yet
 */

import { test } from '@playwright/test';
import { login, pause, tapText, waitForText, fillByLabel } from '../helpers/auth';

const adminEmail = process.env.ADMIN_EMAIL!;
const adminPassword = process.env.ADMIN_PASSWORD!;

// Existing member — has a Clubnizer account
const existingUserEmail = process.env.TESTER1_EMAIL!; // Jordan Lee

// New member — does NOT have an account yet
const newCoachEmail = process.env.NEW_COACH_EMAIL!;

test('03 – Invite members (existing & new user)', async ({ page }) => {
  // ── Step 1: Sign in as admin ─────────────────────────────────────────────────
  await login(page, adminEmail, adminPassword);
  await pause(page, 1500);

  // ── Step 2: Navigate to the club → group ────────────────────────────────────
  // Tap the club in the home screen
  await page.getByText('Your Club').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  // Tap into a group (Team A)
  await page.getByText('Team A').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  // ── Part A: Invite an EXISTING user as a player ──────────────────────────────
  await page.getByText('Invite').first().click().catch(async () => {
    await page.locator('[aria-label="Invite member"]').click().catch(() => {});
  });
  await pause(page, 1000);

  // Select role: Player
  await page.getByText('Player').first().click();
  await pause(page, 600);

  // Enter the existing user's email
  await fillByLabel(page, 'Email', existingUserEmail).catch(async () => {
    await page.locator('input[type="email"]').first().fill(existingUserEmail);
  });
  await pause(page, 800);

  await tapText(page, 'Send');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000); // invitation sent — viewer sees the confirmation

  // Dismiss confirmation modal
  await page.getByText('OK').first().click().catch(() => {});
  await pause(page, 1000);

  // ── Part B: Invite a NON-EXISTING user as a coach ───────────────────────────
  await page.getByText('Invite').first().click().catch(async () => {
    await page.locator('[aria-label="Invite member"]').click().catch(() => {});
  });
  await pause(page, 1000);

  // Select role: Coach
  await page.getByText('Coach').first().click();
  await pause(page, 600);

  // Enter the new (non-existing) email
  await fillByLabel(page, 'Email', newCoachEmail).catch(async () => {
    await page.locator('input[type="email"]').first().fill(newCoachEmail);
  });
  await pause(page, 800);

  await tapText(page, 'Send');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000); // invitation sent to new user

  // Dismiss confirmation modal
  await page.getByText('OK').first().click().catch(() => {});
  await pause(page, 2500); // hold on final screen
});
