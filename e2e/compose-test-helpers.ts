/**
 * Compose Flow Test Helpers
 *
 * Helper functions for testing compose form → review flows.
 * E2E tests stop at the review page - signing and broadcast are covered by unit tests.
 */

import { Page, expect } from '@playwright/test';
import { TEST_ADDRESSES } from './test-data';

/**
 * Enable compose API mocking for E2E tests.
 * Mocks compose API endpoints to return mock transaction data for review page testing.
 *
 * @param page - Playwright page instance
 */
export async function enableValidationBypass(page: Page): Promise<void> {
  const context = page.context();

  // Mock compose response - provides data for review page display
  const mockComposeResponse = {
    result: {
      rawtransaction: '0200000001abcdef', // Not used for signing in E2E
      btc_in: 174891,
      btc_out: 10000,
      btc_change: 164222,
      btc_fee: 669,
      data: null,
      lock_scripts: ['76a9142adc44262632a30eace56056d6435781c75cc83188ac'],
      inputs_values: [174891],
      signed_tx_estimated_size: {
        vsize: 223,
        adjusted_vsize: 223,
        sigops_count: 4,
      },
      psbt: 'cHNidP8BAHQCAAAAAUzdtsQaz89A3nUAm0nbSAQJOLqnxr486itx4OsSnEpjAQAAAAD/////AhAnAAAAAAAAFgAU6N8BjH4ybMJT+qx+Rs3FHmhULEJ+gQIAAAAAABl2qRQq3EQmJjKjDqzlYFbWQ1eBx1zIMYisAAAAAAAAAAA=',
      params: {
        source: '14udFRS6AdnQNJZn9RZ1H3LtSqP7k2UeTC',
        destination: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
        asset: 'BTC',
        quantity: 10000,
        memo: null,
        memo_is_hex: false,
        use_enhanced_send: true,
        no_dispense: false,
        skip_validation: false,
        asset_info: { divisible: true, asset_longname: null },
        quantity_normalized: '0.00010000',
      },
      name: 'send',
    },
  };

  // Single unified route handler for all Counterparty API requests
  await context.route('**/api.counterparty.io**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    console.log(`[E2E Debug] ${method} ${url}`);

    // Handle compose endpoints - return mock transaction data
    if (url.includes('/compose/')) {
      // Parse compose type and params from URL
      const composeTypeMatch = url.match(/\/compose\/([^/?]+)/);
      const composeType = composeTypeMatch ? composeTypeMatch[1] : 'send';

      // Parse URL query params
      const urlParams = new URL(url).searchParams;
      const assetName = urlParams.get('asset') || 'BTC';
      const quantity = urlParams.get('quantity') || '10000';
      const destination = urlParams.get('destination') || mockComposeResponse.result.params.destination;

      console.log(`[E2E Mock] Intercepting compose/${composeType} request for asset: ${assetName}`);

      // Build params based on compose type
      let responseParams: Record<string, unknown> = {
        ...mockComposeResponse.result.params,
        asset: assetName,
        quantity: parseInt(quantity, 10),
        destination: destination,
      };

      // Handle broadcast-specific params
      if (composeType === 'broadcast') {
        const text = urlParams.get('text') || '';
        const value = urlParams.get('value') || '0';
        const feeFraction = urlParams.get('fee_fraction') || '0';
        const timestamp = urlParams.get('timestamp') || Math.floor(Date.now() / 1000).toString();

        responseParams = {
          source: mockComposeResponse.result.params.source,
          text: text,
          value: parseFloat(value),
          fee_fraction: parseFloat(feeFraction),
          timestamp: parseInt(timestamp, 10),
        };
        console.log(`[E2E Mock] Broadcast text: "${text}"`);
      }

      // Handle order-specific params
      if (composeType === 'order') {
        const giveAsset = urlParams.get('give_asset') || 'BTC';
        const giveQuantity = urlParams.get('give_quantity') || '100000';
        const getAsset = urlParams.get('get_asset') || 'XCP';
        const getQuantity = urlParams.get('get_quantity') || '1000000';
        const expiration = urlParams.get('expiration') || '8064';

        responseParams = {
          source: mockComposeResponse.result.params.source,
          give_asset: giveAsset,
          give_quantity: parseInt(giveQuantity, 10),
          get_asset: getAsset,
          get_quantity: parseInt(getQuantity, 10),
          expiration: parseInt(expiration, 10),
          fee_required: 0,
        };
        console.log(`[E2E Mock] Order: ${giveQuantity} ${giveAsset} for ${getQuantity} ${getAsset}`);
      }

      // Build dynamic response with params from request
      const dynamicResponse = {
        ...mockComposeResponse,
        result: {
          ...mockComposeResponse.result,
          params: responseParams,
          name: composeType,
        },
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(dynamicResponse),
      });
      return;
    }

    // Handle asset details endpoints
    if (url.includes('/v2/assets/')) {
      const assetMatch = url.match(/\/v2\/assets\/([^/?]+)/);
      const assetName = assetMatch ? decodeURIComponent(assetMatch[1]) : 'UNKNOWN';

      // Return proper details for known assets (needed for order forms, etc.)
      const knownAssets: Record<string, { divisible: boolean; supply: number; locked: boolean }> = {
        XCP: { divisible: true, supply: 2648755823622677, locked: true },
        BTC: { divisible: true, supply: 0, locked: true },
        PEPECASH: { divisible: true, supply: 1000000000000000, locked: true },
        // TESTUNLOCKED is an unlocked asset for testing issue-supply and lock-supply
        TESTUNLOCKED: { divisible: true, supply: 100000000000, locked: false },
      };

      if (knownAssets[assetName]) {
        console.log(`[E2E Mock] Asset details for ${assetName} - returning mock data (locked: ${knownAssets[assetName].locked})`);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: {
              asset: assetName,
              asset_longname: null,
              description: `Mock ${assetName} asset`,
              divisible: knownAssets[assetName].divisible,
              locked: knownAssets[assetName].locked,
              supply: knownAssets[assetName].supply,
              issuer: '1TestIssuer123456789abcdefgh',
            },
          }),
        });
        return;
      }

      // Unknown assets return 404 (available for issuance)
      console.log(`[E2E Mock] Asset details for ${assetName} - returning 404 (not found = available)`);
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Asset not found' }),
      });
      return;
    }

    // Handle balance endpoints - return mock balance
    // API returns PaginatedResponse<TokenBalance> with result as an array
    if (url.includes('/balances/')) {
      const assetMatch = url.match(/\/balances\/([^/?]+)/);
      const assetName = assetMatch ? decodeURIComponent(assetMatch[1]) : 'UNKNOWN';
      console.log(`[E2E Mock] Balance for ${assetName} - returning mock balance`);

      // Return a mock balance as array (API returns paginated response)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: [{
            asset: assetName,
            quantity: assetName === 'BTC' ? 1000000 : 100000000000, // 0.01 BTC or 1000 units
            quantity_normalized: assetName === 'BTC' ? '0.01000000' : '1000.00000000',
            asset_info: {
              asset_longname: null,
              description: `Mock ${assetName} asset`,
              issuer: '1TestIssuer123456789abcdefgh',
              divisible: true,
              locked: true,
            },
          }],
          result_count: 1,
        }),
      });
      return;
    }

    // All other requests pass through to real API
    await route.continue();
  });
}

