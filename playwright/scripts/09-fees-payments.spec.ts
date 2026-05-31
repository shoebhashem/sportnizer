/**
 * VIDEO 09 — Fees & Payments
 *
 * Shows: Admin signs in → navigates to Fees →
 *        creates a new fee (annual membership) →
 *        assigns it to a group →
 *        views the payment tracking screen (who has / hasn't paid)
 */

import { test } from '@playwright/test';
import { fillByLabel, login, pause, tapText, waitForText } from '../helpers/auth';

const adminEmail = process.env.ADMIN_EMAIL!;
const adminPassword = process.env.ADMIN_PASSWORD!;

test('09 – Create a fee and track payments', async ({ page }) => {
  // ── Step 1: Sign in ─────────────────────────────────────────────────────────
  await login(page, adminEmail, adminPassword);
  await pause(page, 1500);

  // ── Step 2: Navigate to Fees / Manage Fees ──────────────────────────────────
  await page.getByText('Fees').first().click().catch(async () => {
    await page.getByText('Manage Fees').first().click().catch(async () => {
      await page.locator('[aria-label="Fees"]').click().catch(() => {});
    });
  });
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  // ── Step 3: Create a new fee ─────────────────────────────────────────────────
  await page.getByText('Create Fee').first().click().catch(async () => {
    await page.locator('[aria-label="Create fee"]').click().catch(async () => {
      await page.locator('[aria-label="Add"]').click().catch(() => {});
    });
  });
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  // ── Step 4: Fill in fee details ──────────────────────────────────────────────
  await fillByLabel(page, 'Title', 'Annual Membership Fee 2026').catch(async () => {
    await fillByLabel(page, 'Name', 'Annual Membership Fee 2026');
  });
  await pause(page, 600);

  await fillByLabel(page, 'Amount', '500').catch(async () => {
    await page.locator('input[type="number"]').first().fill('500');
  });
  await pause(page, 600);

  await fillByLabel(page, 'Description', 'Annual membership fee for the 2026 season.').catch(() => {});
  await pause(page, 600);

  // Assign to a group — tap the group selector
  await page.getByText('Select Group').first().click().catch(async () => {
    await page.getByText('Assign to Group').first().click().catch(() => {});
  });
  await pause(page, 800);

  await page.getByText('Team A').first().click();
  await pause(page, 600);

  // ── Step 5: Save / create the fee ────────────────────────────────────────────
  await tapText(page, 'Create').catch(async () => {
    await tapText(page, 'Save');
  });
  await page.waitForLoadState('networkidle');
  await pause(page, 2000); // fee created

  await page.getByText('OK').first().click().catch(() => {});
  await pause(page, 1000);

  // ── Step 6: Open the fee and show payment tracking ───────────────────────────
  await page.getByText('Annual Membership Fee 2026').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await pause(page, 1500);

  // Navigate to "Track Payments" if there is a separate screen
  await page.getByText('Track Payments').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await pause(page, 2500); // hold on payment tracking — viewer sees unpaid/paid members
});
