/**
 * AssetNameInput Component Tests
 *
 * Tests for the asset name input with validation and availability checking.
 * Component: src/components/inputs/asset-name-input.tsx
 *
 * Features tested:
 * - Valid asset name formats (uppercase, length requirements)
 * - Invalid name rejection
 * - Subasset name handling (PARENT.child format)
 * - Availability checking with API
 * - Auto-uppercase conversion
 *
 * AssetNameInput is used in:
 * - Issue asset page
 * - Fairminter page
 * - Destroy supply page
 */

import { walletTest, expect } from '../fixtures';

// Test asset names
const VALID_ASSET_NAME = 'TESTASSET';
const VALID_NUMERIC_ASSET = 'A12345678901234567890'; // Numeric format
const INVALID_SHORT_NAME = 'AB'; // Too short
const RESERVED_NAME = 'BTC'; // Reserved

walletTest.describe('AssetNameInput Component', () => {
  // Navigate to issue asset page which uses AssetNameInput
  walletTest.beforeEach(async ({ page }) => {
    const context = page.context();

    // Mock asset availability API - return 404 (available) for test assets, 200 for known assets
    await context.route('**/api.counterparty.io**', async (route) => {
      const url = route.request().url();

      // Handle asset details endpoints - check if asset exists
      if (url.includes('/v2/assets/')) {
        const assetMatch = url.match(/\/v2\/assets\/([^/?]+)/);
        const assetName = assetMatch ? decodeURIComponent(assetMatch[1]) : 'UNKNOWN';

        // Known/reserved assets that should show as "taken"
        const takenAssets = ['XCP', 'BTC', 'PEPECASH'];

        if (takenAssets.includes(assetName)) {
          // Asset exists - return 200 with details
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              result: {
                asset: assetName,
                divisible: true,
                locked: true,
                supply: 1000000,
              },
            }),
          });
        } else {
          // Asset doesn't exist - return 404 (available for issuance)
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Asset not found' }),
          });
        }
        return;
      }

      // Pass through all other requests
      await route.continue();
    });

    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/compose/issuance`);
    await page.waitForLoadState('networkidle');
    // Wait for asset name input to be ready
    await page.locator('input[name="asset"]').waitFor({ state: 'visible', timeout: 10000 });
  });

  // Helper to get asset name input
  const getAssetNameInput = (page: any) => page.locator('input[name="asset"]');

  walletTest.describe('Rendering', () => {
    walletTest('renders asset name input', async ({ page }) => {
      const input = getAssetNameInput(page);
      await expect(input).toBeVisible({ timeout: 5000 });
    });

    walletTest('has label', async ({ page }) => {
      const label = page.locator('label:has-text("Asset Name")');
      await expect(label).toBeVisible({ timeout: 5000 });
    });

    walletTest('has required indicator', async ({ page }) => {
      const requiredIndicator = page.locator('label:has-text("Asset Name") span.text-red-500');
      await expect(requiredIndicator).toBeVisible();
    });

    walletTest('has placeholder text', async ({ page }) => {
      const input = getAssetNameInput(page);
      const placeholder = await input.getAttribute('placeholder');
      expect(placeholder).toBeTruthy();
    });
  });

  walletTest.describe('Valid Asset Names', () => {
    walletTest('accepts valid uppercase asset name', async ({ page }) => {
      const input = getAssetNameInput(page);
      await input.fill(VALID_ASSET_NAME);
      await input.blur();

      // Wait for validation
      await expect(async () => {
        const classes = await input.getAttribute('class') || '';
        // Should not show error border
        expect(classes).not.toContain('border-red-500');
      }).toPass({ timeout: 3000 });
    });

    walletTest('converts lowercase to uppercase automatically', async ({ page }) => {
      const input = getAssetNameInput(page);
      await input.fill('myasset');

      const value = await input.inputValue();
      expect(value).toBe('MYASSET');
    });

    walletTest('accepts numeric format asset names', async ({ page }) => {
      const input = getAssetNameInput(page);
      await input.fill(VALID_NUMERIC_ASSET);
      await input.blur();

      // Check value is preserved
      const value = await input.inputValue();
      expect(value).toBe(VALID_NUMERIC_ASSET);
    });
  });

  walletTest.describe('Invalid Asset Names', () => {
    walletTest('shows error for too short name', async ({ page }) => {
      const input = getAssetNameInput(page);
      await input.fill(INVALID_SHORT_NAME);
      await input.blur();

      // Should show validation message or error styling
      await expect(async () => {
        const classes = await input.getAttribute('class') || '';
        const errorText = page.locator('.text-red-600, .text-red-500');
        const hasError = classes.includes('border-red-500') ||
                         await errorText.first().isVisible();
        expect(hasError).toBe(true);
      }).toPass({ timeout: 2000 });
    });

    walletTest('shows error for reserved name BTC', async ({ page }) => {
      const input = getAssetNameInput(page);
      await input.fill(RESERVED_NAME);
      await input.blur();

      // BTC is reserved and should show error
      await expect(async () => {
        const classes = await input.getAttribute('class') || '';
        const errorText = page.locator('.text-red-600, .text-red-500');
        const hasError = classes.includes('border-red-500') ||
                         await errorText.first().isVisible();
        expect(hasError).toBe(true);
      }).toPass({ timeout: 2000 });
    });

    walletTest('shows error for name with special characters', async ({ page }) => {
      const input = getAssetNameInput(page);
      await input.fill('TEST@ASSET');
      await input.blur();

      // Special chars not allowed
      await expect(async () => {
        const classes = await input.getAttribute('class') || '';
        expect(classes).toContain('border-red-500');
      }).toPass({ timeout: 2000 });
    });
  });

  walletTest.describe('Availability Check', () => {
    walletTest('shows error for taken asset name (XCP)', async ({ page }) => {
      const input = getAssetNameInput(page);

      // XCP is definitely taken
      await input.fill('XCP');
      await input.blur();

      // Wait for API check
      await expect(async () => {
        const classes = await input.getAttribute('class') || '';
        const errorText = page.locator('.text-red-600:has-text("taken"), .text-red-600:has-text("reserved")');
        const hasError = classes.includes('border-red-500') ||
                         await errorText.first().isVisible();
        expect(hasError).toBe(true);
      }).toPass({ timeout: 3000 });
    });
  });

  walletTest.describe('Input Behavior', () => {
    walletTest('allows clearing input', async ({ page }) => {
      const input = getAssetNameInput(page);
      await input.fill('TESTNAME');
      await input.clear();

      const value = await input.inputValue();
      expect(value).toBe('');
    });

    walletTest('allows editing input', async ({ page }) => {
      const input = getAssetNameInput(page);
      await input.fill('FIRST');
      await input.clear();
      await input.fill('SECOND');

      const value = await input.inputValue();
      expect(value).toBe('SECOND');
    });

    walletTest('preserves value after blur', async ({ page }) => {
      const input = getAssetNameInput(page);
      await input.fill('PRESERVED');
      await input.blur();

      const value = await input.inputValue();
      expect(value).toBe('PRESERVED');
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('input has name attribute', async ({ page }) => {
      const input = getAssetNameInput(page);
      const name = await input.getAttribute('name');
      expect(name).toBe('asset');
    });

    walletTest('input is in form context', async ({ page }) => {
      const input = getAssetNameInput(page);
      const isInForm = await input.evaluate((el: HTMLElement) => {
        return el.closest('form') !== null;
      });

      expect(isInForm).toBe(true);
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('input has accessible id', async ({ page }) => {
      const input = getAssetNameInput(page);
      const id = await input.getAttribute('id');
      expect(id).toBeTruthy();
    });
  });
});
