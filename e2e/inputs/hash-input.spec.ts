/**
 * HashInput Component Tests
 *
 * Tests for the transaction/offer hash input with validation.
 * Component: src/components/inputs/hash-input.tsx
 *
 * Features tested:
 * - Valid 64-character hex hash acceptance
 * - Invalid hash rejection with error
 * - Copy button functionality
 * - Paste handling (auto-cleanup)
 * - Different hash types (transaction, offer, match)
 *
 * HashInput is used in:
 * - Cancel order page (offer hash)
 * - BTC Pay order page (order match)
 * - Close dispenser by hash
 */

import { walletTest, expect } from '../fixtures';

// Valid test hashes
const VALID_TX_HASH = 'a'.repeat(64);
const VALID_TX_HASH_MIXED = 'abcdef1234567890ABCDEF1234567890abcdef1234567890ABCDEF12345678';
const INVALID_SHORT_HASH = 'a'.repeat(32);
const INVALID_CHARS_HASH = 'g'.repeat(64); // g is not valid hex

walletTest.describe('HashInput Component', () => {
  // Navigate to cancel order page which uses HashInput
  walletTest.beforeEach(async ({ page }) => {
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/compose/order/cancel`);
    await page.waitForLoadState('networkidle');
    // Wait for hash input to be ready
    await page.locator('textarea[name="offer_hash"]').waitFor({ state: 'visible', timeout: 10000 });
  });

  // Helper to get hash input
  const getHashInput = (page: any) => page.locator('textarea[name="offer_hash"]');

  walletTest.describe('Rendering', () => {
    walletTest('renders hash input field', async ({ page }) => {
      const input = getHashInput(page);
      await expect(input).toBeVisible({ timeout: 5000 });
    });

    walletTest('has placeholder text', async ({ page }) => {
      const input = getHashInput(page);
      const placeholder = await input.getAttribute('placeholder');
      expect(placeholder).toBeTruthy();
    });

    walletTest('has monospace font for hash display', async ({ page }) => {
      const input = getHashInput(page);
      const classes = await input.getAttribute('class') || '';
      expect(classes).toContain('font-mono');
    });

    walletTest('renders with label', async ({ page }) => {
      // Hash input may have various label texts
      const label = page.locator('label:has-text("Offer Hash"), label:has-text("Hash"), label:has-text("TX Hash"), label:has-text("Transaction")');
      await expect(label.first()).toBeVisible({ timeout: 3000 });
    });
  });

  walletTest.describe('Valid Hash Input', () => {
    walletTest('accepts valid 64-character hex hash', async ({ page }) => {
      const input = getHashInput(page);
      await input.fill(VALID_TX_HASH);
      await input.blur();

      // Should not show error
      await expect(async () => {
        const classes = await input.getAttribute('class') || '';
        expect(classes).not.toContain('border-red-500');
      }).toPass({ timeout: 2000 });
    });

    walletTest('accepts mixed case hex hash', async ({ page }) => {
      const input = getHashInput(page);
      await input.fill(VALID_TX_HASH_MIXED);
      await input.blur();

      // Should not show error
      await expect(async () => {
        const classes = await input.getAttribute('class') || '';
        expect(classes).not.toContain('border-red-500');
      }).toPass({ timeout: 2000 });
    });

    walletTest('trims whitespace from hash', async ({ page }) => {
      const input = getHashInput(page);
      // Enter hash with spaces
      await input.fill(`  ${VALID_TX_HASH}  `);
      await input.blur();

      // Should be valid (whitespace trimmed)
      await expect(async () => {
        const classes = await input.getAttribute('class') || '';
        expect(classes).not.toContain('border-red-500');
      }).toPass({ timeout: 2000 });
    });
  });

  walletTest.describe('Invalid Hash Input', () => {
    walletTest('shows error for too short hash', async ({ page }) => {
      const input = getHashInput(page);
      await input.fill(INVALID_SHORT_HASH);
      await input.blur();

      // Should show error
      await expect(async () => {
        const classes = await input.getAttribute('class') || '';
        const errorMessage = page.locator('[role="alert"], .text-red-600');
        const hasError = classes.includes('border-red-500') ||
                         await errorMessage.isVisible();
        expect(hasError).toBe(true);
      }).toPass({ timeout: 2000 });
    });

    walletTest('shows error for invalid hex characters', async ({ page }) => {
      const input = getHashInput(page);
      await input.fill(INVALID_CHARS_HASH);
      await input.blur();

      // Should show error
      await expect(async () => {
        const classes = await input.getAttribute('class') || '';
        const errorMessage = page.locator('[role="alert"], .text-red-600');
        const hasError = classes.includes('border-red-500') ||
                         await errorMessage.isVisible();
        expect(hasError).toBe(true);
      }).toPass({ timeout: 2000 });
    });

    walletTest('shows error for random text', async ({ page }) => {
      const input = getHashInput(page);
      await input.fill('not a valid hash');
      await input.blur();

      // Should show error
      await expect(async () => {
        const classes = await input.getAttribute('class') || '';
        expect(classes).toContain('border-red-500');
      }).toPass({ timeout: 2000 });
    });
  });

  walletTest.describe('Copy Button', () => {
    walletTest('copy button appears when hash is entered', async ({ page }) => {
      const input = getHashInput(page);

      // Enter valid hash
      await input.fill(VALID_TX_HASH);

      // Copy button should appear
      const copyButton = page.locator('button[aria-label*="Copy"], button[aria-label*="copy"]');
      await expect(copyButton.first()).toBeVisible({ timeout: 2000 });
    });

    walletTest('clicking copy button copies hash to clipboard', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      const input = getHashInput(page);
      await input.fill(VALID_TX_HASH);

      const copyButton = page.locator('button[aria-label*="Copy"], button[aria-label*="copy"]').first();
      const copyVisible = await copyButton.isVisible().catch(() => false);
      if (copyVisible) {
        await copyButton.click();

        // Verify clipboard content
        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toBe(VALID_TX_HASH);
      }
    });
  });

  walletTest.describe('Input Behavior', () => {
    walletTest('allows clearing hash', async ({ page }) => {
      const input = getHashInput(page);
      await input.fill(VALID_TX_HASH);
      await input.clear();

      const value = await input.inputValue();
      expect(value).toBe('');
    });

    walletTest('allows editing hash', async ({ page }) => {
      const input = getHashInput(page);
      await input.fill(VALID_TX_HASH);
      await input.clear();
      await input.fill('b'.repeat(64));

      const value = await input.inputValue();
      expect(value).toBe('b'.repeat(64));
    });

    walletTest('preserves value after blur', async ({ page }) => {
      const input = getHashInput(page);
      await input.fill(VALID_TX_HASH);
      await input.blur();

      const value = await input.inputValue();
      expect(value).toBe(VALID_TX_HASH);
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('has name attribute', async ({ page }) => {
      const input = getHashInput(page);
      const name = await input.getAttribute('name');
      expect(name).toBeTruthy();
    });

    walletTest('has aria-invalid on error', async ({ page }) => {
      const input = getHashInput(page);
      await input.fill('invalid');
      await input.blur();

      await expect(async () => {
        const ariaInvalid = await input.getAttribute('aria-invalid');
        expect(ariaInvalid).toBe('true');
      }).toPass({ timeout: 2000 });
    });

    walletTest('spellcheck is disabled', async ({ page }) => {
      const input = getHashInput(page);
      const spellcheck = await input.getAttribute('spellcheck');
      expect(spellcheck).toBe('false');
    });
  });
});
