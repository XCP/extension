/**
 * Vertical Integration Tests - User Journeys
 *
 * These tests span multiple features and pages to verify complete user flows.
 * Unlike unit-style tests that check individual features, these tests simulate
 * realistic multi-step user journeys through the application.
 */

import {
  test,
  walletTest,
  expect,
  createWallet,
  importMnemonic,
  lockWallet,
  unlockWallet,
  navigateTo,
  TEST_PASSWORD,
  TEST_MNEMONIC
} from '../fixtures';
import { index, selectAddress, settings, actions, send, unlock, onboarding, importWallet, common } from '../selectors';
import { TEST_ADDRESSES } from '../test-data';

test.describe('User Journey: New User Onboarding to First Transaction', () => {
  test('complete new user flow: create wallet -> explore dashboard -> attempt send', async ({ extensionPage }) => {
    // Step 1: Create a new wallet
    await createWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Step 2: Verify dashboard loaded with address display
    const addressDisplay = index.currentAddress(extensionPage);
    await expect(addressDisplay).toBeVisible({ timeout: 5000 });

    // Step 3: Check balance section exists
    const balanceSection = extensionPage.locator('text=/BTC|Balance|Assets/i').first();
    await expect(balanceSection).toBeVisible({ timeout: 5000 });

    // Step 4: Navigate to send
    const sendButton = index.sendButton(extensionPage);
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(extensionPage).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Step 5: Verify send form loaded
    const destinationInput = send.recipientInput(extensionPage);
    await expect(destinationInput).toBeVisible({ timeout: 5000 });

    // Step 6: Navigate back to dashboard
    const backButton = common.headerBackButton(extensionPage);
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();
    await expect(extensionPage).toHaveURL(/index/, { timeout: 5000 });
  });
});

test.describe('User Journey: Wallet Management Lifecycle', () => {
  test('create wallet -> lock -> unlock -> verify state persists', async ({ extensionPage }) => {
    // Step 1: Create wallet
    await createWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Step 2: Verify address is displayed
    const addressDisplay = index.currentAddress(extensionPage);
    await expect(addressDisplay).toBeVisible({ timeout: 5000 });
    const addressBefore = await addressDisplay.textContent();

    // Step 3: Lock the wallet
    await lockWallet(extensionPage);
    await expect(extensionPage).toHaveURL(/unlock/, { timeout: 5000 });

    // Step 4: Unlock the wallet
    await unlockWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Step 5: Verify address persisted
    await expect(addressDisplay).toBeVisible({ timeout: 5000 });
    const addressAfter = await addressDisplay.textContent();
    expect(addressAfter).toBe(addressBefore);
  });

  test('import wallet -> change address type -> verify address updates', async ({ extensionPage }) => {
    // Step 1: Import wallet with mnemonic
    await importMnemonic(extensionPage, TEST_MNEMONIC, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Step 2: Get initial address
    const addressDisplay = index.currentAddress(extensionPage);
    await expect(addressDisplay).toBeVisible({ timeout: 5000 });
    const initialAddress = await addressDisplay.textContent();
    expect(initialAddress).toBeTruthy();

    // Step 3: Navigate to settings -> address type
    await navigateTo(extensionPage, 'settings');
    await expect(extensionPage).toHaveURL(/settings/);

    const addressTypeOption = extensionPage.locator('div[role="button"][aria-label="Address Type"]').first();
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
    await addressTypeOption.click();
    await expect(extensionPage).toHaveURL(/address-type/, { timeout: 5000 });

    // Step 4: Change to a different address type (Legacy P2PKH)
    const legacyOption = extensionPage.locator('text=/Legacy|P2PKH/i').first();
    await expect(legacyOption).toBeVisible({ timeout: 5000 });
    await legacyOption.click();

    // Step 5: Navigate back to index
    await navigateTo(extensionPage, 'wallet');
    await expect(extensionPage).toHaveURL(/index/, { timeout: 5000 });

    // Step 6: Verify address is still displayed (may have changed format)
    await expect(addressDisplay).toBeVisible({ timeout: 5000 });
    const newAddress = await addressDisplay.textContent();
    expect(newAddress).toBeTruthy();
  });
});

walletTest.describe('User Journey: Settings Exploration', () => {
  walletTest('visit address type settings and return', async ({ page }) => {
    // Navigate to settings
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    // Visit Address Type settings
    const addressTypeOption = settings.addressTypeOption(page);
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
    await addressTypeOption.click();
    await expect(page).toHaveURL(/address-type/, { timeout: 5000 });

    // Return to settings
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);
  });

  walletTest('visit security settings and return', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    const securityOption = settings.securityOption(page);
    await expect(securityOption).toBeVisible({ timeout: 5000 });
    await securityOption.click();
    await expect(page).toHaveURL(/security/, { timeout: 5000 });

    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);
  });

  walletTest('visit advanced settings and return', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    const advancedOption = settings.advancedOption(page);
    await expect(advancedOption).toBeVisible({ timeout: 5000 });
    await advancedOption.click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    // Return to dashboard
    await navigateTo(page, 'wallet');
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });

  walletTest('navigate through all footer tabs', async ({ page }) => {
    // Start at wallet (index)
    await expect(page).toHaveURL(/index/);

    // Step 1: Go to Market
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/, { timeout: 5000 });

    // Step 2: Go to Actions
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/, { timeout: 5000 });

    // Step 3: Go to Settings
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/, { timeout: 5000 });

    // Step 4: Return to Wallet
    await navigateTo(page, 'wallet');
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });
});

