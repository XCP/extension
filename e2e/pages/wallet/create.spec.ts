/**
 * Wallet Creation Tests
 */

import { test, expect, createWallet as createWalletFlow, TEST_PASSWORD } from '../../fixtures';
import { onboarding, createWallet, index } from '../../selectors';

test.describe('Wallet Creation', () => {
  test('shows create wallet button on first run', async ({ extensionPage }) => {
    await expect(onboarding.createWalletButton(extensionPage)).toBeVisible();
  });

  test('navigates to create wallet page', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await expect(extensionPage).toHaveURL(/wallet\/create/);
    await expect(createWallet.revealPhraseCard(extensionPage)).toBeVisible();
  });

  test('reveals recovery phrase and shows password field', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await extensionPage.waitForURL(/wallet\/create/);

    // Click the reveal phrase card
    await createWallet.revealPhraseCard(extensionPage).click();
    

    // Checkbox should be visible
    await expect(createWallet.savedPhraseCheckbox(extensionPage)).toBeVisible();
    await createWallet.savedPhraseCheckbox(extensionPage).check();

    // Password field appears after checkbox
    await expect(createWallet.passwordInput(extensionPage)).toBeVisible();
  });

  test('completes wallet creation successfully', async ({ extensionPage }) => {
    await createWalletFlow(extensionPage, TEST_PASSWORD);

    await expect(extensionPage).toHaveURL(/index/);
    await expect(index.assetsTab(extensionPage)).toBeVisible();
  });

  test('validates password minimum length', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await extensionPage.waitForURL(/wallet\/create/);

    // Click the reveal phrase card
    await createWallet.revealPhraseCard(extensionPage).click();

    await createWallet.savedPhraseCheckbox(extensionPage).check();

    // Enter short password
    await createWallet.passwordInput(extensionPage).fill('short');

    // Continue button should be disabled with short password
    await expect(createWallet.continueButton(extensionPage)).toBeDisabled();
  });

  test('displays 12 mnemonic words after reveal', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await extensionPage.waitForURL(/wallet\/create/);

    // Click the reveal phrase card
    await createWallet.revealPhraseCard(extensionPage).click();

    // Should show 12 words in a list
    const wordItems = extensionPage.locator('ol li');
    await expect(wordItems).toHaveCount(12);

    // Each word should be visible and contain text
    for (let i = 0; i < 12; i++) {
      const word = createWallet.mnemonicWord(extensionPage, i);
      await expect(word).toBeVisible();
      const text = await word.textContent();
      // Should have a number prefix and a word
      expect(text).toMatch(/\d+\.\s*\w+/);
    }
  });

  test('checkbox is disabled until phrase is revealed', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await extensionPage.waitForURL(/wallet\/create/);

    // Checkbox should be disabled before revealing phrase
    await expect(createWallet.savedPhraseCheckbox(extensionPage)).toBeDisabled();

    // Reveal the phrase
    await createWallet.revealPhraseCard(extensionPage).click();

    // Checkbox should now be enabled
    await expect(createWallet.savedPhraseCheckbox(extensionPage)).toBeEnabled();
  });

  test('has generate new phrase button in header', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await extensionPage.waitForURL(/wallet\/create/);

    // Header should have refresh/generate button
    const generateButton = extensionPage.locator('[aria-label="Generate new recovery phrase"]');
    await expect(generateButton).toBeVisible({ timeout: 5000 });
  });

  test('generate button creates new phrase', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await extensionPage.waitForURL(/wallet\/create/);

    // Reveal the phrase first
    await createWallet.revealPhraseCard(extensionPage).click();

    // Get the first word of the current phrase
    const firstWordBefore = await createWallet.mnemonicWord(extensionPage, 0).textContent();

    // Click the generate new phrase button
    const generateButton = extensionPage.locator('[aria-label="Generate new recovery phrase"]');
    await generateButton.click();

    // The phrase card should be back (need to reveal again)
    // OR the words should have changed
    // Since generate resets the view, we might need to reveal again
    const revealCard = createWallet.revealPhraseCard(extensionPage);
    const revealCount = await revealCard.count();

    if (revealCount > 0) {
      // Need to reveal again after generate
      await revealCard.click();
    }

    // Get the first word again
    const firstWordAfter = await createWallet.mnemonicWord(extensionPage, 0).textContent();

    // Words should be different (very unlikely to be the same)
    expect(firstWordAfter).not.toBe(firstWordBefore);
  });

  test('shows page title and instructions', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await extensionPage.waitForURL(/wallet\/create/);

    // Should show title about recovery phrase
    await expect(extensionPage.locator('text=/Recovery Phrase|Secret Phrase/i').first()).toBeVisible();

    // Should show instructions to write down the phrase
    await expect(extensionPage.locator('text=/write down|save|backup/i').first()).toBeVisible();
  });

  test('shows YouTube tutorial link before confirmation', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await extensionPage.waitForURL(/wallet\/create/);

    // YouTube tutorial button should be visible before confirming
    // Note: href uses youtu.be short URL format
    const youtubeButton = extensionPage.locator('a[href*="youtu"], button:has-text("Watch Tutorial")');
    await expect(youtubeButton.first()).toBeVisible({ timeout: 5000 });
  });
});
