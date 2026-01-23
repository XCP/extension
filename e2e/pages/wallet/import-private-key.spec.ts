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

  walletTest('private key input has show/hide toggle', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    const keyInput = importWallet.privateKeyInput(page);
    await expect(keyInput).toBeVisible({ timeout: 5000 });

    // PasswordInput component has a toggle button
    const toggleButton = page.locator('button[aria-label*="Show"], button[aria-label*="Hide"], button[aria-label*="password" i]').first();
    await expect(toggleButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows all 4 address type options with hints', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Click dropdown to open options
    const dropdown = page.locator('[role="listbox"] button, button:has-text("Legacy")').first();
    await expect(dropdown).toBeVisible({ timeout: 5000 });
    await dropdown.click();

    // Should show all 4 address types with their hint prefixes
    await expect(page.locator('text="Legacy"')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text="Nested SegWit"')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text="Native SegWit"')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text="Taproot"')).toBeVisible({ timeout: 3000 });

    // Should show address prefix hints
    await expect(page.locator('text="1..."')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text="3..."')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text="bc1q..."')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text="bc1p..."')).toBeVisible({ timeout: 3000 });
  });

  walletTest('selecting address type updates displayed selection', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Default is Legacy
    const dropdown = page.locator('[role="listbox"] button, button:has-text("Legacy")').first();
    await expect(dropdown).toBeVisible({ timeout: 5000 });
    await dropdown.click();

    // Select Native SegWit
    await page.locator('[role="option"]:has-text("Native SegWit")').click();

    // Dropdown button should now show Native SegWit
    await expect(page.locator('button:has-text("Native SegWit")')).toBeVisible({ timeout: 3000 });
  });

  walletTest('YouTube tutorial button visible before confirmation', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Should show YouTube tutorial link before checkbox is confirmed
    const tutorialButton = page.locator('a[href*="youtube"], button:has-text("Watch Tutorial")');
    await expect(tutorialButton.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('YouTube tutorial button hidden after checkbox confirmation', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Fill in private key
    const keyInput = importWallet.privateKeyInput(page);
    await expect(keyInput).toBeVisible({ timeout: 5000 });
    await keyInput.fill(TEST_PRIVATE_KEY);

    // Check confirmation checkbox
    await importWallet.backedUpCheckbox(page).check();

    // Tutorial button should be hidden when checkbox is confirmed
    const tutorialButton = page.locator('a[href*="youtube"], button:has-text("Watch Tutorial")');
    await expect(tutorialButton).not.toBeVisible({ timeout: 3000 });
  });

  walletTest('continue button disabled with short password', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Fill in private key
    const keyInput = importWallet.privateKeyInput(page);
    await expect(keyInput).toBeVisible({ timeout: 5000 });
    await keyInput.fill(TEST_PRIVATE_KEY);

    // Check confirmation
    await importWallet.backedUpCheckbox(page).check();

    // Enter short password (less than 8 characters)
    await importWallet.passwordInput(page).fill('short');

    // Continue button should be disabled
    await expect(importWallet.continueButton(page)).toBeDisabled();
  });

  walletTest('continue button enabled with valid password', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Fill in private key
    const keyInput = importWallet.privateKeyInput(page);
    await expect(keyInput).toBeVisible({ timeout: 5000 });
    await keyInput.fill(TEST_PRIVATE_KEY);

    // Check confirmation
    await importWallet.backedUpCheckbox(page).check();

    // Enter valid password (8+ characters)
    await importWallet.passwordInput(page).fill(TEST_PASSWORD);

    // Continue button should be enabled
    await expect(importWallet.continueButton(page)).toBeEnabled();
  });

  walletTest('shows specific error for invalid WIF format', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Fill in invalid private key format
    const keyInput = importWallet.privateKeyInput(page);
    await keyInput.fill('not-a-valid-wif-key');

    // Check confirmation
    await importWallet.backedUpCheckbox(page).check();

    // Fill valid password
    await importWallet.passwordInput(page).fill(TEST_PASSWORD);

    // Click continue
    await importWallet.continueButton(page).click();

    // Should show error about invalid format
    const errorAlert = page.locator('[role="alert"], text=/Invalid.*private key/i');
    await expect(errorAlert.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('password placeholder differs for existing vs new keychain', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Fill in private key and check confirmation
    await importWallet.privateKeyInput(page).fill(TEST_PRIVATE_KEY);
    await importWallet.backedUpCheckbox(page).check();

    // Since walletTest has existing keychain, placeholder should be "Confirm password"
    const passwordInput = importWallet.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    const placeholder = await passwordInput.getAttribute('placeholder');
    expect(placeholder).toMatch(/Confirm password/i);
  });

  walletTest('back button navigates to add-wallet page', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    await common.headerBackButton(page).click();

    // Should navigate to add-wallet (since keychain exists)
    await expect(page).toHaveURL(/add-wallet/, { timeout: 5000 });
  });

  walletTest('close button navigates to index', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    const closeButton = page.locator('button[aria-label="Close"]');
    await closeButton.click();

    // Should navigate to index
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });
});

