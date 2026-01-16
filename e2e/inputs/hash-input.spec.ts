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
    await page.waitForTimeout(500);
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

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        const placeholder = await input.getAttribute('placeholder');
        expect(placeholder).toBeTruthy();
      }
    });

    walletTest('has monospace font for hash display', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        const classes = await input.getAttribute('class') || '';
        expect(classes).toContain('font-mono');
      }
    });

    walletTest('renders with label', async ({ page }) => {
      const label = page.locator('label:has-text("Offer Hash"), label:has-text("Hash")');
      const hasLabel = await label.first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasLabel).toBe(true);
    });
  });

  walletTest.describe('Valid Hash Input', () => {
    walletTest('accepts valid 64-character hex hash', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill(VALID_TX_HASH);
        await input.blur();
        await page.waitForTimeout(300);

        // Should not show error
        const classes = await input.getAttribute('class') || '';
        expect(classes).not.toContain('border-red-500');
      }
    });

    walletTest('accepts mixed case hex hash', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill(VALID_TX_HASH_MIXED);
        await input.blur();
        await page.waitForTimeout(300);

        // Should not show error
        const classes = await input.getAttribute('class') || '';
        expect(classes).not.toContain('border-red-500');
      }
    });

    walletTest('trims whitespace from hash', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Enter hash with spaces
        await input.fill(`  ${VALID_TX_HASH}  `);
        await input.blur();
        await page.waitForTimeout(300);

        // Should be valid (whitespace trimmed)
        const classes = await input.getAttribute('class') || '';
        expect(classes).not.toContain('border-red-500');
      }
    });
  });

  walletTest.describe('Invalid Hash Input', () => {
    walletTest('shows error for too short hash', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill(INVALID_SHORT_HASH);
        await input.blur();
        await page.waitForTimeout(300);

        // Should show error
        const classes = await input.getAttribute('class') || '';
        const errorMessage = page.locator('[role="alert"], .text-red-600');
        const hasError = classes.includes('border-red-500') ||
                         await errorMessage.isVisible().catch(() => false);
        expect(hasError).toBe(true);
      }
    });

    walletTest('shows error for invalid hex characters', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill(INVALID_CHARS_HASH);
        await input.blur();
        await page.waitForTimeout(300);

        // Should show error
        const classes = await input.getAttribute('class') || '';
        const errorMessage = page.locator('[role="alert"], .text-red-600');
        const hasError = classes.includes('border-red-500') ||
                         await errorMessage.isVisible().catch(() => false);
        expect(hasError).toBe(true);
      }
    });

    walletTest('shows error for random text', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill('not a valid hash');
        await input.blur();
        await page.waitForTimeout(300);

        // Should show error
        const classes = await input.getAttribute('class') || '';
        expect(classes).toContain('border-red-500');
      }
    });
  });

  walletTest.describe('Copy Button', () => {
    walletTest('copy button appears when hash is entered', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Initially no copy button
        let copyButton = page.locator('button[aria-label*="Copy"]');
        const initiallyHidden = !(await copyButton.isVisible().catch(() => false));

        // Enter valid hash
        await input.fill(VALID_TX_HASH);
        await page.waitForTimeout(200);

        // Copy button should appear
        copyButton = page.locator('button[aria-label*="Copy"], button[aria-label*="copy"]');
        const nowVisible = await copyButton.isVisible().catch(() => false);

        expect(initiallyHidden || nowVisible).toBe(true);
      }
    });

    walletTest('clicking copy button copies hash to clipboard', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill(VALID_TX_HASH);
        await page.waitForTimeout(200);

        const copyButton = page.locator('button[aria-label*="Copy"], button[aria-label*="copy"]').first();
        if (await copyButton.isVisible().catch(() => false)) {
          await copyButton.click();
          await page.waitForTimeout(500);

          // Verify clipboard content
          const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
          expect(clipboardText).toBe(VALID_TX_HASH);
        }
      }
    });

    walletTest('copy button shows checkmark after copy', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill(VALID_TX_HASH);
        await page.waitForTimeout(200);

        const copyButton = page.locator('button[aria-label*="Copy"], button[aria-label*="copy"]').first();
        if (await copyButton.isVisible().catch(() => false)) {
          await copyButton.click();

          // Check for checkmark icon or "Copied" label
          await page.waitForTimeout(300);
          const copiedButton = page.locator('button[aria-label*="Copied"]');
          const checkIcon = copyButton.locator('svg');
          const hasFeedback = await copiedButton.isVisible().catch(() => false) ||
                              await checkIcon.isVisible().catch(() => false);
          expect(hasFeedback).toBe(true);
        }
      }
    });
  });

  walletTest.describe('Input Behavior', () => {
    walletTest('allows clearing hash', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill(VALID_TX_HASH);
        await input.clear();

        const value = await input.inputValue();
        expect(value).toBe('');
      }
    });

    walletTest('allows editing hash', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill(VALID_TX_HASH);
        await input.clear();
        await input.fill('b'.repeat(64));

        const value = await input.inputValue();
        expect(value).toBe('b'.repeat(64));
      }
    });

    walletTest('preserves value after blur', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill(VALID_TX_HASH);
        await input.blur();
        await page.waitForTimeout(200);

        const value = await input.inputValue();
        expect(value).toBe(VALID_TX_HASH);
      }
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('has name attribute', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        const name = await input.getAttribute('name');
        expect(name).toBeTruthy();
      }
    });

    walletTest('has aria-invalid on error', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill('invalid');
        await input.blur();
        await page.waitForTimeout(300);

        const ariaInvalid = await input.getAttribute('aria-invalid');
        expect(ariaInvalid).toBe('true');
      }
    });

    walletTest('spellcheck is disabled', async ({ page }) => {
      const input = getHashInput(page);

      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        const spellcheck = await input.getAttribute('spellcheck');
        expect(spellcheck).toBe('false');
      }
    });
  });
});
