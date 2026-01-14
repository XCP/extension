/**
 * Message Signing UI Tests
 *
 * Tests for signing messages via the Actions page UI.
 */

import {
  walletTest,
  expect,
  navigateTo,
  grantClipboardPermissions,
  TEST_PASSWORD
} from '../fixtures';

walletTest.describe('Sign Message', () => {
  walletTest('navigates to sign message page', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Tools')).toBeVisible({ timeout: 15000 });

    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    await expect(page.locator('h1, h2').filter({ hasText: 'Sign Message' })).toBeVisible();
    await expect(page.locator('label:has-text("Message")')).toBeVisible();
  });

  walletTest('shows message input and signature fields', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    await expect(page.locator('label:has-text("Message")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('textarea[placeholder*="Enter your message"]')).toBeVisible();

    await expect(page.locator('label:has-text("Signature")')).toBeVisible();
    await expect(page.locator('textarea[placeholder*="Signature will appear"]')).toBeVisible();
  });

  walletTest('requires message before signing', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    const signButton = page.locator('button:has-text("Sign Message")');
    await expect(signButton).toBeDisabled();

    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await messageInput.fill('Test message for signing');

    await expect(signButton).toBeEnabled();
  });

  walletTest('signs a message successfully', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    await page.waitForSelector('textarea[placeholder*="Enter your message"]', { timeout: 10000 });

    const testMessage = 'Hello Bitcoin! This is a test message.';
    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await messageInput.fill(testMessage);

    const signButton = page.locator('button:has-text("Sign Message")');
    await signButton.click();

    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }

    await page.waitForSelector('text="Signed"', { timeout: 15000 });

    const signatureTextarea = page.locator('textarea[placeholder*="Signature will appear"]');
    const signatureValue = await signatureTextarea.inputValue();
    expect(signatureValue).toBeTruthy();
    expect(signatureValue.length).toBeGreaterThan(50);

    await expect(page.locator('text="Signed"')).toBeVisible();
  });

  walletTest('copies signature to clipboard', async ({ page, context }) => {
    await grantClipboardPermissions(context);
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });
    await page.waitForSelector('textarea[placeholder*="Enter your message"]', { timeout: 15000 });

    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await messageInput.fill('Test message');

    const signButton = page.locator('button:has-text("Sign Message")');
    await signButton.click();

    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }

    await page.waitForSelector('text="Signed"', { timeout: 20000 });

    const copyButton = page.locator('button:has-text("Copy signature")');
    await copyButton.click();

    await expect(page.locator('text="Copied!"')).toBeVisible();
  });

  walletTest('exports signature as JSON', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    const testMessage = 'JSON export test';
    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await expect(messageInput).toBeVisible({ timeout: 10000 });
    await messageInput.fill(testMessage);

    const signButton = page.locator('button:has-text("Sign Message")');
    await expect(signButton).toBeVisible();
    await signButton.click();

    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }

    await page.waitForSelector('text="Signed"', { timeout: 30000 });

    const downloadPromise = page.waitForEvent('download');

    const jsonButton = page.locator('button:has-text("Download JSON")');
    await expect(jsonButton).toBeVisible({ timeout: 10000 });
    await jsonButton.click();

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

    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await expect(messageInput).toBeVisible();

    await expect(page.locator('text=/0 character/')).toBeVisible();

    const testMessage = 'Hello';
    await messageInput.fill(testMessage);

    await expect(page.locator(`text=/${testMessage.length} character/`)).toBeVisible();
  });

  walletTest('handles special characters in messages', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForLoadState('networkidle');

    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });

    await page.waitForSelector('textarea[placeholder*="Enter your message"]', { timeout: 10000 });

    const specialMessage = '🚀 Unicode test! 中文 Ñoño\n\tNew lines and tabs';
    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await messageInput.fill(specialMessage);

    const signButton = page.locator('button:has-text("Sign Message")');
    await expect(signButton).toBeEnabled();

    await signButton.click();

    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }

    await page.waitForSelector('text="Signed"', { timeout: 15000 });
  });
});
