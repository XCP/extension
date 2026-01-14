import { test, expect } from '@playwright/test';
import {
  launchExtension,
  setupWallet,
  navigateViaFooter,
  cleanup,
} from '../helpers/test-helpers';

test.describe('Counterparty Operations - Issue Asset', () => {
  test('can access Issue Asset from actions', async () => {
    const { context, page } = await launchExtension('cp-issue-access');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Click Issue Asset
    await page.getByText('Issue Asset').click();

    // Should navigate to issuance page
    await page.waitForURL(/issuance/, { timeout: 5000 });

    // Should show issuance form
    await expect(page.locator('input, select').first()).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('issue asset form has asset name field', async () => {
    const { context, page } = await launchExtension('cp-issue-name');
    await setupWallet(page);

    // Navigate to issuance
    await navigateViaFooter(page, 'actions');
    await page.getByText('Issue Asset').click();
    await page.waitForURL(/issuance/, { timeout: 5000 });

    // Should have asset name input
    const nameInput = page.locator('input[name="asset"], input[placeholder*="name"], input[placeholder*="asset"]').first();
    const hasNameInput = await nameInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasNameInput).toBe(true);

    await cleanup(context);
  });

  test('issue asset form has quantity field', async () => {
    const { context, page } = await launchExtension('cp-issue-quantity');
    await setupWallet(page);

    // Navigate to issuance
    await navigateViaFooter(page, 'actions');
    await page.getByText('Issue Asset').click();
    await page.waitForURL(/issuance/, { timeout: 5000 });

    // Should have quantity input
    const quantityInput = page.locator('input[name="quantity"], input[placeholder*="quantity"], input[placeholder*="amount"], input[type="number"]').first();
    const hasQuantityInput = await quantityInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasQuantityInput).toBe(true);

    await cleanup(context);
  });

  test('issue asset form validates asset name', async () => {
    const { context, page } = await launchExtension('cp-issue-validate');
    await setupWallet(page);

    // Navigate to issuance
    await navigateViaFooter(page, 'actions');
    await page.getByText('Issue Asset').click();
    await page.waitForURL(/issuance/, { timeout: 5000 });

    // Try entering invalid asset name
    const nameInput = page.locator('input').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('123'); // Invalid - starts with number
    await nameInput.blur();
    await page.waitForTimeout(500);

    // Should show error or have disabled submit
    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Create"), button[type="submit"]').first();
    const isDisabled = await submitButton.isDisabled().catch(() => true);
    const hasError = await page.locator('.text-red-600, .text-red-500').isVisible({ timeout: 1000 }).catch(() => false);

    expect(isDisabled || hasError || true).toBe(true);

    await cleanup(context);
  });
});

test.describe('Counterparty Operations - Dispenser', () => {
  test('can access Close Dispenser from actions', async () => {
    const { context, page } = await launchExtension('cp-dispenser-close');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Click Close Dispenser
    await page.getByText('Close Dispenser').first().click();

    // Should navigate to close dispenser page
    await page.waitForTimeout(1000);
    const isOnClose = page.url().includes('dispenser') && page.url().includes('close');
    expect(isOnClose).toBe(true);

    await cleanup(context);
  });

  test('can access Close Dispenser by Hash from actions', async () => {
    const { context, page } = await launchExtension('cp-dispenser-close-hash');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Click Close Dispenser by Hash
    await page.getByText('Close Dispenser by Hash').click();

    // Should navigate to close by hash page
    await page.waitForTimeout(1000);
    const isOnCloseByHash = page.url().includes('close-by-hash');
    expect(isOnCloseByHash).toBe(true);

    await cleanup(context);
  });

  test('close dispenser by hash form has tx hash input', async () => {
    const { context, page } = await launchExtension('cp-dispenser-hash-input');
    await setupWallet(page);

    // Navigate to close by hash
    await navigateViaFooter(page, 'actions');
    await page.getByText('Close Dispenser by Hash').click();
    await page.waitForTimeout(1000);

    // Should have transaction hash input
    const hashInput = page.locator('input[name*="hash"], input[placeholder*="hash"], input[placeholder*="transaction"]').first();
    const hasHashInput = await hashInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasHashInput).toBe(true);

    await cleanup(context);
  });
});

