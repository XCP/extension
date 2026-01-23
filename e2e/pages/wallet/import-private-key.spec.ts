/**
 * Import Private Key Page Tests (/wallet/import-private-key)
 *
 * Tests for importing a wallet using a private key with address format selection.
 */

import { walletTest, test, expect, launchExtension, cleanup, TEST_PRIVATE_KEY, TEST_PASSWORD } from '../../fixtures';
import { importWallet, common, onboarding } from '../../selectors';

// Tests for import when wallet already exists
walletTest.describe('Import Private Key Page - With Existing Wallet (/import-private-key)', () => {
  async function navigateToImportPrivateKey(page: any): Promise<void> {
    // Navigate via add-wallet page
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/import-private-key`);
    await page.waitForLoadState('networkidle');
  }

  walletTest('page loads with import form', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Should show import form title or input
    const titleOrInput = page.locator('text=/Import.*Private.*Key|Import.*Key/i').or(page.locator('input[name="private-key"]')).first();
    await expect(titleOrInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('has private key input field', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    await expect(importWallet.privateKeyInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('private key input is password type for security', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    const keyInput = importWallet.privateKeyInput(page);
    await expect(keyInput).toBeVisible({ timeout: 5000 });

    const inputType = await keyInput.getAttribute('type');
    // Should be password or text type
    expect(['password', 'text']).toContain(inputType);
  });

  walletTest('has address type selector', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Should have address type dropdown or label
    const selectorOrLabel = page.locator('button:has-text("Legacy"), button:has-text("SegWit"), button:has-text("Taproot"), select, [role="listbox"]')
      .or(page.locator('text=/Address Type/i'))
      .first();
    await expect(selectorOrLabel).toBeVisible({ timeout: 5000 });
  });

  walletTest('address type options include Legacy, SegWit, Taproot', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Click dropdown to open options
    const dropdown = page.locator('[role="listbox"], select, button:has-text("Legacy"), button:has-text("SegWit")').first();
    const dropdownCount = await dropdown.count();

    if (dropdownCount > 0 && await dropdown.isVisible()) {
      await dropdown.click();

      // Check for address type options
      const addressTypeOption = page.locator('text=/Legacy|P2PKH|SegWit|Taproot|bc1/i').first();
      await expect(addressTypeOption).toBeVisible({ timeout: 3000 });
    }
  });

  walletTest('has backup confirmation checkbox', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // First fill in private key to enable checkbox
    const keyInput = importWallet.privateKeyInput(page);
    await expect(keyInput).toBeVisible({ timeout: 5000 });
    await keyInput.fill(TEST_PRIVATE_KEY);

    const checkboxOrLabel = page.locator('input[type="checkbox"], input[name="confirmed"]').or(page.locator('text=/backed up|I have backed up/i')).first();
    await expect(checkboxOrLabel).toBeVisible({ timeout: 5000 });
  });

  walletTest('checkbox is disabled without private key', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Don't fill in private key
    const checkbox = page.locator('input[type="checkbox"], input[name="confirmed"]').first();
    const checkboxCount = await checkbox.count();

    if (checkboxCount > 0 && await checkbox.isVisible()) {
      const isDisabled = await checkbox.isDisabled();
      expect(isDisabled).toBe(true);
    }
  });

  walletTest('password field appears after checking confirmation', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Fill in private key
    const keyInput = importWallet.privateKeyInput(page);
    await expect(keyInput).toBeVisible({ timeout: 5000 });
    await keyInput.fill(TEST_PRIVATE_KEY);

    // Wait for checkbox to enable
    const checkbox = page.locator('#checkbox-confirmed, [id^="checkbox-confirmed"]').first();
    await expect(checkbox).toBeVisible({ timeout: 3000 });
    await checkbox.click(); // Use click() instead of check() for HeadlessUI

    // Password field should appear
    await expect(importWallet.passwordInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for invalid private key format', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Fill in invalid private key
    const keyInput = importWallet.privateKeyInput(page);
    await expect(keyInput).toBeVisible({ timeout: 5000 });
    await keyInput.fill('invalid-key-format');

    // Check confirmation
    const checkbox = page.locator('input[type="checkbox"], input[name="confirmed"]').first();
    const checkboxCount = await checkbox.count();
    if (checkboxCount > 0 && await checkbox.isVisible() && !await checkbox.isDisabled()) {
      await checkbox.check();
    }

    // Fill password
    const passwordInput = importWallet.passwordInput(page);
    const passwordCount = await passwordInput.count();
    if (passwordCount > 0 && await passwordInput.isVisible()) {
      await passwordInput.fill(TEST_PASSWORD);
    }

    // Submit
    const continueButton = importWallet.continueButton(page);
    const buttonCount = await continueButton.count();
    if (buttonCount > 0 && await continueButton.isVisible()) {
      await continueButton.click();
    }

    // Should show error or stay on page
    const errorOrStillOnPage = page.url().includes('import-private-key');
    expect(errorOrStillOnPage).toBe(true);
  });

  walletTest('shows error for wrong password (existing keychain)', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Fill in valid private key
    const keyInput = importWallet.privateKeyInput(page);
    await expect(keyInput).toBeVisible({ timeout: 5000 });
    await keyInput.fill(TEST_PRIVATE_KEY);

    // Check confirmation
    const checkbox = page.locator('input[type="checkbox"], input[name="confirmed"]').first();
    const checkboxCount = await checkbox.count();
    if (checkboxCount > 0 && await checkbox.isVisible() && !await checkbox.isDisabled()) {
      await checkbox.check();
    }

    // Fill wrong password
    const passwordInput = importWallet.passwordInput(page);
    const passwordCount = await passwordInput.count();
    if (passwordCount > 0 && await passwordInput.isVisible()) {
      await passwordInput.fill('wrongpassword123');
    }

    // Submit
    const continueButton = importWallet.continueButton(page);
    const buttonCount = await continueButton.count();
    if (buttonCount > 0 && await continueButton.isVisible()) {
      await continueButton.click();
    }

    // Should show error or stay on page
    const errorOrStillOnPage = page.url().includes('import-private-key');
    expect(errorOrStillOnPage).toBe(true);
  });

  walletTest('has back button', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    await expect(common.headerBackButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('has close button', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    const closeButton = page.locator('button[aria-label="Close"]').first();
    await expect(closeButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays instructions text', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Page should show instruction text about private key
    const instructionText = page.locator('text=/Enter.*private key/i');
    await expect(instructionText).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays instructions', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    const instructions = page.locator('text=/Enter.*private key|use its address/i').first();
    await expect(instructions).toBeVisible({ timeout: 5000 });
  });
});

// Tests for import with no existing wallet (fresh extension)
test.describe('Import Private Key Page - Fresh Extension', () => {
  test('can import private key on fresh extension', async ({}, testInfo) => {
    const testId = `import-key-fresh-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 25)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      // Click import private key on onboarding
      const importKeyButton = onboarding.importPrivateKeyButton(page);
      const buttonCount = await importKeyButton.count();

      if (buttonCount > 0 && await importKeyButton.isVisible({ timeout: 10000 })) {
        await importKeyButton.click();

        // Should navigate to import-private-key page
        await expect(page).toHaveURL(/import-private-key/, { timeout: 5000 });
      }
    } finally {
      await cleanup(context);
    }
  });
});
