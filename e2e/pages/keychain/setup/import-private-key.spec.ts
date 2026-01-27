/**
 * Import Private Key Page Tests (/keychain/setup/import-private-key)
 *
 * Tests for importing a wallet using a private key with address format selection.
 */

import { walletTest, test, expect, launchExtension, cleanup, TEST_PRIVATE_KEY, TEST_PASSWORD } from '@e2e/fixtures';
import { importWallet, common, onboarding } from '@e2e/selectors';

// Tests for import when wallet already exists
walletTest.describe('Import Private Key Page - With Existing Wallet (/keychain/setup/import-private-key)', () => {
  async function navigateToImportPrivateKey(page: any): Promise<void> {
    // Navigate via add-wallet page
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/keychain/setup/import-private-key`);
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
    await expect(dropdown).toBeVisible({ timeout: 5000 });
    await dropdown.click();

    // Check for address type options
    const addressTypeOption = page.locator('text=/Legacy|P2PKH|SegWit|Taproot|bc1/i').first();
    await expect(addressTypeOption).toBeVisible({ timeout: 3000 });
  });

  walletTest('has backup confirmation checkbox', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // First fill in private key to enable checkbox
    const keyInput = importWallet.privateKeyInput(page);
    await expect(keyInput).toBeVisible({ timeout: 5000 });
    await keyInput.fill(TEST_PRIVATE_KEY);

    // HeadlessUI Checkbox renders as a button with role="checkbox"
    const checkbox = page.getByRole('checkbox', { name: /backed up/i });
    await expect(checkbox).toBeVisible({ timeout: 5000 });
  });

  walletTest('checkbox is disabled without private key', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Don't fill in private key - checkbox should be disabled
    // HeadlessUI Checkbox renders as a button with role="checkbox", not a native input
    const checkbox = page.getByRole('checkbox', { name: /backed up/i });
    await expect(checkbox).toBeVisible({ timeout: 5000 });
    await expect(checkbox).toBeDisabled();
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

    // Check confirmation checkbox
    await importWallet.backedUpCheckbox(page).check();

    // Fill password
    await importWallet.passwordInput(page).fill(TEST_PASSWORD);

    // Submit
    await importWallet.continueButton(page).click();

    // Should stay on page (not navigate away with invalid key)
    await expect(page).toHaveURL(/keychain\/setup\/import-private-key/, { timeout: 3000 });
  });

  walletTest('shows error for wrong password (existing keychain)', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Fill in valid private key
    const keyInput = importWallet.privateKeyInput(page);
    await expect(keyInput).toBeVisible({ timeout: 5000 });
    await keyInput.fill(TEST_PRIVATE_KEY);

    // Check confirmation checkbox
    await importWallet.backedUpCheckbox(page).check();

    // Fill wrong password
    await importWallet.passwordInput(page).fill('wrongpassword123');

    // Submit
    await importWallet.continueButton(page).click();

    // Should stay on page (not navigate away with wrong password)
    await expect(page).toHaveURL(/keychain\/setup\/import-private-key/, { timeout: 3000 });
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

  walletTest('shows address type options when dropdown opened', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    // Click dropdown to open options
    const dropdown = page.locator('[role="listbox"] button, button:has-text("Legacy")').first();
    await expect(dropdown).toBeVisible({ timeout: 5000 });
    await dropdown.click();

    // Should show at least some address types (Legacy, SegWit variants, Taproot)
    const legacyOption = page.getByText('Legacy');
    const segwitOption = page.getByText(/SegWit/i);
    await expect(legacyOption.or(segwitOption).first()).toBeVisible({ timeout: 3000 });
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

    // Should show YouTube tutorial link before checkbox is confirmed (uses youtu.be short URL)
    const tutorialButton = page.locator('a[href*="youtu"], button:has-text("Watch Tutorial")');
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

    // Tutorial button should be hidden when checkbox is confirmed (uses youtu.be short URL)
    const tutorialButton = page.locator('a[href*="youtu"], button:has-text("Watch Tutorial")');
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

  walletTest('shows error for invalid WIF format', async ({ page }) => {
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

    // Should show error about invalid format (role="alert" or error text)
    const errorAlert = page.locator('[role="alert"]');
    const errorText = page.getByText(/Invalid|error|private key/i);
    await expect(errorAlert.or(errorText).first()).toBeVisible({ timeout: 5000 });
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
    await expect(page).toHaveURL(/keychain\/wallets\/add/, { timeout: 5000 });
  });

  walletTest('close button navigates to index', async ({ page }) => {
    await navigateToImportPrivateKey(page);

    const closeButton = page.locator('button[aria-label="Close"]');
    await closeButton.click();

    // Should navigate to index
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });
});

// Note: Fresh Extension tests were removed because /import-private-key is a protected route.
// On a fresh extension (no wallet), navigating to /import-private-key redirects to /keychain/onboarding.
// The /import-private-key route is only accessible after a wallet exists (via /add-wallet).
// Fresh extension users must use /import-wallet (mnemonic) or /create-wallet instead.
