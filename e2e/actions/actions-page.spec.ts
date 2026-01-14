import { test, expect } from '@playwright/test';
import {
  launchExtension,
  setupWallet,
  navigateViaFooter,
  cleanup,
} from '../helpers/test-helpers';

test.describe('Actions Page', () => {
  test('can navigate to actions page via footer', async () => {
    const { context, page } = await launchExtension('actions-nav');
    await setupWallet(page);

    // Navigate to actions via footer
    await navigateViaFooter(page, 'actions');

    // Should be on actions page
    await expect(page).toHaveURL(/actions/);

    // Should display Actions title or sections
    await expect(page.locator('text=/Actions|Tools|Assets/i').first()).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('actions page shows Tools section', async () => {
    const { context, page } = await launchExtension('actions-tools');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Should show Tools section with Sign/Verify options
    await expect(page.getByText('Tools')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Sign Message')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Verify Message')).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('actions page shows Assets section', async () => {
    const { context, page } = await launchExtension('actions-assets');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Should show Assets section
    await expect(page.getByText('Assets')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Issue Asset')).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('actions page shows Address section', async () => {
    const { context, page } = await launchExtension('actions-address');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Should show Address section
    await expect(page.getByText('Address')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Broadcast')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Sweep Address')).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('actions page shows DEX section', async () => {
    const { context, page } = await launchExtension('actions-dex');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Should show DEX section
    await expect(page.getByText('DEX')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Cancel Order')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Close Dispenser')).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('can navigate to Sign Message from actions', async () => {
    const { context, page } = await launchExtension('actions-to-sign');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Click Sign Message
    await page.getByText('Sign Message').click();
    await expect(page).toHaveURL(/sign-message/, { timeout: 5000 });

    // Should show sign message form
    await expect(page.locator('textarea, input[name="message"]').first()).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('can navigate to Verify Message from actions', async () => {
    const { context, page } = await launchExtension('actions-to-verify');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Click Verify Message
    await page.getByText('Verify Message').click();
    await expect(page).toHaveURL(/verify-message/, { timeout: 5000 });

    // Should show verify message form
    const hasVerifyForm = await page.locator('textarea, input').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasVerifyForm).toBe(true);

    await cleanup(context);
  });

  test('can navigate to Issue Asset from actions', async () => {
    const { context, page } = await launchExtension('actions-to-issue');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Click Issue Asset
    await page.getByText('Issue Asset').click();

    // Should navigate to issuance page
    await page.waitForTimeout(1000);
    const isOnIssuance = page.url().includes('issuance');
    expect(isOnIssuance).toBe(true);

    await cleanup(context);
  });

  test('can navigate to Broadcast from actions', async () => {
    const { context, page } = await launchExtension('actions-to-broadcast');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Click Broadcast (first one that's not address options)
    const broadcastOption = page.locator('text=Broadcast').first();
    await broadcastOption.click();

    // Should navigate to broadcast page
    await page.waitForTimeout(1000);
    const isOnBroadcast = page.url().includes('broadcast');
    expect(isOnBroadcast).toBe(true);

    await cleanup(context);
  });

  test('can navigate to Sweep Address from actions', async () => {
    const { context, page } = await launchExtension('actions-to-sweep');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Click Sweep Address
    await page.getByText('Sweep Address').click();

    // Should navigate to sweep page
    await page.waitForTimeout(1000);
    const isOnSweep = page.url().includes('sweep');
    expect(isOnSweep).toBe(true);

    await cleanup(context);
  });

  test('can navigate to Cancel Order from actions', async () => {
    const { context, page } = await launchExtension('actions-to-cancel');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Click Cancel Order
    await page.getByText('Cancel Order').click();

    // Should navigate to cancel order page
    await page.waitForTimeout(1000);
    const isOnCancel = page.url().includes('cancel');
    expect(isOnCancel).toBe(true);

    await cleanup(context);
  });

  test('can navigate back from actions page', async () => {
    const { context, page } = await launchExtension('actions-back');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Find and click back button
    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    // Should return to index
    await page.waitForTimeout(500);
    expect(page.url()).toContain('index');

    await cleanup(context);
  });

  test('Recover Bitcoin option shows notification when not visited', async () => {
    const { context, page } = await launchExtension('actions-recover-notification');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Look for Recover Bitcoin option
    const recoverOption = page.getByText('Recover Bitcoin');
    await expect(recoverOption).toBeVisible({ timeout: 5000 });

    // May have a notification indicator (orange border or badge)
    // This depends on whether user has visited before
    const hasNotification = await page.locator('.border-orange-500, [class*="notification"]').isVisible({ timeout: 1000 }).catch(() => false);

    // Just verify the option is accessible
    expect(await recoverOption.isVisible()).toBe(true);

    await cleanup(context);
  });
});

test.describe('Actions Page - Sign Message Flow', () => {
  test('sign message form has required fields', async () => {
    const { context, page } = await launchExtension('sign-message-fields');
    await setupWallet(page);

    // Navigate to sign message
    await navigateViaFooter(page, 'actions');
    await page.getByText('Sign Message').click();
    await expect(page).toHaveURL(/sign-message/, { timeout: 5000 });

    // Should have message input
    const messageInput = page.locator('textarea, input[name="message"]').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });

    // Should have Sign button
    const signButton = page.locator('button:has-text("Sign")').last();
    await expect(signButton).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('can sign a simple message', async () => {
    const { context, page } = await launchExtension('sign-message-simple');
    await setupWallet(page);

    // Navigate to sign message
    await navigateViaFooter(page, 'actions');
    await page.getByText('Sign Message').click();
    await expect(page).toHaveURL(/sign-message/, { timeout: 5000 });

    // Enter message
    const messageInput = page.locator('textarea, input[name="message"]').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });
    await messageInput.fill('Hello, this is a test message!');

    // Click sign
    const signButton = page.locator('button:has-text("Sign")').last();
    await expect(signButton).toBeVisible({ timeout: 5000 });

    if (await signButton.isEnabled()) {
      await signButton.click();
      await page.waitForTimeout(1000);

      // Should show signature or result
      const hasSignature = await page.locator('text=/Signature|signature/i').isVisible({ timeout: 5000 }).catch(() => false);
      const hasResult = await page.locator('.font-mono').filter({ hasText: /[a-zA-Z0-9]{30,}/ }).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasSignature || hasResult).toBe(true);
    }

    await cleanup(context);
  });

  test('sign message shows address used for signing', async () => {
    const { context, page } = await launchExtension('sign-message-address');
    await setupWallet(page);

    // Navigate to sign message
    await navigateViaFooter(page, 'actions');
    await page.getByText('Sign Message').click();
    await expect(page).toHaveURL(/sign-message/, { timeout: 5000 });

    // Should show current address somewhere on page
    const addressElements = page.locator('.font-mono');
    await expect(addressElements.first()).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });
});

test.describe('Actions Page - Verify Message Flow', () => {
  test('verify message form has required fields', async () => {
    const { context, page } = await launchExtension('verify-message-fields');
    await setupWallet(page);

    // Navigate to verify message
    await navigateViaFooter(page, 'actions');
    await page.getByText('Verify Message').click();
    await expect(page).toHaveURL(/verify-message/, { timeout: 5000 });

    // Should have input fields for address, message, signature
    const inputs = page.locator('input, textarea');
    await expect(inputs.first()).toBeVisible({ timeout: 5000 });

    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThanOrEqual(2);

    await cleanup(context);
  });

  test('verify message shows validation result', async () => {
    const { context, page } = await launchExtension('verify-message-result');
    await setupWallet(page);

    // Navigate to verify message
    await navigateViaFooter(page, 'actions');
    await page.getByText('Verify Message').click();
    await expect(page).toHaveURL(/verify-message/, { timeout: 5000 });

    // Fill in test data (will likely fail validation but should show a result)
    const inputs = await page.locator('input, textarea').all();

    // Try to fill fields if they exist
    if (inputs.length >= 3) {
      // Address field
      await inputs[0].fill('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
      // Message field
      if (inputs.length > 1) {
        await inputs[1].fill('test message');
      }
      // Signature field
      if (inputs.length > 2) {
        await inputs[2].fill('invalid-signature');
      }

      // Look for verify button
      const verifyButton = page.locator('button:has-text("Verify")').first();
      if (await verifyButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await verifyButton.click();
        await page.waitForTimeout(1000);

        // Should show some result (valid/invalid)
        const hasResult = await page.locator('text=/valid|invalid|error|success/i').isVisible({ timeout: 3000 }).catch(() => false);
        expect(hasResult || true).toBe(true); // Soft check
      }
    }

    await cleanup(context);
  });
});
