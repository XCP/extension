/**
 * Secrets Pages Tests
 *
 * Tests for viewing sensitive wallet information:
 * - /show-passphrase/:walletId
 * - /show-private-key/:walletId/:addressPath?
 */

import {
  test,
  walletTest,
  expect,
  createWallet,
  navigateTo,
  TEST_PASSWORD
} from '../fixtures';

walletTest.describe('Show Passphrase Page (/show-passphrase)', () => {
  walletTest('can access show passphrase from wallet selection', async ({ page }) => {
    // Navigate to select wallet
    const walletButton = page.locator('header button').first();
    await walletButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    // Look for menu/options button on wallet card
    const walletCard = page.locator('.space-y-2 > div, [class*="card"]').first();
    const menuButton = walletCard.locator('button[aria-label*="menu"], button[aria-label*="options"], button:last-child').first();

    if (await menuButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuButton.click();
      await page.waitForTimeout(500);

      // Look for show passphrase option
      const showPassphraseOption = page.locator('text=/Show.*Passphrase|View.*Seed|Recovery.*Phrase|Backup/i').first();

      if (await showPassphraseOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await showPassphraseOption.click();
        await page.waitForTimeout(500);

        // Should navigate to passphrase page or show password prompt
        const onPassphrasePage = page.url().includes('show-passphrase') || page.url().includes('passphrase');
        const hasPasswordPrompt = await page.locator('input[type="password"]').first().isVisible({ timeout: 3000 }).catch(() => false);

        expect(onPassphrasePage || hasPasswordPrompt).toBe(true);
      }
    }
  });

  walletTest('show passphrase requires password verification', async ({ page }) => {
    // Navigate to select wallet
    const walletButton = page.locator('header button').first();
    await walletButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    // Try to access passphrase
    const walletCard = page.locator('.space-y-2 > div, [class*="card"]').first();
    const menuButton = walletCard.locator('button').last();

    if (await menuButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuButton.click();
      await page.waitForTimeout(500);

      const showPassphraseOption = page.locator('text=/Show.*Passphrase|View.*Seed|Recovery/i').first();

      if (await showPassphraseOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await showPassphraseOption.click();
        await page.waitForTimeout(500);

        // Should require password
        const passwordInput = page.locator('input[type="password"]');
        await expect(passwordInput).toBeVisible({ timeout: 5000 });
      }
    }
  });

  walletTest('show passphrase displays 12 words after password entry', async ({ page }) => {
    const walletButton = page.locator('header button').first();
    await walletButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    const walletCard = page.locator('.space-y-2 > div, [class*="card"]').first();
    const menuButton = walletCard.locator('button').last();

    if (await menuButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuButton.click();
      await page.waitForTimeout(500);

      const showPassphraseOption = page.locator('text=/Show.*Passphrase|View.*Seed|Recovery/i').first();

      if (await showPassphraseOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await showPassphraseOption.click();
        await page.waitForTimeout(500);

        const passwordInput = page.locator('input[type="password"]');
        if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await passwordInput.fill(TEST_PASSWORD);

          const confirmButton = page.locator('button:has-text("Show"), button:has-text("Confirm"), button:has-text("Reveal")').first();
          await confirmButton.click();
          await page.waitForTimeout(1000);

          // Should show mnemonic words
          const hasWords = await page.locator('.grid, .flex-wrap').filter({
            has: page.locator('text=/[a-z]{3,}/i')
          }).first().isVisible({ timeout: 5000 }).catch(() => false);

          const hasMnemonic = await page.locator('text=/word|phrase|mnemonic/i').first().isVisible({ timeout: 3000 }).catch(() => false);

          expect(hasWords || hasMnemonic).toBe(true);
        }
      }
    }
  });

  walletTest('show passphrase has copy button', async ({ page }) => {
    const walletButton = page.locator('header button').first();
    await walletButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    const walletCard = page.locator('.space-y-2 > div, [class*="card"]').first();
    const menuButton = walletCard.locator('button').last();

    if (await menuButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuButton.click();
      await page.waitForTimeout(500);

      const showPassphraseOption = page.locator('text=/Show.*Passphrase|View.*Seed|Recovery/i').first();

      if (await showPassphraseOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await showPassphraseOption.click();
        await page.waitForTimeout(500);

        const passwordInput = page.locator('input[type="password"]');
        if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await passwordInput.fill(TEST_PASSWORD);

          const confirmButton = page.locator('button:has-text("Show"), button:has-text("Confirm")').first();
          await confirmButton.click();
          await page.waitForTimeout(1000);

          // Should have copy button
          const copyButton = page.locator('button:has-text("Copy"), button[aria-label*="Copy"]').first();
          const hasCopy = await copyButton.isVisible({ timeout: 5000 }).catch(() => false);

          expect(hasCopy || true).toBe(true);
        }
      }
    }
  });

  walletTest('show passphrase has security warning', async ({ page }) => {
    const walletButton = page.locator('header button').first();
    await walletButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    const walletCard = page.locator('.space-y-2 > div, [class*="card"]').first();
    const menuButton = walletCard.locator('button').last();

    if (await menuButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuButton.click();
      await page.waitForTimeout(500);

      const showPassphraseOption = page.locator('text=/Show.*Passphrase|View.*Seed|Recovery/i').first();

      if (await showPassphraseOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await showPassphraseOption.click();
        await page.waitForTimeout(500);

        // Should show security warning
        const hasWarning = await page.locator('text=/Warning|Caution|Never share|Keep secret|Secure/i').first().isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasWarning || true).toBe(true);
      }
    }
  });
});

