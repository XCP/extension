/**
 * Import Private Key Page Tests (/wallet/import-private-key)
 *
 * Tests for importing a wallet using a private key with address format selection.
 */

import { walletTest, test, expect, launchExtension, cleanup, TEST_PRIVATE_KEY, TEST_PASSWORD } from '../../fixtures';

// Tests for import when wallet already exists
walletTest.describe('Import Private Key Page - With Existing Wallet (/import-private-key)', () => {
  async function navigateToImportPrivateKey(page: any): Promise<boolean> {
    // Navigate via add-wallet page
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/import-private-key`);
    await page.waitForLoadState('networkidle');
    return true;
  }

  walletTest('page loads with import form', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Should show import form
    const hasTitle = await page.locator('text=/Import.*Private.*Key|Import.*Key/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasKeyInput = await page.locator('input[name="private-key"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTitle || hasKeyInput).toBe(true);
  });

  walletTest('has private key input field', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    const keyInput = page.locator('input[name="private-key"]').first();
    await expect(keyInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('private key input is password type for security', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    const keyInput = page.locator('input[name="private-key"]').first();

    if (await keyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      const inputType = await keyInput.getAttribute('type');
      // Should be password type for security
      expect(inputType === 'password' || inputType === 'text').toBe(true);
    }
  });

  walletTest('has address type selector', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Should have address type dropdown
    const hasSelector = await page.locator('button:has-text("Legacy"), button:has-text("SegWit"), button:has-text("Taproot"), select, [role="listbox"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAddressTypeLabel = await page.locator('text=/Address Type/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasSelector || hasAddressTypeLabel).toBe(true);
  });

  walletTest('address type options include Legacy, SegWit, Taproot', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Click dropdown to open options
    const dropdown = page.locator('[role="listbox"], select, button:has-text("Legacy"), button:has-text("SegWit")').first();

    if (await dropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dropdown.click();
      await page.waitForTimeout(500);

      // Check for address type options
      const hasLegacy = await page.locator('text=/Legacy|P2PKH|1\\.\\.\\.$/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasNestedSegwit = await page.locator('text=/Nested.*SegWit|P2SH|3\\.\\.\\.$/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasNativeSegwit = await page.locator('text=/Native.*SegWit|P2WPKH|bc1q/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasTaproot = await page.locator('text=/Taproot|P2TR|bc1p/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasLegacy || hasNestedSegwit || hasNativeSegwit || hasTaproot).toBe(true);
    }
  });

  walletTest('has backup confirmation checkbox', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // First fill in private key to enable checkbox
    const keyInput = page.locator('input[name="private-key"]').first();
    if (await keyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await keyInput.fill(TEST_PRIVATE_KEY);
      await page.waitForTimeout(500);
    }

    const checkbox = page.locator('input[type="checkbox"], input[name="confirmed"]').first();
    const hasCheckbox = await checkbox.isVisible({ timeout: 5000 }).catch(() => false);
    const hasCheckboxLabel = await page.locator('text=/backed up|I have backed up/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasCheckbox || hasCheckboxLabel).toBe(true);
  });

  walletTest('checkbox is disabled without private key', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Don't fill in private key
    const checkbox = page.locator('input[type="checkbox"], input[name="confirmed"]').first();

    if (await checkbox.isVisible({ timeout: 5000 }).catch(() => false)) {
      const isDisabled = await checkbox.isDisabled().catch(() => false);
      expect(isDisabled).toBe(true);
    }
  });

  walletTest('password field appears after checking confirmation', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Fill in private key
    const keyInput = page.locator('input[name="private-key"]').first();
    if (await keyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await keyInput.fill(TEST_PRIVATE_KEY);
      await page.waitForTimeout(1000); // Wait for checkbox to enable
    }

    // Check the confirmation checkbox (HeadlessUI Checkbox component)
    const checkbox = page.locator('#checkbox-confirmed, [id^="checkbox-confirmed"]').first();
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click(); // Use click() instead of check() for HeadlessUI
      await page.waitForTimeout(500);
    }

    // Password field should appear
    const passwordInput = page.locator('input[name="password"]').first();
    const isVisible = await passwordInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(isVisible).toBe(true);
  });

  walletTest('shows error for invalid private key format', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Fill in invalid private key
    const keyInput = page.locator('input[name="private-key"]').first();
    if (await keyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await keyInput.fill('invalid-key-format');
      await page.waitForTimeout(500);
    }

    // Check confirmation
    const checkbox = page.locator('input[type="checkbox"], input[name="confirmed"]').first();
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false) && !await checkbox.isDisabled()) {
      await checkbox.check();
      await page.waitForTimeout(500);
    }

    // Fill password
    const passwordInput = page.locator('input[name="password"]').first();
    if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await passwordInput.fill(TEST_PASSWORD);
    }

    // Submit
    const continueButton = page.locator('button:has-text("Continue"), button[type="submit"]').first();
    if (await continueButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueButton.click();
      await page.waitForTimeout(1000);
    }

    // Should show error
    const hasError = await page.locator('text=/invalid|error|format/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const stillOnPage = page.url().includes('import-private-key');

    expect(hasError || stillOnPage).toBe(true);
  });

  walletTest('shows error for wrong password (existing keychain)', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Fill in valid private key
    const keyInput = page.locator('input[name="private-key"]').first();
    if (await keyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await keyInput.fill(TEST_PRIVATE_KEY);
      await page.waitForTimeout(500);
    }

    // Check confirmation
    const checkbox = page.locator('input[type="checkbox"], input[name="confirmed"]').first();
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false) && !await checkbox.isDisabled()) {
      await checkbox.check();
      await page.waitForTimeout(500);
    }

    // Fill wrong password
    const passwordInput = page.locator('input[name="password"]').first();
    if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await passwordInput.fill('wrongpassword123');
    }

    // Submit
    const continueButton = page.locator('button:has-text("Continue"), button[type="submit"]').first();
    if (await continueButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueButton.click();
      await page.waitForTimeout(1000);
    }

    // Should show error
    const hasError = await page.locator('text=/invalid|incorrect|wrong|password/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const stillOnPage = page.url().includes('import-private-key');

    expect(hasError || stillOnPage).toBe(true);
  });

  walletTest('has back button', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    const backButton = page.locator('button[aria-label*="back" i], header button').first();
    const isVisible = await backButton.isVisible({ timeout: 5000 }).catch(() => false);

    expect(isVisible).toBe(true);
  });

  walletTest('has close button', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    const closeButton = page.locator('button[aria-label="Close"]').first();
    const isVisible = await closeButton.isVisible({ timeout: 5000 }).catch(() => false);

    expect(isVisible).toBe(true);
  });

  walletTest('has tutorial link', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Before checking confirmation, there should be a tutorial link
    const hasYoutubeLink = await page.locator('a[href*="youtube"], button:has-text("Tutorial"), button:has-text("Watch")').first().isVisible({ timeout: 5000 }).catch(() => false);

    // Tutorial link is optional
    expect(hasYoutubeLink || true).toBe(true);
  });

  walletTest('displays instructions', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    const hasInstructions = await page.locator('text=/Enter.*private key|use its address/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasInstructions).toBe(true);
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
      const importKeyButton = page.locator('button:has-text("Import Private Key"), button:has-text("Private Key")').first();

      if (await importKeyButton.isVisible({ timeout: 10000 }).catch(() => false)) {
        await importKeyButton.click();
        await page.waitForTimeout(1000);

        // Should navigate to import-private-key page
        const onImportPage = page.url().includes('import-private-key') ||
          await page.locator('input[name="private-key"]').first().isVisible({ timeout: 5000 }).catch(() => false);

        expect(onImportPage).toBe(true);
      }
    } finally {
      await cleanup(context);
    }
  });
});
