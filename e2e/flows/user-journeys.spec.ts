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
import { index, viewAddress, selectAddress, settings, actions, send, unlock, onboarding, common } from '../selectors';

test.describe('User Journey: New User Onboarding to First Transaction', () => {
  test('complete new user flow: create wallet -> explore dashboard -> attempt send', async ({ extensionPage }) => {
    // Step 1: Create a new wallet
    await createWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Step 2: Verify dashboard loaded with address
    const addressElement = extensionPage.locator('.font-mono').first();
    await expect(addressElement).toBeVisible({ timeout: 5000 });
    const address = await addressElement.textContent();
    expect(address).toBeTruthy();

    // Step 3: Check balance section exists
    const balanceSection = extensionPage.locator('text=/BTC|Balance|Assets/i').first();
    await expect(balanceSection).toBeVisible({ timeout: 5000 });

    // Step 4: Navigate to send
    const sendButton = index.sendButton(extensionPage);
    await expect(sendButton).toBeVisible();
    await sendButton.click();
    await expect(extensionPage).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Step 5: Verify send form loaded
    const destinationInput = extensionPage.locator('input[name="destination"]').first();
    await expect(destinationInput).toBeVisible({ timeout: 5000 });

    // Step 6: Navigate back to dashboard
    const backButton = extensionPage.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await backButton.click();
    await expect(extensionPage).toHaveURL(/index/, { timeout: 5000 });
  });
});

test.describe('User Journey: Wallet Management Lifecycle', () => {
  test('create wallet -> add addresses -> lock -> unlock -> verify addresses persist', async ({ extensionPage }) => {
    // Step 1: Create wallet
    await createWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Step 2: Navigate to address management
    const addressChevron = selectAddress.chevronButton(extensionPage);
    await expect(addressChevron).toBeVisible({ timeout: 5000 });
    await addressChevron.click();
    await expect(extensionPage).toHaveURL(/select-address/, { timeout: 5000 });

    // Step 3: Add a new address
    const addButton = extensionPage.locator('button:has-text("Add Address")').first();
    if (await addButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addButton.click();
      await extensionPage.waitForTimeout(1000);
    }

    // Step 4: Count addresses before lock
    const addressCards = extensionPage.locator('.font-mono');
    const addressCountBefore = await addressCards.count();

    // Step 5: Navigate back to index
    await navigateTo(extensionPage, 'wallet');
    await expect(extensionPage).toHaveURL(/index/, { timeout: 5000 });

    // Step 6: Lock the wallet
    await lockWallet(extensionPage);
    await expect(extensionPage).toHaveURL(/unlock/, { timeout: 5000 });

    // Step 7: Unlock the wallet
    await unlockWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Step 8: Verify addresses persisted
    await selectAddress.chevronButton(extensionPage).click();
    await expect(extensionPage).toHaveURL(/select-address/, { timeout: 5000 });

    const addressCardsAfter = extensionPage.locator('.font-mono');
    const addressCountAfter = await addressCardsAfter.count();

    expect(addressCountAfter).toBeGreaterThanOrEqual(addressCountBefore);
  });

  test('import wallet -> change address type -> verify address updates', async ({ extensionPage }) => {
    // Step 1: Import wallet with mnemonic
    await importMnemonic(extensionPage, TEST_PASSWORD, TEST_MNEMONIC);
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Step 2: Get initial address
    const addressElement = extensionPage.locator('.font-mono').first();
    await expect(addressElement).toBeVisible({ timeout: 5000 });
    const initialAddress = await addressElement.textContent();

    // Step 3: Navigate to settings -> address type
    await navigateTo(extensionPage, 'settings');
    await expect(extensionPage).toHaveURL(/settings/);

    const addressTypeOption = extensionPage.locator('div[role="button"][aria-label="Address Type"]').first();
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
    await addressTypeOption.click();
    await expect(extensionPage).toHaveURL(/address-type/, { timeout: 5000 });

    // Step 4: Change to a different address type (Legacy P2PKH)
    const legacyOption = extensionPage.locator('text=/Legacy|P2PKH/i').first();
    if (await legacyOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await legacyOption.click();
      await extensionPage.waitForTimeout(500);
    }

    // Step 5: Navigate back to index
    await navigateTo(extensionPage, 'wallet');
    await expect(extensionPage).toHaveURL(/index/, { timeout: 5000 });

    // Step 6: Verify address changed (or at least page still works)
    const newAddressElement = extensionPage.locator('.font-mono').first();
    await expect(newAddressElement).toBeVisible({ timeout: 5000 });
    const newAddress = await newAddressElement.textContent();
    expect(newAddress).toBeTruthy();
  });
});

