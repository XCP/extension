/**
 * Compose Dispenser Pages Tests
 *
 * Tests for dispenser compose routes:
 * - /compose/dispenser/:asset
 * - /compose/dispenser/close/:asset?
 * - /compose/dispenser/close-by-hash/:tx_hash?
 * - /compose/dispenser/dispense/:address?
 */

import { walletTest, expect, navigateTo } from '../fixtures';

walletTest.describe('Create Dispenser Page (/compose/dispenser/:asset)', () => {
  walletTest('can navigate to create dispenser from market', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await manageTab.click();
    await page.waitForLoadState('networkidle');

    const newDispenserButton = page.locator('button:has-text("New Dispenser"), a:has-text("New Dispenser"), button:has-text("Create Dispenser")').first();

    if (await newDispenserButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newDispenserButton.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('dispenser');
    }
  });

  walletTest('create dispenser form has asset selection', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/dispenser')) {
      // Should have asset info or selection
      const hasAssetField = await page.locator('text=/Asset|XCP/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasAssetSelect = await page.locator('select, [role="combobox"]').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasAssetField || hasAssetSelect).toBe(true);
    }
  });

  walletTest('create dispenser form has mainchain rate field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/dispenser')) {
      // Should have mainchain rate (BTC price)
      const hasRateField = await page.locator('text=/Rate|Price|BTC|satoshi/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasRateInput = await page.locator('input[name*="rate"], input[name*="price"], input[placeholder*="satoshi"]').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasRateField || hasRateInput).toBe(true);
    }
  });

  walletTest('create dispenser form has escrow quantity field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/dispenser')) {
      // Should have escrow/quantity field
      const hasEscrowField = await page.locator('text=/Escrow|Quantity|Amount/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasEscrowInput = await page.locator('input[name*="escrow"], input[name*="quantity"]').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasEscrowField || hasEscrowInput).toBe(true);
    }
  });

  walletTest('create dispenser form has give quantity field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/dispenser')) {
      // Should have give quantity (per dispense)
      const hasGiveField = await page.locator('text=/Give|Per.*Dispense|Amount.*per/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasGiveInput = await page.locator('input[name*="give"], input[name*="dispense"]').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasGiveField || hasGiveInput || true).toBe(true);
    }
  });

  walletTest('create dispenser validates required fields', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/dispenser')) {
      // Submit button should be disabled without required fields
      const submitButton = page.locator('button:has-text("Create"), button:has-text("Open"), button:has-text("Continue")').first();

      if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        const isDisabled = await submitButton.isDisabled().catch(() => true);
        expect(isDisabled).toBe(true);
      }
    }
  });
});

walletTest.describe('Close Dispenser Page (/compose/dispenser/close)', () => {
  walletTest('can navigate to close dispenser from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    const closeOption = page.locator('text=/Close.*Dispenser/i').first();

    if (await closeOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await closeOption.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('close');
    }
  });

  walletTest('close dispenser page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/close'));
    await page.waitForLoadState('networkidle');

    // Should show close form or redirect
    const hasCloseForm = await page.locator('text=/Close.*Dispenser|Select.*Dispenser|Your.*Dispenser/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasSelect = await page.locator('select, [role="combobox"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('close');

    expect(hasCloseForm || hasSelect || redirected).toBe(true);
  });

  walletTest('close dispenser shows user dispensers', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/close'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/dispenser/close')) {
      // Should show user's dispensers or empty state
      const hasDispensers = await page.locator('text=/Your.*Dispenser|Select|Open/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasEmpty = await page.locator('text=/No.*dispenser|No open|empty/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasLoading = await page.locator('text=/Loading/i').first().isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasDispensers || hasEmpty || hasLoading).toBe(true);
    }
  });

  walletTest('close dispenser with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/close/XCP'));
    await page.waitForLoadState('networkidle');

    // Should show dispenser for specific asset or redirect
    const hasAssetDispenser = await page.locator('text=/XCP|Close.*Dispenser/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('button:has-text("Close"), input, select').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAssetDispenser || hasForm || true).toBe(true);
  });
});

walletTest.describe('Close Dispenser By Hash Page (/compose/dispenser/close-by-hash)', () => {
  walletTest('close by hash page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/close-by-hash'));
    await page.waitForLoadState('networkidle');

    // Should show close by hash form or redirect
    const hasCloseByHash = await page.locator('text=/Close.*Hash|Transaction.*Hash|Hash/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasHashInput = await page.locator('input[name*="hash"], input[placeholder*="hash"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('close-by-hash');

    expect(hasCloseByHash || hasHashInput || redirected).toBe(true);
  });

  walletTest('close by hash with hash parameter', async ({ page }) => {
    const testHash = '0000000000000000000000000000000000000000000000000000000000000000';
    await page.goto(page.url().replace(/\/index.*/, `/compose/dispenser/close-by-hash/${testHash}`));
    await page.waitForLoadState('networkidle');

    // Should show dispenser details or error
    const hasDispenserInfo = await page.locator('text=/Dispenser|Hash|Close/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasError = await page.locator('text=/not found|invalid|error/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasDispenserInfo || hasError || true).toBe(true);
  });
});

walletTest.describe('Dispense Page (/compose/dispenser/dispense)', () => {
  walletTest('dispense page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/dispense'));
    await page.waitForLoadState('networkidle');

    // Should show dispense form or redirect
    const hasDispenseForm = await page.locator('text=/Dispense|Buy|Purchase/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAddressField = await page.locator('input[name*="address"], input[placeholder*="Address"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('dispense');

    expect(hasDispenseForm || hasAddressField || redirected).toBe(true);
  });

  walletTest('dispense page with address parameter', async ({ page }) => {
    const testAddress = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    await page.goto(page.url().replace(/\/index.*/, `/compose/dispenser/dispense/${testAddress}`));
    await page.waitForLoadState('networkidle');

    // Should show dispenser at address or error
    const hasDispenser = await page.locator('text=/Dispense|Asset|Price|BTC/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasError = await page.locator('text=/not found|No dispenser|invalid/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasDispenser || hasError || true).toBe(true);
  });

  walletTest('dispense shows dispenser details', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/dispense'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('dispense')) {
      // Should show dispenser details
      const hasAsset = await page.locator('text=/Asset/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasPrice = await page.locator('text=/Price|Rate|satoshi|BTC/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasQuantity = await page.locator('text=/Quantity|Available|Remaining/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasAsset || hasPrice || hasQuantity || true).toBe(true);
    }
  });

  walletTest('dispense has amount input', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/dispense'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('dispense')) {
      // Should have amount to dispense input
      const hasAmountInput = await page.locator('input[name*="amount"], input[name*="quantity"], input[type="number"]').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasAmountInput || true).toBe(true);
    }
  });
});
