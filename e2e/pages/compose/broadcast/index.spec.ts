/**
 * Compose Broadcast Page Tests (/compose/broadcast)
 *
 * Tests for broadcasting text messages and inscriptions (file uploads).
 * Inscription functionality is available for SegWit wallet types.
 */

import { walletTest, expect, navigateTo } from '@e2e/fixtures';
import { compose, actions } from '@e2e/selectors';
import {
  enableValidationBypass,
  enableDryRun,
  waitForReview,
  clickBack,
} from '../../../compose-test-helpers';

walletTest.describe('Compose Broadcast Page (/compose/broadcast)', () => {
  walletTest('can navigate to broadcast from actions', async ({ page }) => {
    await navigateTo(page, 'actions');

    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    expect(page.url()).toContain('broadcast');
  });

  walletTest('broadcast form has message input', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const messageInput = compose.broadcast.messageInput(page);
    await expect(messageInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('broadcast form accepts message text', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const messageInput = compose.broadcast.messageInput(page);
    await messageInput.fill('Test broadcast message');

    await expect(messageInput).toHaveValue('Test broadcast message');
  });

  walletTest('broadcast form shows fee estimation', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const messageInput = compose.broadcast.messageInput(page);
    await messageInput.fill('Test broadcast message');

    // Fee Rate label should be visible
    const feeRateLabel = page.locator('label:has-text("Fee Rate")');
    await expect(feeRateLabel).toBeVisible({ timeout: 5000 });
  });
});

walletTest.describe('Broadcast Flow - Full Compose Flow', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await enableDryRun(page);
  });

  walletTest('form → review: valid broadcast shows review page', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const messageInput = compose.broadcast.messageInput(page);
    await messageInput.fill('E2E test broadcast message');

    const submitBtn = compose.common.submitButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await waitForReview(page);

    const reviewContent = await page.content();
    expect(reviewContent).toMatch(/review|confirm|sign/i);
  });

  walletTest('form → review → back: broadcast data preserved', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const testMessage = 'Test message for back navigation';
    const messageInput = compose.broadcast.messageInput(page);
    await messageInput.fill(testMessage);

    await compose.common.submitButton(page).click();
    await waitForReview(page);

    await clickBack(page);

    await expect(messageInput).toHaveValue(testMessage);
  });

  walletTest('review page shows broadcast message', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const testMessage = 'UniqueTestMessage12345';
    const messageInput = compose.broadcast.messageInput(page);
    await messageInput.fill(testMessage);

    await compose.common.submitButton(page).click();
    await waitForReview(page);

    const pageContent = await page.content();
    expect(pageContent).toContain(testMessage);
  });
});

walletTest.describe('Broadcast Inscription (File Upload)', () => {
  walletTest('inscription toggle shows file uploader when available', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const toggleButton = page.locator('button[role="switch"]').first();
    const toggleCount = await toggleButton.count();

    if (toggleCount === 0) {
      // Inscription not available for this wallet type - skip
      return;
    }

    await expect(toggleButton).toBeVisible({ timeout: 5000 });
    await toggleButton.click();

    // File uploader should appear
    await expect(page.locator('text=/Choose File/i')).toBeVisible({ timeout: 5000 });
  });

  walletTest('file upload workflow', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const toggleButton = page.locator('button[role="switch"]').first();
    const toggleCount = await toggleButton.count();

    if (toggleCount === 0) {
      return; // Inscription not available
    }

    await expect(toggleButton).toBeVisible({ timeout: 5000 });
    await toggleButton.click();
    await expect(page.locator('text="Choose File"')).toBeVisible();

    const fileContent = 'Test broadcast content';
    const fileName = 'test-broadcast.txt';

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('text="Choose File"').click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent)
    });

    // File should appear
    await expect(page.locator(`text="${fileName}"`)).toBeVisible();
    await expect(page.locator('text="Remove file"')).toBeVisible();

    // File size should show
    await expect(page.locator('text=/Size:.*B/')).toBeVisible();

    // Remove file
    await page.locator('text="Remove file"').click();
    await expect(page.locator(`text="${fileName}"`)).not.toBeVisible();
    await expect(page.locator('text="Choose File"')).toBeVisible();
  });

  walletTest('validates file size limit', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const toggleButton = page.locator('button[role="switch"]').first();
    const toggleCount = await toggleButton.count();

    if (toggleCount === 0) {
      return; // Inscription not available
    }

    await expect(toggleButton).toBeVisible({ timeout: 5000 });
    await toggleButton.click();
    await page.waitForLoadState('networkidle');

    // Create a file larger than 400KB limit
    const largeContent = 'x'.repeat(450 * 1024);

    const chooseFileButton = page.locator('text=/Choose File/i').first();
    await expect(chooseFileButton).toBeVisible({ timeout: 5000 });

    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
    await chooseFileButton.click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: 'large-file.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(largeContent)
    });

    // Should show error about file size
    await expect(page.locator('text=/File size must be less than 400KB/i')).toBeVisible({ timeout: 5000 });
  });
});
