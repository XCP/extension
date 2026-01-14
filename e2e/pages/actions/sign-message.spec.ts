/**
 * Message Signing UI Tests
 *
 * Tests for signing messages via the Actions page UI.
 */

import { walletTest, expect, navigateTo, grantClipboardPermissions, TEST_PASSWORD } from '../../fixtures';
import { actions, signMessage } from '../../selectors';

walletTest.describe('Sign Message', () => {
  walletTest('navigates to sign message page', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');
    await expect(actions.toolsSection(page)).toBeVisible({ timeout: 15000 });

    await actions.signMessageOption(page).click();
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    await expect(page.locator('h1, h2').filter({ hasText: 'Sign Message' })).toBeVisible();
    await expect(page.locator('label:has-text("Message")')).toBeVisible();
  });

  walletTest('shows message input and signature fields', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await actions.signMessageOption(page).click();
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    await expect(page.locator('label:has-text("Message")')).toBeVisible({ timeout: 10000 });
    await expect(signMessage.messageInput(page)).toBeVisible();

    await expect(page.locator('label:has-text("Signature")')).toBeVisible();
    await expect(signMessage.signatureOutput(page)).toBeVisible();
  });

  walletTest('requires message before signing', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await actions.signMessageOption(page).click();
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    await expect(signMessage.signButton(page)).toBeDisabled();

    await signMessage.messageInput(page).fill('Test message for signing');

    await expect(signMessage.signButton(page)).toBeEnabled();
  });

  walletTest('signs a message successfully', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await actions.signMessageOption(page).click();
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    await signMessage.messageInput(page).waitFor({ timeout: 10000 });

    const testMessage = 'Hello Bitcoin! This is a test message.';
    await signMessage.messageInput(page).fill(testMessage);

    await signMessage.signButton(page).click();

    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }

    await expect(signMessage.signedIndicator(page)).toBeVisible({ timeout: 15000 });

    const signatureValue = await signMessage.signatureOutput(page).inputValue();
    expect(signatureValue).toBeTruthy();
    expect(signatureValue.length).toBeGreaterThan(50);
  });

  walletTest('copies signature to clipboard', async ({ page, context }) => {
    await grantClipboardPermissions(context);
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await actions.signMessageOption(page).click();
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });
    await signMessage.messageInput(page).waitFor({ timeout: 15000 });

    await signMessage.messageInput(page).fill('Test message');

    await signMessage.signButton(page).click();

    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }

    await expect(signMessage.signedIndicator(page)).toBeVisible({ timeout: 20000 });

    await signMessage.copyButton(page).click();

    await expect(page.locator('text="Copied!"')).toBeVisible();
  });

  walletTest('exports signature as JSON', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await actions.signMessageOption(page).click();
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    const testMessage = 'JSON export test';
    await expect(signMessage.messageInput(page)).toBeVisible({ timeout: 10000 });
    await signMessage.messageInput(page).fill(testMessage);

    await expect(signMessage.signButton(page)).toBeVisible();
    await signMessage.signButton(page).click();

    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }

    await expect(signMessage.signedIndicator(page)).toBeVisible({ timeout: 30000 });

    const downloadPromise = page.waitForEvent('download');

    await expect(signMessage.downloadJsonButton(page)).toBeVisible({ timeout: 10000 });
    await signMessage.downloadJsonButton(page).click();

    const download = await downloadPromise;
    const downloadPath = await download.path();

    expect(downloadPath).toBeTruthy();
    const fileName = download.suggestedFilename();
    expect(fileName).toContain('signature');
    expect(fileName.endsWith('.json')).toBe(true);
  });

  walletTest('shows character count', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await actions.signMessageOption(page).click();
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    await expect(signMessage.messageInput(page)).toBeVisible();

    await expect(page.locator('text=/0 character/')).toBeVisible();

    const testMessage = 'Hello';
    await signMessage.messageInput(page).fill(testMessage);

    await expect(page.locator(`text=/${testMessage.length} character/`)).toBeVisible();
  });

  walletTest('handles special characters in messages', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await actions.signMessageOption(page).click();
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    await signMessage.messageInput(page).waitFor({ timeout: 10000 });

    const specialMessage = '🚀 Unicode test! 中文 Ñoño\n\tNew lines and tabs';
    await signMessage.messageInput(page).fill(specialMessage);

    await expect(signMessage.signButton(page)).toBeEnabled();

    await signMessage.signButton(page).click();

    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }

    await expect(signMessage.signedIndicator(page)).toBeVisible({ timeout: 15000 });
  });
});