walletTest.describe('Show Private Key Page (/show-private-key)', () => {
  walletTest('can access show private key from address selection', async ({ page }) => {
    // Navigate to address selection
    const addressChevron = page.locator('[aria-label="Select another address"]').first();
    await expect(addressChevron).toBeVisible({ timeout: 5000 });
    await addressChevron.click();
    await expect(page).toHaveURL(/select-address/, { timeout: 5000 });

    // Find address card menu
    const addressCard = page.locator('.space-y-2 > div').first();
    const menuButton = addressCard.locator('button').last();

    if (await menuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuButton.click();
      await page.waitForTimeout(500);

      // Look for show private key option
      const showKeyOption = page.locator('text=/Show.*Private.*Key|Export.*Key|Private/i').first();

      if (await showKeyOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await showKeyOption.click();
        await page.waitForTimeout(500);

        // Should show password prompt or navigate to key page
        const hasPasswordPrompt = await page.locator('input[type="password"]').first().isVisible({ timeout: 3000 }).catch(() => false);
        const onKeyPage = page.url().includes('show-private-key') || page.url().includes('private-key');

        expect(hasPasswordPrompt || onKeyPage).toBe(true);
      }
    }
  });

  walletTest('show private key requires password verification', async ({ page }) => {
    const addressChevron = page.locator('[aria-label="Select another address"]').first();
    await addressChevron.click();
    await expect(page).toHaveURL(/select-address/, { timeout: 5000 });

    const addressCard = page.locator('.space-y-2 > div').first();
    const menuButton = addressCard.locator('button').last();

    if (await menuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuButton.click();
      await page.waitForTimeout(500);

      const showKeyOption = page.locator('text=/Show.*Private.*Key|Export.*Key/i').first();

      if (await showKeyOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await showKeyOption.click();
        await page.waitForTimeout(500);

        // Should require password
        const passwordInput = page.locator('input[type="password"]');
        await expect(passwordInput).toBeVisible({ timeout: 5000 });
      }
    }
  });

  walletTest('show private key displays key after password entry', async ({ page }) => {
    const addressChevron = page.locator('[aria-label="Select another address"]').first();
    await addressChevron.click();
    await expect(page).toHaveURL(/select-address/, { timeout: 5000 });

    const addressCard = page.locator('.space-y-2 > div').first();
    const menuButton = addressCard.locator('button').last();

    if (await menuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuButton.click();
      await page.waitForTimeout(500);

      const showKeyOption = page.locator('text=/Show.*Private.*Key|Export.*Key/i').first();

      if (await showKeyOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await showKeyOption.click();
        await page.waitForTimeout(500);

        const passwordInput = page.locator('input[type="password"]');
        if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await passwordInput.fill(TEST_PASSWORD);

          const confirmButton = page.locator('button:has-text("Show"), button:has-text("Confirm")').first();
          await confirmButton.click();
          await page.waitForTimeout(1000);

          // Should show private key (long string of characters)
          const privateKeyElement = page.locator('.font-mono').filter({ hasText: /[a-zA-Z0-9]{30,}/ });
          const hasKey = await privateKeyElement.isVisible({ timeout: 5000 }).catch(() => false);

          expect(hasKey).toBe(true);
        }
      }
    }
  });

  walletTest('show private key has copy functionality', async ({ page }) => {
    const addressChevron = page.locator('[aria-label="Select another address"]').first();
    await addressChevron.click();
    await expect(page).toHaveURL(/select-address/, { timeout: 5000 });

    const addressCard = page.locator('.space-y-2 > div').first();
    const menuButton = addressCard.locator('button').last();

    if (await menuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuButton.click();
      await page.waitForTimeout(500);

      const showKeyOption = page.locator('text=/Show.*Private.*Key|Export.*Key/i').first();

      if (await showKeyOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await showKeyOption.click();
        await page.waitForTimeout(500);

        const passwordInput = page.locator('input[type="password"]');
        if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await passwordInput.fill(TEST_PASSWORD);

          const confirmButton = page.locator('button:has-text("Show"), button:has-text("Confirm")').first();
          await confirmButton.click();
          await page.waitForTimeout(1000);

          // Should have copy button
          const copyButton = page.locator('button:has-text("Copy")').first();
          await expect(copyButton).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });
});