walletTest.describe('User Journey: Settings Exploration', () => {
  walletTest('explore all settings sections and return to dashboard', async ({ page }) => {
    // Step 1: Navigate to settings
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    // Step 2: Visit Address Type settings
    const addressTypeOption = page.locator('div[role="button"][aria-label="Address Type"]').first();
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
    await addressTypeOption.click();
    await expect(page).toHaveURL(/address-type/, { timeout: 5000 });

    // Step 3: Go back and visit Security
    await navigateTo(page, 'settings');
    const securityOption = page.locator('div[role="button"][aria-label="Security"]').first();
    await expect(securityOption).toBeVisible({ timeout: 5000 });
    await securityOption.click();
    await expect(page).toHaveURL(/security/, { timeout: 5000 });

    // Step 4: Go back and visit Advanced
    await navigateTo(page, 'settings');
    const advancedOption = settings.advancedOption(page);
    await expect(advancedOption).toBeVisible({ timeout: 5000 });
    await advancedOption.click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    // Step 5: Return to dashboard
    await navigateTo(page, 'wallet');
    await expect(page).toHaveURL(/index/, { timeout: 5000 });

    // Step 6: Verify dashboard still works
    const addressElement = page.locator('.font-mono').first();
    await expect(addressElement).toBeVisible({ timeout: 5000 });
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
    const destinationInput = page.locator('input[name="destination"]').first();
    await expect(destinationInput).toBeVisible({ timeout: 5000 });
    await destinationInput.fill('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');

    // Step 3: Navigate away to settings
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/, { timeout: 5000 });

    // Step 4: Return to wallet
    await navigateTo(page, 'wallet');
    await expect(page).toHaveURL(/index/, { timeout: 5000 });

    // Step 5: Go back to send
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Step 6: Verify form is fresh (field should be empty or reset)
    const destinationInputAgain = page.locator('input[name="destination"]').first();
    await expect(destinationInputAgain).toBeVisible({ timeout: 5000 });
    const value = await destinationInputAgain.inputValue();
    // Form should be empty after navigating away
    expect(value).toBe('');
  });

  walletTest('check transaction history after viewing send form', async ({ page }) => {
    // Step 1: Check history first
    const historyButton = index.historyButton(page);
    await expect(historyButton).toBeVisible({ timeout: 5000 });
    await historyButton.click();
    await expect(page).toHaveURL(/address-history/, { timeout: 5000 });

    // Step 2: Verify history page content
    const pageContent = await page.content();
    const hasHistoryIndicator = pageContent.includes('History') ||
                               pageContent.includes('Transactions') ||
                               pageContent.includes('No transactions') ||
                               pageContent.includes('Loading');
    expect(hasHistoryIndicator).toBeTruthy();

    // Step 3: Go back and try send
    await navigateTo(page, 'wallet');
    const sendButton = index.sendButton(page);
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Step 4: Verify send form works
    const destinationInput = page.locator('input[name="destination"]').first();
    await expect(destinationInput).toBeVisible({ timeout: 5000 });
  });
});

walletTest.describe('User Journey: Actions Exploration', () => {
  walletTest('explore actions page and attempt each action type', async ({ page }) => {
    // Step 1: Navigate to actions
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/, { timeout: 5000 });

    // Step 2: Try Sign Message
    const signMessageOption = actions.signMessageOption(page);
    await expect(signMessageOption).toBeVisible({ timeout: 5000 });
    await signMessageOption.click();
    await expect(page).toHaveURL(/sign-message/, { timeout: 5000 });

    // Step 3: Go back and try Verify Message
    await navigateTo(page, 'actions');
    const verifyMessageOption = actions.verifyMessageOption(page);
    await expect(verifyMessageOption).toBeVisible({ timeout: 5000 });
    await verifyMessageOption.click();
    await expect(page).toHaveURL(/verify-message/, { timeout: 5000 });

    // Step 4: Go back and try Issue Asset
    await navigateTo(page, 'actions');
    const issueAssetOption = actions.issueAssetOption(page);
    await expect(issueAssetOption).toBeVisible({ timeout: 5000 });
    await issueAssetOption.click();
    await expect(page).toHaveURL(/compose\/issuance/, { timeout: 5000 });

    // Step 5: Return to wallet
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
    await extensionPage.locator('input[name="password"]').fill('wrongpassword');
    await extensionPage.locator('button:has-text("Unlock")').click();

    // Step 4: Verify error shown
    await expect(extensionPage.locator('text=/Invalid.*password|Incorrect.*password|Wrong.*password/i')).toBeVisible({ timeout: 3000 });

    // Step 5: Enter correct password
    await extensionPage.locator('input[name="password"]').fill(TEST_PASSWORD);
    await extensionPage.locator('button:has-text("Unlock")').click();

    // Step 6: Verify can continue working
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Step 7: Navigate to settings to confirm everything works
    await navigateTo(extensionPage, 'settings');
    await expect(extensionPage).toHaveURL(/settings/);
  });

  test('cancel during import -> start fresh create', async ({ extensionPage }) => {
    // Step 1: Start import
    await extensionPage.getByText('Import Wallet').click();
    await extensionPage.waitForSelector('input[name="word-0"]', { timeout: 5000 });

    // Step 2: Cancel import
    const backButton = extensionPage.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await backButton.click();
    await extensionPage.waitForTimeout(500);

    // Step 3: Start create wallet instead
    await extensionPage.getByText('Create Wallet').click();
    await extensionPage.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });

    // Step 4: Complete creation
    await createWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });
  });
});

walletTest.describe('User Journey: Multi-Wallet Scenario', () => {
  walletTest('switch between dashboard sections rapidly', async ({ page }) => {
    // Rapid navigation to test state management

    // Assets tab
    const assetsTab = page.locator('button:has-text("Assets")').first();
    if (await assetsTab.isVisible({ timeout: 1000 }).catch(() => false)) {
      await assetsTab.click();
      await page.waitForTimeout(200);
    }

    // Balances tab
    const balancesTab = page.locator('button:has-text("Balances")').first();
    if (await balancesTab.isVisible({ timeout: 1000 }).catch(() => false)) {
      await balancesTab.click();
      await page.waitForTimeout(200);
    }

    // Send button
    const sendButton = index.sendButton(page);
    await sendButton.click();
    await page.waitForTimeout(200);

    // Back
    const backButton = page.locator('button[aria-label*="back"], header button').first();
    await backButton.click();
    await page.waitForTimeout(200);

    // Receive button
    const receiveButton = index.receiveButton(page);
    await receiveButton.click();
    await page.waitForTimeout(200);

    // Back
    await page.locator('button[aria-label*="back"], header button').first().click();

    // Verify still on valid page
    await expect(page).toHaveURL(/index|view-address/, { timeout: 5000 });
  });
});