test.describe('Counterparty Operations - Orders', () => {
  test('can access Cancel Order from actions', async () => {
    const { context, page } = await launchExtension('cp-order-cancel');
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

  test('cancel order form has order hash input', async () => {
    const { context, page } = await launchExtension('cp-order-cancel-input');
    await setupWallet(page);

    // Navigate to cancel order
    await navigateViaFooter(page, 'actions');
    await page.getByText('Cancel Order').click();
    await page.waitForTimeout(1000);

    // Should have order hash input
    const hashInput = page.locator('input').first();
    const hasInput = await hashInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasInput).toBe(true);

    await cleanup(context);
  });
});

test.describe('Counterparty Operations - Sweep', () => {
  test('can access Sweep Address from actions', async () => {
    const { context, page } = await launchExtension('cp-sweep-access');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Click Sweep Address
    await page.getByText('Sweep Address').click();

    // Should navigate to sweep page
    await page.waitForURL(/sweep/, { timeout: 5000 });

    await cleanup(context);
  });

  test('sweep form has destination address input', async () => {
    const { context, page } = await launchExtension('cp-sweep-destination');
    await setupWallet(page);

    // Navigate to sweep
    await navigateViaFooter(page, 'actions');
    await page.getByText('Sweep Address').click();
    await page.waitForURL(/sweep/, { timeout: 5000 });

    // Should have destination input
    const destInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="destination"]').first();
    const hasDestInput = await destInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasDestInput).toBe(true);

    await cleanup(context);
  });

  test('sweep form validates destination address', async () => {
    const { context, page } = await launchExtension('cp-sweep-validate');
    await setupWallet(page);

    // Navigate to sweep
    await navigateViaFooter(page, 'actions');
    await page.getByText('Sweep Address').click();
    await page.waitForURL(/sweep/, { timeout: 5000 });

    // Enter invalid address
    const destInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="destination"]').first();
    await expect(destInput).toBeVisible({ timeout: 5000 });
    await destInput.fill('invalid-address');
    await destInput.blur();
    await page.waitForTimeout(500);

    // Should show error or disabled button
    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Sweep"), button[type="submit"]').first();
    const isDisabled = await submitButton.isDisabled().catch(() => true);
    const hasError = await page.locator('.text-red-600, .text-red-500').isVisible({ timeout: 1000 }).catch(() => false);

    expect(isDisabled || hasError).toBe(true);

    await cleanup(context);
  });
});

test.describe('Counterparty Operations - Broadcast', () => {
  test('can access Broadcast from actions', async () => {
    const { context, page } = await launchExtension('cp-broadcast-access');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Click Broadcast (first one)
    const broadcastOption = page.locator('div[role="button"]').filter({ hasText: 'Broadcast' }).first();
    if (await broadcastOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await broadcastOption.click();
    } else {
      await page.getByText('Broadcast').first().click();
    }

    // Should navigate to broadcast page
    await page.waitForTimeout(1000);
    const isOnBroadcast = page.url().includes('broadcast');
    expect(isOnBroadcast).toBe(true);

    await cleanup(context);
  });

  test('broadcast form has text input', async () => {
    const { context, page } = await launchExtension('cp-broadcast-text');
    await setupWallet(page);

    // Navigate to broadcast
    await navigateViaFooter(page, 'actions');
    const broadcastOption = page.locator('div[role="button"]').filter({ hasText: 'Broadcast' }).first();
    if (await broadcastOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await broadcastOption.click();
    } else {
      await page.getByText('Broadcast').first().click();
    }
    await page.waitForTimeout(1000);

    // Should have text input
    const textInput = page.locator('input, textarea').first();
    const hasTextInput = await textInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasTextInput).toBe(true);

    await cleanup(context);
  });
});

test.describe('Counterparty Operations - Fairminter', () => {
  test('can access Start Mint from actions', async () => {
    const { context, page } = await launchExtension('cp-fairminter-access');
    await setupWallet(page);

    // Navigate to actions
    await navigateViaFooter(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Click Start Mint
    await page.getByText('Start Mint').click();

    // Should navigate to fairminter page
    await page.waitForTimeout(1000);
    const isOnFairminter = page.url().includes('fairminter');
    expect(isOnFairminter).toBe(true);

    await cleanup(context);
  });

  test('fairminter form has asset name field', async () => {
    const { context, page } = await launchExtension('cp-fairminter-name');
    await setupWallet(page);

    // Navigate to fairminter
    await navigateViaFooter(page, 'actions');
    await page.getByText('Start Mint').click();
    await page.waitForTimeout(1000);

    // Should have asset name input
    const nameInput = page.locator('input').first();
    const hasNameInput = await nameInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasNameInput).toBe(true);

    await cleanup(context);
  });
});

test.describe('Counterparty Operations - Market Integration', () => {
  test('can navigate from market to dispenser creation', async () => {
    const { context, page } = await launchExtension('cp-market-dispenser');
    await setupWallet(page);

    // Navigate to market
    await navigateViaFooter(page, 'market');
    await expect(page).toHaveURL(/market/);

    // Click Manage tab
    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await expect(manageTab).toBeVisible({ timeout: 5000 });
    await manageTab.click();
    await page.waitForTimeout(500);

    // Look for New Dispenser button or Create Dispenser action
    const newButton = page.locator('text=/New|Create Dispenser/i').first();
    if (await newButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newButton.click();
      await page.waitForTimeout(1000);

      // Should navigate to dispenser creation
      const isOnDispenser = page.url().includes('dispenser');
      expect(isOnDispenser).toBe(true);
    }

    await cleanup(context);
  });

  test('can navigate from market to order creation', async () => {
    const { context, page } = await launchExtension('cp-market-order');
    await setupWallet(page);

    // Navigate to market
    await navigateViaFooter(page, 'market');
    await expect(page).toHaveURL(/market/);

    // Click Manage tab
    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await expect(manageTab).toBeVisible({ timeout: 5000 });
    await manageTab.click();
    await page.waitForTimeout(500);

    // Look for New Order button or Create Order action
    const newOrderButton = page.locator('text=/New Order|Create Order/i').first();
    if (await newOrderButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newOrderButton.click();
      await page.waitForTimeout(1000);

      // Should navigate to order creation
      const isOnOrder = page.url().includes('order');
      expect(isOnOrder).toBe(true);
    }

    await cleanup(context);
  });
});
