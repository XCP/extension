/**
 * Compose Flow Test Helpers
 *
 * Helper functions for testing the compose form → review → success flow.
 * Includes support for enabling Transaction Dry Run mode for full flow testing.
 */

import { Page, expect } from '@playwright/test';
import { TEST_ADDRESSES } from './test-data';

/**
 * Enable API validation bypass for compose requests.
 * This adds validate=false to all compose API calls, which skips the
 * Counterparty API's balance/funds validation (allowing tests without real funds).
 *
 * Note: This is different from dry run mode - dry run skips broadcast,
 * while validation bypass skips compose-time balance checks.
 *
 * @param page - Playwright page instance
 */
export async function enableValidationBypass(page: Page): Promise<void> {
  await page.route('**/v2/addresses/*/compose/**', async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('validate', 'false');
    await route.continue({ url: url.toString() });
  });

  // Also handle UTXO-based compose endpoints (detach, move)
  await page.route('**/v2/utxos/*/compose/**', async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('validate', 'false');
    await route.continue({ url: url.toString() });
  });
}

/**
 * Enable Transaction Dry Run mode for testing full flows without broadcasting.
 * This setting is only available in development mode.
 *
 * When enabled:
 * - Transactions return mock txid (dev_mock_tx_...)
 * - 500ms simulated delay for realistic UX
 * - No actual network calls are made
 */
export async function enableDryRun(page: Page): Promise<void> {
  const currentUrl = page.url();

  // Navigate to advanced settings
  const hashIndex = currentUrl.indexOf('#');
  const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
  await page.goto(`${baseUrl}/settings/advanced`);
  await page.waitForLoadState('networkidle');

  // Find the dry run toggle
  const dryRunRow = page.locator('text=Transaction Dry Run').locator('..');
  const toggle = dryRunRow.locator('button[role="switch"]');

  // Wait for toggle to be visible (only in dev mode)
  const isVisible = await toggle.isVisible({ timeout: 3000 }).catch(() => false);
  if (!isVisible) {
    console.warn('Transaction Dry Run toggle not visible - may not be in development mode');
    await page.goto(currentUrl);
    return;
  }

  // Only click if not already enabled
  const isEnabled = await toggle.getAttribute('aria-checked');
  if (isEnabled !== 'true') {
    await toggle.click();
    // Wait for setting to save
    await page.waitForTimeout(500);
  }

  // Return to original page
  await page.goto(currentUrl);
  await page.waitForLoadState('networkidle');
}

/**
 * Check if dry run mode is currently enabled
 */
export async function isDryRunEnabled(page: Page): Promise<boolean> {
  const currentUrl = page.url();

  const hashIndex = currentUrl.indexOf('#');
  const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
  await page.goto(`${baseUrl}/settings/advanced`);
  await page.waitForLoadState('networkidle');

  const dryRunRow = page.locator('text=Transaction Dry Run').locator('..');
  const toggle = dryRunRow.locator('button[role="switch"]');

  const isVisible = await toggle.isVisible({ timeout: 2000 }).catch(() => false);
  if (!isVisible) {
    await page.goto(currentUrl);
    return false;
  }

  const isEnabled = await toggle.getAttribute('aria-checked');
  await page.goto(currentUrl);
  return isEnabled === 'true';
}

/**
 * Navigate to a compose page
 * Uses the existing URL pattern from the extension popup
 */
export async function goToCompose(page: Page, path: string): Promise<void> {
  // Get current URL and modify hash for navigation
  const currentUrl = page.url();

  // Find the base extension URL (everything before #)
  const hashIndex = currentUrl.indexOf('#');
  if (hashIndex === -1) {
    // If no hash, we're not on the extension popup yet
    throw new Error('goToCompose must be called from an extension page');
  }

  const baseUrl = currentUrl.substring(0, hashIndex);
  const targetUrl = `${baseUrl}#/compose/${path}`;

  await page.goto(targetUrl);
  await page.waitForLoadState('networkidle');

  // Wait for compose page to render
  await page.waitForTimeout(1000);
}

/**
 * Fill the destination input with a valid testnet address
 */
export async function fillDestination(page: Page, address?: string): Promise<void> {
  const dest = address || TEST_ADDRESSES.testnet.p2wpkh;
  const input = page.locator('input[placeholder="Enter destination address"]');
  await input.fill(dest);
  await input.blur();
}

/**
 * Fill the amount input
 */
export async function fillAmount(page: Page, amount: string): Promise<void> {
  const input = page.locator('input[name="quantity"]');
  await input.first().fill(amount);
}

/**
 * Fill standard send form fields
 */
export async function fillSendForm(
  page: Page,
  options: {
    destination?: string;
    amount: string;
    memo?: string;
  }
): Promise<void> {
  await fillDestination(page, options.destination);
  await fillAmount(page, options.amount);

  if (options.memo) {
    const memoInput = page.locator('input[name="memo"], textarea[name="memo"]');
    if (await memoInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await memoInput.fill(options.memo);
    }
  }
}

/**
 * Click the Continue/Submit button
 */