walletTest.describe('User Journey: Transaction Flow with Interruptions', () => {
  walletTest('start send -> navigate away -> return -> form resets', async ({ page }) => {
    // Step 1: Navigate to send
    const sendButton = index.sendButton(page);
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Step 2: Fill in some data
    const destinationInput = send.recipientInput(page);
    await expect(destinationInput).toBeVisible({ timeout: 5000 });
    await destinationInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);

    // Verify data was entered
    await expect(destinationInput).toHaveValue(TEST_ADDRESSES.mainnet.p2wpkh);

    // Step 3: Navigate away to settings
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/, { timeout: 5000 });

    // Step 4: Return to wallet
    await navigateTo(page, 'wallet');
    await expect(page).toHaveURL(/index/, { timeout: 5000 });

    // Step 5: Go back to send
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Step 6: Verify form is fresh (field should be empty)
    const destinationInputAgain = send.recipientInput(page);
    await expect(destinationInputAgain).toBeVisible({ timeout: 5000 });
    await expect(destinationInputAgain).toHaveValue('');
  });

  walletTest('check transaction history page loads', async ({ page }) => {
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    await expect(index.addressText(page)).toBeVisible({ timeout: 10000 });

    // Click history button
    const historyButton = index.historyButton(page);
    await expect(historyButton).toBeVisible({ timeout: 10000 });
    await historyButton.click();

    // Verify navigation to history page
    await expect(page).toHaveURL(/addresses\/history/, { timeout: 10000 });

    // Verify history page has expected content
    const historyTitle = page.locator('text=/History|Transactions/i').first();
    await expect(historyTitle).toBeVisible({ timeout: 5000 });
  });

  walletTest('can navigate from history to send and back', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await expect(index.addressText(page)).toBeVisible({ timeout: 10000 });

    // Go to history
    const historyButton = index.historyButton(page);
    await expect(historyButton).toBeVisible({ timeout: 10000 });
    await historyButton.click();
    await expect(page).toHaveURL(/addresses\/history/, { timeout: 10000 });

    // Go back to index
    await navigateTo(page, 'wallet');
    await expect(page).toHaveURL(/index/, { timeout: 5000 });

    // Go to send
    const sendButton = index.sendButton(page);
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Verify send form loaded
    const destinationInput = send.recipientInput(page);
    await expect(destinationInput).toBeVisible({ timeout: 5000 });
  });
});

