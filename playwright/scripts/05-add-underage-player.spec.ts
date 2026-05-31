/**
 * VIDEO 05 — Add an Underage Player (with Guardian Link)
 *
 * Shows: Admin signs in → opens a group → taps "Add Member" →
 *        selects "Underage Player" → fills child details →
 *        links a guardian (John Rivera / tester2) →
 *        guardian receives notification
 */

import { test } from '@playwright/test';
import { login, pause, tapText, waitForText, fillByLabel } from '../helpers/auth';

const adminEmail = process.env.ADMIN_EMAIL!;
const adminPassword = process.env.ADMIN_PASSWORD!;

const guardianEmail = process.env.TESTER2_EMAIL!;  // John Rivera

test('05 – Add an underage player and link a guardian', async ({ page }) => {
  // ── Step 1: Sign in as admin ─────────────────────────────────────────────────
  await login(page, adminEmail, adminPassword);
  await pause(page, 1500);

  // ── Step 2: Navigate to the group ───────────────────────────────────────────
  await page.getByText('Your Club').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await pause(page, 800);

  await page.getByText('Team A').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  // ── Step 3: Open "Add Member" ───────────────────────────────────────────────
  await page.getByText('Add Member').first().click().catch(async () => {
    await page.locator('[aria-label="Add member"]').click().catch(() => {});
  });
  await pause(page, 1000);

  // ── Step 4: Select "Underage Player" / "Add Child" ──────────────────────────
  await page.getByText('Underage Player').first().click().catch(async () => {
    await page.getByText('Add Child').first().click().catch(() => {});
  });
  await pause(page, 800);

  // ── Step 5: Fill in child details ───────────────────────────────────────────
  await fillByLabel(page, 'Full Name', 'Sam Rivera').catch(async () => {
    await fillByLabel(page, 'Name', 'Sam Rivera');
  });
  await pause(page, 600);

  // Date of birth — tap and select from picker
  await page.getByText('Date of Birth').first().click().catch(async () => {
    await fillByLabel(page, 'Date of Birth', '2014-05-10');
  });
  await pause(page, 800);

  // ── Step 6: Assign a guardian ────────────────────────────────────────────────
  await fillByLabel(page, 'Guardian Email', guardianEmail).catch(async () => {
    await page.locator('input[type="email"]').first().fill(guardianEmail);
  });
  await pause(page, 600);

  // Select relationship
  await page.getByText('Parent').first().click().catch(() => {});
  await pause(page, 600);

  // ── Step 7: Submit ───────────────────────────────────────────────────────────
  await tapText(page, 'Add');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000); // member added confirmation

  await page.getByText('OK').first().click().catch(() => {});
  await pause(page, 1000);

  // ── Step 8: Show the child in the group member list ─────────────────────────
  await waitForText(page, 'Sam Rivera').catch(() => {});
  await pause(page, 2500); // hold so viewer sees the child listed in the group
});
