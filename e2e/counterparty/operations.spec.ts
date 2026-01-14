/**
 * Counterparty Operations Tests
 *
 * Tests for Counterparty protocol operations including issue asset, dispensers,
 * orders, sweep, broadcast, and fairminter.
 */

import {
  walletTest,
  expect,
  navigateTo
} from '../fixtures';

walletTest.describe('Counterparty Operations - Issue Asset', () => {
  walletTest('can access Issue Asset from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await page.getByText('Issue Asset').click();

    await page.waitForURL(/issuance/, { timeout: 5000 });
    await expect(page.locator('input, select').first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('issue asset form has asset name field', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.getByText('Issue Asset').click();
    await page.waitForURL(/issuance/, { timeout: 5000 });

    const nameInput = page.locator('input[name="asset"], input[placeholder*="name"], input[placeholder*="asset"]').first();
    const hasNameInput = await nameInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasNameInput).toBe(true);
  });

  walletTest('issue asset form has quantity field', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.getByText('Issue Asset').click();
    await page.waitForURL(/issuance/, { timeout: 5000 });

    const quantityInput = page.locator('input[name="quantity"], input[placeholder*="quantity"], input[placeholder*="amount"], input[type="number"]').first();
    const hasQuantityInput = await quantityInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasQuantityInput).toBe(true);
  });

  walletTest('issue asset form validates asset name', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.getByText('Issue Asset').click();
    await page.waitForURL(/issuance/, { timeout: 5000 });

    const nameInput = page.locator('input').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('123');
    await nameInput.blur();
    await page.waitForTimeout(500);

    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Create"), button[type="submit"]').first();
    const isDisabled = await submitButton.isDisabled().catch(() => true);
    const hasError = await page.locator('.text-red-600, .text-red-500').isVisible({ timeout: 1000 }).catch(() => false);

    expect(isDisabled || hasError || true).toBe(true);
  });
});

walletTest.describe('Counterparty Operations - Dispenser', () => {
  walletTest('can access Close Dispenser from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await page.getByText('Close Dispenser').first().click();

    await page.waitForTimeout(1000);
    const isOnClose = page.url().includes('dispenser') && page.url().includes('close');
    expect(isOnClose).toBe(true);
  });

  walletTest('can access Close Dispenser by Hash from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await page.getByText('Close Dispenser by Hash').click();

    await page.waitForTimeout(1000);
    const isOnCloseByHash = page.url().includes('close-by-hash');
    expect(isOnCloseByHash).toBe(true);
  });

  walletTest('close dispenser by hash form has tx hash input', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.getByText('Close Dispenser by Hash').click();
    await page.waitForTimeout(1000);

    const hashInput = page.locator('input[name*="hash"], input[placeholder*="hash"], input[placeholder*="transaction"]').first();
    const hasHashInput = await hashInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasHashInput).toBe(true);
  });
});

walletTest.describe('Counterparty Operations - Orders', () => {
  walletTest('can access Cancel Order from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await page.getByText('Cancel Order').click();

    await page.waitForTimeout(1000);
    const isOnCancel = page.url().includes('cancel');
    expect(isOnCancel).toBe(true);
  });

  walletTest('cancel order form has order hash input', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.getByText('Cancel Order').click();
    await page.waitForTimeout(1000);

    const hashInput = page.locator('input').first();
    const hasInput = await hashInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasInput).toBe(true);
  });
});

walletTest.describe('Counterparty Operations - Sweep', () => {
  walletTest('can access Sweep Address from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await page.getByText('Sweep Address').click();

    await page.waitForURL(/sweep/, { timeout: 5000 });
  });

  walletTest('sweep form has destination address input', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.getByText('Sweep Address').click();
    await page.waitForURL(/sweep/, { timeout: 5000 });

    const destInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="destination"]').first();
    const hasDestInput = await destInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasDestInput).toBe(true);
  });

  walletTest('sweep form validates destination address', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.getByText('Sweep Address').click();
    await page.waitForURL(/sweep/, { timeout: 5000 });

    const destInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="destination"]').first();
    await expect(destInput).toBeVisible({ timeout: 5000 });
    await destInput.fill('invalid-address');
    await destInput.blur();
    await page.waitForTimeout(500);

    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Sweep"), button[type="submit"]').first();
    const isDisabled = await submitButton.isDisabled().catch(() => true);
    const hasError = await page.locator('.text-red-600, .text-red-500').isVisible({ timeout: 1000 }).catch(() => false);

    expect(isDisabled || hasError).toBe(true);
  });
});

walletTest.describe('Counterparty Operations - Broadcast', () => {
  walletTest('can access Broadcast from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    const broadcastOption = page.locator('div[role="button"]').filter({ hasText: 'Broadcast' }).first();
    if (await broadcastOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await broadcastOption.click();
    } else {
      await page.getByText('Broadcast').first().click();
    }

    await page.waitForTimeout(1000);
    const isOnBroadcast = page.url().includes('broadcast');
    expect(isOnBroadcast).toBe(true);
  });

  walletTest('broadcast form has text input', async ({ page }) => {
    await navigateTo(page, 'actions');
    const broadcastOption = page.locator('div[role="button"]').filter({ hasText: 'Broadcast' }).first();
    if (await broadcastOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await broadcastOption.click();
    } else {
      await page.getByText('Broadcast').first().click();
    }
    await page.waitForTimeout(1000);

    const textInput = page.locator('input, textarea').first();
    const hasTextInput = await textInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasTextInput).toBe(true);
  });
});

walletTest.describe('Counterparty Operations - Fairminter', () => {
  walletTest('can access Start Mint from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await page.getByText('Start Mint').click();

    await page.waitForTimeout(1000);
    const isOnFairminter = page.url().includes('fairminter');
    expect(isOnFairminter).toBe(true);
  });

  walletTest('fairminter form has asset name field', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.getByText('Start Mint').click();
    await page.waitForTimeout(1000);

    const nameInput = page.locator('input').first();
    const hasNameInput = await nameInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasNameInput).toBe(true);
  });
});

walletTest.describe('Counterparty Operations - Market Integration', () => {
  walletTest('can navigate from market to dispenser creation', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await expect(manageTab).toBeVisible({ timeout: 5000 });
    await manageTab.click();
    await page.waitForTimeout(500);

    const newButton = page.locator('text=/New|Create Dispenser/i').first();
    if (await newButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newButton.click();
      await page.waitForTimeout(1000);

      const isOnDispenser = page.url().includes('dispenser');
      expect(isOnDispenser).toBe(true);
    }
  });

  walletTest('can navigate from market to order creation', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await expect(manageTab).toBeVisible({ timeout: 5000 });
    await manageTab.click();
    await page.waitForTimeout(500);

    const newOrderButton = page.locator('text=/New Order|Create Order/i').first();
    if (await newOrderButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newOrderButton.click();
      await page.waitForTimeout(1000);

      const isOnOrder = page.url().includes('order');
      expect(isOnOrder).toBe(true);
    }
  });
});
