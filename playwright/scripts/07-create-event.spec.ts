/**
 * VIDEO 07 — Create & Manage an Event
 *
 * Shows: Admin signs in → navigates to a group →
 *        creates a new event (training session) →
 *        assigns members → marks attendance after the event
 */

import { test } from '@playwright/test';
import { fillByLabel, login, pause, tapText, waitForText } from '../helpers/auth';

const adminEmail = process.env.ADMIN_EMAIL!;
const adminPassword = process.env.ADMIN_PASSWORD!;

test('07 – Create and manage an event', async ({ page }) => {
  // ── Step 1: Sign in ─────────────────────────────────────────────────────────
  await login(page, adminEmail, adminPassword);
  await pause(page, 1500);

  // ── Step 2: Navigate to group ───────────────────────────────────────────────
  await page.getByText('Your Club').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await pause(page, 800);

  await page.getByText('Team A').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  // ── Step 3: Tap "Create Event" ───────────────────────────────────────────────
  await page.getByText('Create Event').first().click().catch(async () => {
    await page.locator('[aria-label="Create event"]').click().catch(() => {});
  });
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  // ── Step 4: Fill in event details ───────────────────────────────────────────
  await fillByLabel(page, 'Title', 'Morning Training').catch(async () => {
    await fillByLabel(page, 'Event Title', 'Morning Training');
  });
  await pause(page, 600);

  // Event type — select "Training"
  await page.getByText('Training').first().click().catch(() => {});
  await pause(page, 600);

  // Date — tap and pick a date from the picker
  await page.getByText('Date').first().click().catch(() => {});
  await pause(page, 1000);
  // Confirm the pre-selected date
  await tapText(page, 'Confirm').catch(async () => {
    await tapText(page, 'OK').catch(() => {});
  });
  await pause(page, 600);

  // Location
  await fillByLabel(page, 'Location', 'Main Sports Hall').catch(() => {});
  await pause(page, 600);

  // Description
  await fillByLabel(page, 'Description', 'Regular weekly training session.').catch(() => {});
  await pause(page, 800);

  // ── Step 5: Create the event ─────────────────────────────────────────────────
  await tapText(page, 'Create');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000); // event created

  await page.getByText('OK').first().click().catch(() => {});
  await pause(page, 1000);

  // ── Step 6: Open the event and mark attendance ───────────────────────────────
  await page.getByText('Morning Training').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await pause(page, 1500);

  // Mark a few members as present
  // Attendance items are usually checkboxes or toggle buttons next to names
  await page.getByText('Jordan Lee').first().locator('xpath=following::div[1]').click().catch(async () => {
    // Fallback — tap the member row
    await page.getByText('Jordan Lee').first().click();
  });
  await pause(page, 600);

  await page.getByText('John Rivera').first().locator('xpath=following::div[1]').click().catch(async () => {
    await page.getByText('John Rivera').first().click();
  });
  await pause(page, 600);

  await tapText(page, 'Save').catch(async () => {
    await tapText(page, 'Done').catch(() => {});
  });
  await page.waitForLoadState('networkidle');
  await pause(page, 2500); // hold on the event with attendance saved
});