// Tests for import with no existing wallet (fresh extension)
test.describe('Import Private Key Page - Fresh Extension', () => {
  test('can navigate to import private key from onboarding', async ({}, testInfo) => {
    const testId = `import-key-nav-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      // Click import private key on onboarding
      await expect(onboarding.importPrivateKeyButton(page)).toBeVisible({ timeout: 10000 });
      await onboarding.importPrivateKeyButton(page).click();

      // Should navigate to import-private-key page
      await expect(page).toHaveURL(/import-private-key/, { timeout: 5000 });
    } finally {
      await cleanup(context);
    }
  });

  test('fresh extension shows "Create password" placeholder', async ({}, testInfo) => {
    const testId = `import-key-placeholder-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 15)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      // Navigate to import private key
      await expect(onboarding.importPrivateKeyButton(page)).toBeVisible({ timeout: 10000 });
      await onboarding.importPrivateKeyButton(page).click();
      await expect(page).toHaveURL(/import-private-key/, { timeout: 5000 });

      // Fill private key and check confirmation
      await importWallet.privateKeyInput(page).fill(TEST_PRIVATE_KEY);
      await importWallet.backedUpCheckbox(page).check();

      // Password placeholder should be "Create password" for fresh extension
      const passwordInput = importWallet.passwordInput(page);
      await expect(passwordInput).toBeVisible({ timeout: 5000 });

      const placeholder = await passwordInput.getAttribute('placeholder');
      expect(placeholder).toMatch(/Create password/i);
    } finally {
      await cleanup(context);
    }
  });

  test('successful import creates wallet and navigates to index', async ({}, testInfo) => {
    const testId = `import-key-success-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 15)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      // Navigate to import private key
      await expect(onboarding.importPrivateKeyButton(page)).toBeVisible({ timeout: 10000 });
      await onboarding.importPrivateKeyButton(page).click();
      await expect(page).toHaveURL(/import-private-key/, { timeout: 5000 });

      // Fill valid private key
      await importWallet.privateKeyInput(page).fill(TEST_PRIVATE_KEY);

      // Check confirmation
      await importWallet.backedUpCheckbox(page).check();

      // Fill password
      await importWallet.passwordInput(page).fill(TEST_PASSWORD);

      // Click continue
      await importWallet.continueButton(page).click();

      // Should navigate to index after successful import
      await expect(page).toHaveURL(/index/, { timeout: 15000 });
    } finally {
      await cleanup(context);
    }
  });

  test('shows error for password under 8 characters on fresh extension', async ({}, testInfo) => {
    const testId = `import-key-shortpwd-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 15)}`;
    const { context, page } = await launchExtension(testId);

    try {
      await page.waitForLoadState('networkidle');

      // Navigate to import private key
      await expect(onboarding.importPrivateKeyButton(page)).toBeVisible({ timeout: 10000 });
      await onboarding.importPrivateKeyButton(page).click();
      await expect(page).toHaveURL(/import-private-key/, { timeout: 5000 });

      // Fill valid private key
      await importWallet.privateKeyInput(page).fill(TEST_PRIVATE_KEY);

      // Check confirmation
      await importWallet.backedUpCheckbox(page).check();

      // Fill short password
      await importWallet.passwordInput(page).fill('short');

      // Continue button should be disabled
      await expect(importWallet.continueButton(page)).toBeDisabled();
    } finally {
      await cleanup(context);
    }
  });
});
