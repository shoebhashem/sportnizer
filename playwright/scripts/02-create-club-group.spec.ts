/**
 * VIDEO 02 — Create Your Club & Create a Group
 *
 * Shows: Sign in as admin → navigate to Create Club →
 *        fill in club details → submit → create a group inside the club
 *
 * ⚠️  This script assumes the admin account does NOT yet have a club.
 *     Use a fresh account or temporarily remove club access before recording.
 */

import { test } from '@playwright/test';
import { fillByLabel, login, pause, tapText, waitForText } from '../helpers/auth';

const adminEmail = process.env.ADMIN_EMAIL!;
const adminPassword = process.env.ADMIN_PASSWORD!;

test('02 – Create club and create a group', async ({ page }) => {
  // ── Step 1: Sign in ─────────────────────────────────────────────────────────
  await login(page, adminEmail, adminPassword);
  await pause(page, 1500);

  // ── Step 2: Navigate to Create Club ─────────────────────────────────────────
  // The profile tab or the home tab has a "Create Club" option
  // Try the home/profile tab first
  await page.getByText('Create Club').first().click();
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  // ── Step 3: Fill in the club form ───────────────────────────────────────────
  await waitForText(page, 'Create Your Club');
  await pause(page, 800);

  await fillByLabel(page, 'Club Name', 'Your Club');
  await pause(page, 600);

  await fillByLabel(page, 'Description', 'A community sports club for all ages.');
  await pause(page, 600);

  await fillByLabel(page, 'Location', 'Stockholm, Sweden');
  await pause(page, 600);

  // Country is a dropdown — tap it and select Sweden
  await tapText(page, 'Country');
  await pause(page, 800);
  await page.getByText('Sweden').first().click();
  await pause(page, 600);

  await pause(page, 800);

  // ── Step 4: Submit the form ─────────────────────────────────────────────────
  await tapText(page, 'Create');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000); // club created confirmation

  // Dismiss success modal if present
  await page.getByText('OK').first().click().catch(() => {});
  await pause(page, 1000);

  // ── Step 5: Create a group ──────────────────────────────────────────────────
  // After club creation, the user should see the club management screen
  // Look for "Manage Teams" or "Groups" tab / create group button
  await page.getByText('Create Group').first().click().catch(async () => {
    // Fallback: look for the FAB or a + button
    await page.locator('[aria-label="Create group"]').click().catch(() => {});
  });
  await pause(page, 1000);

  // Fill group name
  await waitForText(page, 'Group Name').catch(() => {});
  await fillByLabel(page, 'Group Name', 'Team A').catch(async () => {
    // Fallback if label differs
    await fillByLabel(page, 'Name', 'Team A');
  });
  await pause(page, 600);

  await tapText(page, 'Create');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000); // group created — hold so viewer sees the result

  // ── Step 6: Create a subgroup ───────────────────────────────────────────────
  await page.getByText('Create Subgroup').first().click().catch(() => {});
  await pause(page, 800);

  await fillByLabel(page, 'Group Name', 'Under 12').catch(async () => {
    await fillByLabel(page, 'Name', 'Under 12');
  });
  await pause(page, 600);

  await tapText(page, 'Create');
  await page.waitForLoadState('networkidle');
  await pause(page, 2500); // hold on the final screen
});
