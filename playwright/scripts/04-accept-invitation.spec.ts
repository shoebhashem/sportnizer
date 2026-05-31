/**
 * VIDEO 04 — Accept an Invitation
 *
 * Shows the member's perspective:
 *   Sign in as Jordan Lee (tester1) → see the pending invitation notification →
 *   tap the invitation → review details → accept → land in the club/group
 *
 * Prerequisite: Run video 03 first so Jordan Lee has a pending invitation.
 */

import { test } from '@playwright/test';
import { login, pause, tapText, waitForText } from '../helpers/auth';

const memberEmail = process.env.TESTER1_EMAIL!;    // Jordan Lee
const memberPassword = process.env.TESTER1_PASSWORD!;

test('04 – Accept an invitation', async ({ page }) => {
  // ── Step 1: Sign in as Jordan Lee ───────────────────────────────────────────
  await login(page, memberEmail, memberPassword);
  await pause(page, 2000); // viewer sees the home screen

  // ── Step 2: Find the invitation ─────────────────────────────────────────────
  // Invitations usually appear as a banner/notification or in a dedicated tab.
  // Try notification bell or "Invitations" tab first.
  const invitationBanner = page.getByText('You have been invited').first();
  const hasNotification = await invitationBanner.isVisible({ timeout: 4000 }).catch(() => false);

  if (hasNotification) {
    await invitationBanner.click();
  } else {
    // Try tapping the notification bell icon
    await page.locator('[aria-label="Notifications"]').click().catch(async () => {
      // Or try a dedicated "Invitations" section
      await page.getByText('Invitation').first().click();
    });
  }
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  // ── Step 3: Review the invitation details ───────────────────────────────────
  await waitForText(page, 'Team A').catch(() => {});
  await pause(page, 2000); // let viewer read the invitation details

  // ── Step 4: Accept the invitation ───────────────────────────────────────────
  await tapText(page, 'Accept');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000); // confirmation / redirect to the group

  // Dismiss success modal if present
  await page.getByText('OK').first().click().catch(() => {});
  await pause(page, 1500);

  // ── Step 5: Show the member inside the group ────────────────────────────────
  // Navigate to the group to show Jordan Lee is now a member
  await page.getByText('Team A').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await pause(page, 2500); // hold so viewer sees the group with Jordan Lee listed
});
