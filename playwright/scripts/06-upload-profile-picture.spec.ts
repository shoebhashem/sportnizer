/**
 * VIDEO 06 — Upload Your Profile Picture
 *
 * Shows: Sign in as tester6 (John Andersson — no profile photo) →
 *        navigate to profile → tap profile picture area →
 *        choose a photo from device / upload file →
 *        save → see the updated profile picture
 *
 * Prerequisite: Delete tester6's Firebase Auth account and re-create it
 *               (so the account still exists but has the default photo).
 *               See docs/video-demo-users.md for details.
 */

import * as path from 'path';
import { test } from '@playwright/test';
import { login, pause, tapText, waitForText } from '../helpers/auth';

const userEmail = process.env.TESTER6_EMAIL!;       // John Andersson
const userPassword = process.env.TESTER6_PASSWORD!;

// Path to a sample profile photo to upload (place one in playwright/assets/)
const PROFILE_PHOTO = path.join(__dirname, '../assets/sample-profile.jpg');

test('06 – Upload a profile picture', async ({ page }) => {
  // ── Step 1: Sign in ─────────────────────────────────────────────────────────
  await login(page, userEmail, userPassword);
  await pause(page, 1500);

  // ── Step 2: Navigate to Profile ─────────────────────────────────────────────
  // Profile is usually the last tab or accessible via the tab bar
  await page.getByText('Profile').last().click().catch(async () => {
    await page.locator('[aria-label="Profile"]').click().catch(() => {});
  });
  await page.waitForLoadState('networkidle');
  await pause(page, 1000);

  // ── Step 3: Tap the profile picture area ────────────────────────────────────
  // The profile picture is typically at the top of the profile screen
  const profilePicArea = page.locator('[aria-label="Change profile picture"]').first();
  const hasPicArea = await profilePicArea.isVisible({ timeout: 3000 }).catch(() => false);

  if (hasPicArea) {
    await profilePicArea.click();
  } else {
    // Fallback: tap the avatar/image at the top of the profile screen
    await page.locator('img').first().click().catch(async () => {
      await page.getByText('Change Photo').first().click().catch(() => {});
    });
  }
  await pause(page, 1000);

  // ── Step 4: Choose a file (web file input) ──────────────────────────────────
  // On web, the image picker opens a file input — intercept it
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });

  // Tap "Choose from Library" or "Upload Photo"
  await page.getByText('Choose from Library').first().click().catch(async () => {
    await page.getByText('Upload').first().click().catch(async () => {
      // If the file chooser was already triggered, just proceed
    });
  });

  const fileChooser = await fileChooserPromise.catch(() => null);
  if (fileChooser) {
    await fileChooser.setFiles(PROFILE_PHOTO);
  }
  await pause(page, 1500);

  // ── Step 5: Confirm / save the photo ────────────────────────────────────────
  await tapText(page, 'Save').catch(async () => {
    await tapText(page, 'Done').catch(async () => {
      await tapText(page, 'Upload');
    });
  });
  await page.waitForLoadState('networkidle');
  await pause(page, 2000); // photo uploaded — viewer sees the new profile picture

  await waitForText(page, 'John Andersson').catch(() => {});
  await pause(page, 2500); // hold on the updated profile screen
});