export async function submitForm(page: Page): Promise<void> {
  const submitBtn = page.locator('button[type="submit"]:has-text("Continue")');
  await expect(submitBtn).toBeVisible({ timeout: 5000 });
  await submitBtn.click();
}

/**
 * Wait for review page to appear
 */
export async function waitForReview(page: Page): Promise<void> {
  // Review page typically shows "Review" heading or transaction details
  const reviewIndicators = [
    page.locator('text=/Review Transaction|Confirm Transaction|Review/i').first(),
    page.locator('text=Sign & Broadcast').first(),
    page.locator('button:has-text("Sign"), button:has-text("Broadcast")').first(),
  ];

  // Wait for any of these indicators
  await Promise.race(
    reviewIndicators.map((loc) =>
      loc.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
    )
  );

  // Verify at least one is visible
  let found = false;
  for (const loc of reviewIndicators) {
    if (await loc.isVisible().catch(() => false)) {
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error('Review page indicators not found after form submission');
  }
}

/**
 * Click back button on review page
 */
export async function clickBack(page: Page): Promise<void> {
  const backBtn = page
    .locator('button:has-text("Back"), button[aria-label*="back"], button[aria-label*="Back"]')
    .first();
  await expect(backBtn).toBeVisible({ timeout: 5000 });
  await backBtn.click();
}

/**
 * Sign and broadcast on review page
 */
export async function signAndBroadcast(page: Page): Promise<void> {
  const signBtn = page
    .locator('button:has-text("Sign & Broadcast"), button:has-text("Broadcast"), button:has-text("Sign")')
    .first();
  await expect(signBtn).toBeVisible({ timeout: 5000 });
  await signBtn.click();
}

/**
 * Wait for success page after signing
 */
export async function waitForSuccess(page: Page): Promise<void> {
  // Success page shows mock txid (dev_mock_tx_) or success message
  const successIndicators = [
    page.locator('text=/dev_mock_tx_/').first(),
    page.locator('text=/Success|Transaction Sent|Broadcast Complete/i').first(),
    page.locator('text=/Transaction ID|TXID/i').first(),
  ];

  await Promise.race(
    successIndicators.map((loc) =>
      loc.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
    )
  );

  // Verify at least one is visible
  let found = false;
  for (const loc of successIndicators) {
    if (await loc.isVisible().catch(() => false)) {
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error('Success page indicators not found after signing');
  }
}

/**
 * Verify form data is preserved (useful after going back from review)
 */
export async function verifyFormPreserved(
  page: Page,
  expected: { destination?: string; amount?: string; memo?: string }
): Promise<void> {
  if (expected.destination) {
    const destInput = page.locator('input[placeholder="Enter destination address"]');
    await expect(destInput).toHaveValue(expected.destination);
  }

  if (expected.amount) {
    const amountInput = page.locator('input[name="quantity"]').first();
    await expect(amountInput).toHaveValue(expected.amount);
  }

  if (expected.memo) {
    const memoInput = page.locator('input[name="memo"], textarea[name="memo"]');
    if (await memoInput.isVisible().catch(() => false)) {
      await expect(memoInput).toHaveValue(expected.memo);
    }
  }
}

/**
 * Check if submit button is disabled (for validation tests)
 */
export async function isSubmitDisabled(page: Page): Promise<boolean> {
  const submitBtn = page.locator('button[type="submit"]:has-text("Continue")');
  return await submitBtn.isDisabled();
}

/**
 * Get error message text if visible
 */
export async function getErrorMessage(page: Page): Promise<string | null> {
  const errorLocator = page.locator('.text-red-500, [class*="error"]').first();
  if (await errorLocator.isVisible({ timeout: 2000 }).catch(() => false)) {
    return await errorLocator.textContent();
  }
  return null;
}

/**
 * Complete form validation test scenario
 */
export async function testFormValidation(
  page: Page,
  fillData: () => Promise<void>,
  expectedError?: string | RegExp
): Promise<void> {
  await fillData();
  await submitForm(page);

  if (expectedError) {
    const error = page.locator('.text-red-500, [class*="error"]').first();
    await expect(error).toBeVisible({ timeout: 5000 });
    if (typeof expectedError === 'string') {
      await expect(error).toContainText(expectedError);
    } else {
      const text = await error.textContent();
      expect(text).toMatch(expectedError);
    }
  }
}

/**
 * Complete the full flow: form → review → sign → success
 */
export async function completeFullFlow(
  page: Page,
  fillForm: () => Promise<void>
): Promise<void> {
  await fillForm();
  await submitForm(page);
  await waitForReview(page);
  await signAndBroadcast(page);
  await waitForSuccess(page);
}

/**
 * Test back navigation preserves form data
 */
export async function testBackNavigation(
  page: Page,
  fillForm: () => Promise<void>,
  expectedData: { destination?: string; amount?: string; memo?: string }
): Promise<void> {
  await fillForm();
  await submitForm(page);
  await waitForReview(page);
  await clickBack(page);
  await verifyFormPreserved(page, expectedData);
}
