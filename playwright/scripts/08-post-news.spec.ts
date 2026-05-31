/**
 * VIDEO 08 — Post Club News
 *
 * Shows: Admin signs in → navigates to News →
 *        creates a new news post with title, content and optional image →
 *        publishes → member sees the news in the feed
 */

import { test } from '@playwright/test';
import { fillByLabel, login, pause, tapText, waitForText } from '../helpers/auth';

const adminEmail = process.env.ADMIN_EMAIL!;
const adminPassword = process.env.ADMIN_PASSWORD!;
const memberEmail = process.env.TESTER1_EMAIL!;    // Jordan Lee
const memberPassword = process.env.TESTER1_PASSWORD!;

test('08 – Post club news', async ({ page }) => {
  // ── Step 1: Sign in as admin ─────────────────────────────────────────────────
  await login(page, adminEmail, adminPassword);
  await pause(page, 1500);

  // ── Step 2: Navigate to News section ────────────────────────────────────────
  await page.getByText('News').first().click().catch(async () => {
    await page.locator('[aria-label="News"]').click().catch(() => {});
  });
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  // ── Step 3: Tap "Create News" ────────────────────────────────────────────────
  await page.getByText('Create News').first().click().catch(async () => {
    await page.locator('[aria-label="Create news post"]').click().catch(async () => {
      // FAB button
      await page.locator('[aria-label="Add"]').click().catch(() => {});
    });
  });
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  // ── Step 4: Fill in the news post ───────────────────────────────────────────
  await fillByLabel(page, 'Title', 'Season Kick-off Meeting').catch(async () => {
    await page.locator('input').first().fill('Season Kick-off Meeting');
  });
  await pause(page, 600);

  // Body / content area
  await fillByLabel(page, 'Content', 'Join us for our season kick-off meeting on June 10th at the sports hall. All members and their families are welcome!').catch(async () => {
    await page.locator('textarea').first().fill('Join us for our season kick-off meeting on June 10th at the sports hall. All members and their families are welcome!');
  });
  await pause(page, 800);

  // ── Step 5: Publish ──────────────────────────────────────────────────────────
  await tapText(page, 'Publish').catch(async () => {
    await tapText(page, 'Create').catch(async () => {
      await tapText(page, 'Save');
    });
  });
  await page.waitForLoadState('networkidle');
  await pause(page, 2000); // post published

  await page.getByText('OK').first().click().catch(() => {});
  await pause(page, 1000);

  // ── Step 6 (optional): Show the post in the news feed ───────────────────────
  await page.getByText('Season Kick-off Meeting').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await pause(page, 2500); // hold on the news detail view

  // ── Step 7: Switch to member view to show they can see the news ─────────────
  // Sign out
  await page.goto('/login');
  await pause(page, 800);

  await fillByLabel(page, 'Email', memberEmail);
  await fillByLabel(page, 'Password', memberPassword);
  await tapText(page, 'Sign In');
  await page.waitForLoadState('networkidle');
  await pause(page, 1500);

  // Navigate to news
  await page.getByText('News').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  await waitForText(page, 'Season Kick-off Meeting').catch(() => {});
  await pause(page, 2500); // member sees the news post
});
