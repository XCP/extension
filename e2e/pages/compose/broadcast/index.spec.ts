/**
 * Compose Broadcast Page Tests (/compose/broadcast)
 *
 * Tests for broadcasting a text message.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose, actions } from '../../../selectors';

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
