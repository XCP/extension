/**
 * Trezor connect-page E2E tests.
 *
 * With Trezor Connect 10 the extension reaches a device only through Suite, so a device
 * connection is not tested here. The device itself is covered against the emulator by
 * trezor-node-integration.test.ts, and the Suite handshake by e2e/tests/trezor-connect-v10.spec.ts.
 * These run in the emulator workflow.
 */
import { test, expect, Page } from '@playwright/test';
import { launchExtension, cleanup, createWallet, TEST_PASSWORD } from '../fixtures';

// Check if emulator tests should run
const SKIP_EMULATOR_TESTS = process.env.TREZOR_EMULATOR_AVAILABLE !== '1';

/**
 * Helper to set up the extension with a wallet before accessing protected pages
 * The connect-hardware page requires authentication
 */
async function setupWalletForHardwareTest(page: Page): Promise<void> {
  // Wait for the page to fully load first
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  // Check current URL state - we might be on onboarding, unlock, or index
  const currentUrl = page.url();

  if (currentUrl.includes('/onboarding') || ((currentUrl.includes('popup.html') || currentUrl.includes('sidepanel.html')) && !currentUrl.includes('#'))) {
    // Need to wait for onboarding page content to appear
    const createButton = page.getByRole('button', { name: 'Create Wallet' });
    await createButton.waitFor({ state: 'visible', timeout: 15000 });
    await createWallet(page, TEST_PASSWORD);
  } else if (currentUrl.includes('/unlock')) {
    // Wallet exists but is locked - unlock it
    // Note: This shouldn't happen in fresh test contexts
    console.log('Unexpected state: wallet is locked');
  }

  // At this point, we should be at /index with wallet unlocked
  // Wait for the wallet context to fully settle
  await page.waitForURL(/index/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  // Wait for wallet content to appear (confirms auth state is UNLOCKED)
  // This ensures AuthRequired sees the proper state before navigation
  await page.waitForTimeout(500);
}

test.describe('Trezor Hardware Wallet', () => {
  // Skip all tests if emulator not available
  test.skip(SKIP_EMULATOR_TESTS, 'Trezor emulator not available');

  test('can navigate to connect hardware wallet page', async () => {
    const { context, page } = await launchExtension('trezor-nav', { useSidepanel: true });

    try {
      // First, create a wallet to get authenticated
      await setupWalletForHardwareTest(page);

      // Navigate to add-wallet page, then to connect-hardware
      const baseUrl = page.url().split('#')[0];
      await page.goto(`${baseUrl}#/keychain/wallets/add`);
      await page.waitForLoadState('networkidle');

      // Wait for the Add Wallet page to load by checking for the heading
      await expect(page.getByRole('heading', { name: 'Add Wallet' })).toBeVisible({ timeout: 10000 });

      // Debug: Log all visible buttons on the page
      const buttons = await page.getByRole('button').allTextContents();
      console.log('Visible buttons on add-wallet page:', buttons);

      // Check if the Trezor Connect button exists (button text is "Use Trezor Connect")
      const hardwareButton = page.getByRole('button', { name: /Use Trezor Connect/i });
      const hardwareButtonVisible = await hardwareButton.isVisible({ timeout: 5000 }).catch(() => false);

      if (!hardwareButtonVisible) {
        console.log('Use Trezor Connect button not found. Taking debug screenshot...');
        await page.screenshot({ path: 'test-results/screenshots/add-wallet-debug.png' });
        throw new Error('Use Trezor Connect button not visible. Available buttons: ' + buttons.join(', '));
      }

      // Click on Use Trezor Connect button
      await hardwareButton.click();
      await page.waitForLoadState('networkidle');

      // Should see the connect hardware page with discovery-based UI
      await expect(page.getByRole('heading', { name: 'Connect Your Trezor' })).toBeVisible({ timeout: 10000 });

      // Should see the prerequisite checklist
      await expect(page.getByText('Before connecting:')).toBeVisible();
      await expect(page.getByText('Connect your Trezor via USB')).toBeVisible();

      // Connect button should be visible
      await expect(page.getByRole('button', { name: /Connect Trezor/i })).toBeVisible();

      await page.screenshot({ path: 'test-results/screenshots/trezor-connect-page.png' });
    } finally {
      await cleanup(context);
    }
  });

  test('can see discovery-based connection UI', async () => {
    const { context, page } = await launchExtension('trezor-formats', { useSidepanel: true });

    try {
      await setupWalletForHardwareTest(page);

      const baseUrl = page.url().split('#')[0];
      await page.goto(`${baseUrl}#/keychain/wallets/connect-hardware`);
      await page.waitForLoadState('networkidle');

      // Wait for the connect hardware page to load (discovery-based UI)
      await expect(page.getByRole('heading', { name: 'Connect Your Trezor' })).toBeVisible({ timeout: 15000 });

      // Should see the prerequisite checklist
      await expect(page.getByText('Before connecting:')).toBeVisible();
      await expect(page.getByText('Connect your Trezor via USB')).toBeVisible();
      await expect(page.getByText('Unlock your device with PIN')).toBeVisible();
      await expect(page.getByText('Select your account when prompted')).toBeVisible();

      // Connect button should be visible
      await expect(page.getByRole('button', { name: /Connect Trezor/i })).toBeVisible();

      // Security note should be visible
      await expect(page.getByText('Your private keys never leave your Trezor device.')).toBeVisible();

      await page.screenshot({ path: 'test-results/screenshots/trezor-discovery-ui.png' });
    } finally {
      await cleanup(context);
    }
  });

  test('shows security messaging and help link', async () => {
    const { context, page } = await launchExtension('trezor-security', { useSidepanel: true });

    try {
      await setupWalletForHardwareTest(page);

      const baseUrl = page.url().split('#')[0];
      await page.goto(`${baseUrl}#/keychain/wallets/connect-hardware`);
      await page.waitForLoadState('networkidle');

      // Wait for the connect hardware page to load
      await expect(page.getByRole('heading', { name: 'Connect Your Trezor' })).toBeVisible({ timeout: 15000 });

      // Verify security messaging is present
      await expect(page.getByText('Your private keys never leave your Trezor device.')).toBeVisible();

      // Verify help button is in header
      const helpButton = page.getByRole('button', { name: /Help/i });
      await expect(helpButton).toBeVisible();

      // Verify the shield icon area is present (security visual indicator)
      const shieldIcon = page.locator('.bg-\\[\\#00854D\\]\\/10');
      await expect(shieldIcon).toBeVisible();

      await page.screenshot({ path: 'test-results/screenshots/trezor-security-ui.png' });
    } finally {
      await cleanup(context);
    }
  });
});
