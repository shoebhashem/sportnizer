import { Page, Locator } from '@playwright/test';

/**
 * Finds an <input> that is the sibling/descendant of a label Text element.
 * Works with Expo Web's React Native Text + TextInput rendering pattern.
 *
 * The DOM structure produced by Expo Web is:
 *   <div>                  ← View container
 *     <span>Email</span>   ← Text label
 *     <div>                ← View inputContainer
 *       <input ... />      ← TextInput
 *     </div>
 *   </div>
 *
 * XPath `following::input[1]` reliably finds the first input after the label.
 */
export function inputByLabel(page: Page, labelText: string): Locator {
  return page.locator(
    `xpath=//span[normalize-space()="${labelText}"]/following::input[1]`
  );
}

/**
 * Types into an input identified by its visible label text.
 * Clears any existing value first.
 */
export async function fillByLabel(
  page: Page,
  labelText: string,
  value: string
) {
  const input = inputByLabel(page, labelText);
  await input.click();
  await input.fill(value);
}

/**
 * Clicks the first element with matching visible text.
 * Works for Pressable/TouchableOpacity (which render as divs, not buttons).
 */
export async function tapText(page: Page, text: string) {
  await page.getByText(text, { exact: true }).first().click();
}

/**
 * Waits for a text to become visible — useful after navigation or API calls.
 */
export async function waitForText(page: Page, text: string, timeout = 15_000) {
  await page.getByText(text).waitFor({ state: 'visible', timeout });
}

/**
 * Logs in to the app with the given credentials.
 * Navigates to /login if not already there.
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await fillByLabel(page, 'Email', email);
  await fillByLabel(page, 'Password', password);
  await tapText(page, 'Sign In');

  // Wait for the home/tabs screen to load
  await page.waitForURL(/\/(tabs|\(tabs\))/, { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
}

/**
 * Pauses for a moment — gives viewers time to read what is on screen.
 */
export async function pause(page: Page, ms = 1500) {
  await page.waitForTimeout(ms);
}