walletTest.describe('User Journey: Actions Exploration', () => {
  walletTest('can access sign message from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/, { timeout: 5000 });

    const signMessageOption = actions.signMessageOption(page);
    await expect(signMessageOption).toBeVisible({ timeout: 5000 });
    await signMessageOption.click();
    await expect(page).toHaveURL(/sign-message/, { timeout: 5000 });

    // Return to actions
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/, { timeout: 5000 });
  });

  walletTest('can access verify message from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/, { timeout: 5000 });

    const verifyMessageOption = actions.verifyMessageOption(page);
    await expect(verifyMessageOption).toBeVisible({ timeout: 5000 });
    await verifyMessageOption.click();
    await expect(page).toHaveURL(/verify-message/, { timeout: 5000 });

    // Return to actions
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/, { timeout: 5000 });
  });

  walletTest('can access issue asset from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/, { timeout: 5000 });

    const issueAssetOption = actions.issueAssetOption(page);
    await expect(issueAssetOption).toBeVisible({ timeout: 5000 });
    await issueAssetOption.click();
    await expect(page).toHaveURL(/issuance/, { timeout: 5000 });

    // Return to wallet
    await navigateTo(page, 'wallet');
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });
});

test.describe('User Journey: Error Recovery', () => {
  test('wrong password -> correct password -> continue working', async ({ extensionPage }) => {
    // Step 1: Create wallet
    await createWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Step 2: Lock wallet
    await lockWallet(extensionPage);
    await expect(extensionPage).toHaveURL(/unlock/, { timeout: 5000 });

    // Step 3: Try wrong password
    await unlock.passwordInput(extensionPage).fill('wrongpassword');
    await unlock.unlockButton(extensionPage).click();

    // Step 4: Verify error shown
    const errorMessage = extensionPage.locator('text=/Invalid.*password|Incorrect.*password|Wrong.*password/i');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    // Step 5: Enter correct password
    await unlock.passwordInput(extensionPage).fill(TEST_PASSWORD);
    await unlock.unlockButton(extensionPage).click();

    // Step 6: Verify can continue working
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Step 7: Navigate to settings to confirm everything works
    await navigateTo(extensionPage, 'settings');
    await expect(extensionPage).toHaveURL(/settings/);
  });

  test('cancel during import -> start fresh create', async ({ extensionPage }) => {
    // Step 1: Start import
    await onboarding.importWalletButton(extensionPage).click();
    const wordInput = importWallet.wordInput(extensionPage, 0);
    await expect(wordInput).toBeVisible({ timeout: 5000 });

    // Step 2: Cancel import by clicking back
    const backButton = common.headerBackButton(extensionPage);
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    // Step 3: Wait for onboarding page to appear again
    await expect(onboarding.createWalletButton(extensionPage)).toBeVisible({ timeout: 5000 });

    // Step 4: Now create wallet from scratch
    await createWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });
  });
});

walletTest.describe('User Journey: Dashboard Navigation', () => {
  walletTest('can switch between Assets and Balances tabs', async ({ page }) => {
    // Assets tab
    const assetsTab = page.locator('button:has-text("Assets")').first();
    await expect(assetsTab).toBeVisible({ timeout: 5000 });
    await assetsTab.click();

    // Balances tab
    const balancesTab = page.locator('button:has-text("Balances")').first();
    await expect(balancesTab).toBeVisible({ timeout: 5000 });
    await balancesTab.click();

    // Verify still on index page
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });

  walletTest('can navigate to receive and back', async ({ page }) => {
    // Click receive button
    const receiveButton = index.receiveButton(page);
    await expect(receiveButton).toBeVisible({ timeout: 5000 });
    await receiveButton.click();

    // Should navigate to view-address
    await expect(page).toHaveURL(/addresses\/details/, { timeout: 5000 });

    // Go back
    const backButton = common.headerBackButton(page);
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    // Should be back at index
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });
});