/**
 * Enable dry run mode - kept for backward compatibility but no longer needed.
 * E2E tests now stop at review page rather than testing signing/broadcast.
 * @deprecated No longer needed - tests stop at review page
 */
export async function enableDryRun(_page: Page): Promise<void> {
  // No-op - tests now stop at review page
}

/**
 * Navigate to a compose page
 */
export async function goToCompose(page: Page, path: string): Promise<void> {
  const currentUrl = page.url();
  const hashIndex = currentUrl.indexOf('#');
  if (hashIndex === -1) {
    throw new Error('goToCompose must be called from an extension page');
  }

  const baseUrl = currentUrl.substring(0, hashIndex);
  const targetUrl = `${baseUrl}#/compose/${path}`;

  await page.goto(targetUrl);
  await page.waitForLoadState('networkidle');
  // Wait for form elements to be ready
  await page.locator('input, textarea, button').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
}

/**
 * Fill the destination input with a valid address
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
    const memoCount = await memoInput.count();
    if (memoCount > 0) {
      await memoInput.first().fill(options.memo);
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
  // Combined locator that matches any review page indicator
  const reviewIndicator = page.locator('text=/Review Transaction|Confirm Transaction|Review/i')
    .or(page.locator('text=Sign & Broadcast'))
    .or(page.locator('button:has-text("Sign"), button:has-text("Broadcast")'))
    .first();

  await expect(reviewIndicator).toBeVisible({ timeout: 10000 });
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
    const memoCount = await memoInput.count();
    if (memoCount > 0 && await memoInput.first().isVisible()) {
      await expect(memoInput.first()).toHaveValue(expected.memo);
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
  // Prefer role="alert" for accessibility, fall back to error styling classes
  const errorLocator = page.locator('[role="alert"], .text-red-500, [class*="error"]').first();
  const count = await errorLocator.count();
  if (count > 0 && await errorLocator.isVisible()) {
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
    // Prefer role="alert" for accessibility, fall back to error styling classes
    const error = page.locator('[role="alert"], .text-red-500, [class*="error"]').first();
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
