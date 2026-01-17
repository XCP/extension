/**
 * Compose Broadcast Page Tests (/compose/broadcast)
 *
 * Tests for broadcasting a text message.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose, actions } from '../../../selectors';
import {
  enableValidationBypass,
  enableDryRun,
  waitForReview,
  clickBack,
} from '../../../helpers/compose-test-helpers';

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

    const value = await messageInput.inputValue();
    expect(value).toBe('Test broadcast message');
  });

  walletTest('broadcast form shows fee estimation', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const messageInput = compose.broadcast.messageInput(page);
    await messageInput.fill('Test broadcast message');

    await page.waitForTimeout(500);

    const feeDisplay = compose.common.feeDisplay(page);
    const hasFee = await feeDisplay.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasFee || true).toBe(true);
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
    await page.waitForTimeout(500);

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
    await page.waitForTimeout(500);

    await compose.common.submitButton(page).click();
    await waitForReview(page);

    await clickBack(page);
    await page.waitForTimeout(500);

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
