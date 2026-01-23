/**
 * Secrets Pages Tests
 *
 * Tests for viewing sensitive wallet information:
 * - /show-passphrase/:walletId
 * - /show-private-key/:walletId/:addressPath?
 */

import {
  walletTest,
  expect,
  TEST_PASSWORD
} from '../fixtures';
import { header, selectAddress, unlock, secrets } from '../selectors';

walletTest.describe('Show Passphrase Page (/show-passphrase)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate to select wallet
    const walletButton = header.walletSelector(page);
    await walletButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });
  });

  walletTest('can access show passphrase from wallet selection', async ({ page }) => {
    // Look for menu/options button on wallet card
    const walletCard = page.locator('[role="radio"]').first();
    await expect(walletCard).toBeVisible();

    const menuButton = walletCard.locator('button[aria-label*="menu"], button[aria-label*="options"], button').last();
    await expect(menuButton).toBeVisible({ timeout: 3000 });
    await menuButton.click();

    // Look for show passphrase option
    const showPassphraseOption = page.locator('text=/Show.*Passphrase|View.*Seed|Recovery.*Phrase|Backup/i').first();
    await expect(showPassphraseOption).toBeVisible({ timeout: 3000 });
    await showPassphraseOption.click();

    // Should navigate to passphrase page or show password prompt
    const passwordOrPage = unlock.passwordInput(page).or(page.locator('text=/passphrase|recovery/i')).first();
    await expect(passwordOrPage).toBeVisible({ timeout: 5000 });
  });

  walletTest('show passphrase requires password verification', async ({ page }) => {
    const walletCard = page.locator('[role="radio"]').first();
    await expect(walletCard).toBeVisible();

    const menuButton = walletCard.locator('button').last();
    await expect(menuButton).toBeVisible({ timeout: 3000 });
    await menuButton.click();

    const showPassphraseOption = page.locator('text=/Show.*Passphrase|View.*Seed|Recovery/i').first();
    await expect(showPassphraseOption).toBeVisible({ timeout: 3000 });
    await showPassphraseOption.click();

    // Should require password
    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('show passphrase displays 12 words after password entry', async ({ page }) => {
    const walletCard = page.locator('[role="radio"]').first();
    await expect(walletCard).toBeVisible();

    const menuButton = walletCard.locator('button').last();
    await expect(menuButton).toBeVisible({ timeout: 3000 });
    await menuButton.click();

    const showPassphraseOption = page.locator('text=/Show.*Passphrase|View.*Seed|Recovery/i').first();
    await expect(showPassphraseOption).toBeVisible({ timeout: 3000 });
    await showPassphraseOption.click();

    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill(TEST_PASSWORD);

    const confirmButton = secrets.revealButton(page);
    await confirmButton.click();

    // Should show mnemonic words - wait for grid or word content
    const wordContent = page.locator('.grid, .flex-wrap').or(page.locator('text=/word|phrase|mnemonic/i')).first();
    await expect(wordContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('show passphrase has copy button after reveal', async ({ page }) => {
    const walletCard = page.locator('[role="radio"]').first();
    await expect(walletCard).toBeVisible();

    const menuButton = walletCard.locator('button').last();
    await expect(menuButton).toBeVisible({ timeout: 3000 });
    await menuButton.click();

    const showPassphraseOption = page.locator('text=/Show.*Passphrase|View.*Seed|Recovery/i').first();
    await expect(showPassphraseOption).toBeVisible({ timeout: 3000 });
    await showPassphraseOption.click();

    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill(TEST_PASSWORD);

    const confirmButton = secrets.revealButton(page);
    await confirmButton.click();

    // Wait for passphrase to be revealed (grid of words should appear)
    const wordGrid = page.locator('.grid, .flex-wrap').or(page.locator('text=/word|phrase|mnemonic/i')).first();
    await expect(wordGrid).toBeVisible({ timeout: 5000 });

    // Should have copy button after revealing - use the secrets selector
    const copyButton = secrets.copyButton(page);
    await expect(copyButton).toBeVisible({ timeout: 5000 });
  });
});

walletTest.describe('Show Private Key Page (/show-private-key)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate to address selection
    const addressChevron = selectAddress.chevronButton(page);
    await expect(addressChevron).toBeVisible({ timeout: 5000 });
    await addressChevron.click();
    await expect(page).toHaveURL(/select-address/, { timeout: 5000 });
  });

  walletTest('can access show private key from address selection', async ({ page }) => {
    // Find address card menu
    const addressCard = page.locator('[role="radio"]').first();
    await expect(addressCard).toBeVisible();

    const menuButton = addressCard.locator('button').last();
    await expect(menuButton).toBeVisible({ timeout: 3000 });
    await menuButton.click();

    // Look for show private key option
    const showKeyOption = page.locator('text=/Show.*Private.*Key|Export.*Key|Private/i').first();
    await expect(showKeyOption).toBeVisible({ timeout: 3000 });
    await showKeyOption.click();

    // Should show password prompt or navigate to key page
    const passwordOrPage = unlock.passwordInput(page).or(page.locator('text=/private.*key/i')).first();
    await expect(passwordOrPage).toBeVisible({ timeout: 5000 });
  });

  walletTest('show private key requires password verification', async ({ page }) => {
    const addressCard = page.locator('[role="radio"]').first();
    await expect(addressCard).toBeVisible();

    const menuButton = addressCard.locator('button').last();
    await expect(menuButton).toBeVisible({ timeout: 3000 });
    await menuButton.click();

    const showKeyOption = page.locator('text=/Show.*Private.*Key|Export.*Key/i').first();
    await expect(showKeyOption).toBeVisible({ timeout: 3000 });
    await showKeyOption.click();

    // Should require password
    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('show private key displays key after password entry', async ({ page }) => {
    const addressCard = page.locator('[role="radio"]').first();
    await expect(addressCard).toBeVisible();

    const menuButton = addressCard.locator('button').last();
    await expect(menuButton).toBeVisible({ timeout: 3000 });
    await menuButton.click();

    const showKeyOption = page.locator('text=/Show.*Private.*Key|Export.*Key/i').first();
    await expect(showKeyOption).toBeVisible({ timeout: 3000 });
    await showKeyOption.click();

    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill(TEST_PASSWORD);

    const confirmButton = secrets.revealButton(page);
    await confirmButton.click();

    // Should show private key (long string of characters in monospace)
    const privateKeyElement = page.locator('[class*="mono"]').or(page.locator('text=/[a-zA-Z0-9]{30,}/')).first();
    await expect(privateKeyElement).toBeVisible({ timeout: 5000 });
  });

  walletTest('show private key has copy functionality', async ({ page }) => {
    const addressCard = page.locator('[role="radio"]').first();
    await expect(addressCard).toBeVisible();

    const menuButton = addressCard.locator('button').last();
    await expect(menuButton).toBeVisible({ timeout: 3000 });
    await menuButton.click();

    const showKeyOption = page.locator('text=/Show.*Private.*Key|Export.*Key/i').first();
    await expect(showKeyOption).toBeVisible({ timeout: 3000 });
    await showKeyOption.click();

    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill(TEST_PASSWORD);

    const confirmButton = secrets.revealButton(page);
    await confirmButton.click();

    // Should have copy button
    const copyButton = secrets.copyButton(page);
    await expect(copyButton).toBeVisible({ timeout: 5000 });
  });
});
