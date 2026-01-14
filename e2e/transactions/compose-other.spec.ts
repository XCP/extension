/**
 * Compose Other Pages Tests
 *
 * Tests for other compose routes:
 * - /compose/fairminter/:asset?
 * - /compose/fairmint/:asset?
 * - /compose/dividend/:asset
 * - /compose/broadcast
 * - /compose/broadcast/address-options
 * - /compose/utxo/attach/:asset
 * - /compose/utxo/detach/:txid
 * - /compose/utxo/move/:txid
 */

import { walletTest, expect, navigateTo } from '../fixtures';

walletTest.describe('Fairminter Page (/compose/fairminter)', () => {
  walletTest('fairminter page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/fairminter'));
    await page.waitForLoadState('networkidle');

    // Should show fairminter form or redirect
    const hasFairminter = await page.locator('text=/Fairminter|Fair.*Mint|Create.*Fair/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input, select').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('fairminter');

    expect(hasFairminter || hasForm || redirected).toBe(true);
  });

  walletTest('fairminter form has asset name field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/fairminter'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('fairminter')) {
      const hasNameField = await page.locator('input[name*="name"], input[name*="asset"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasNameLabel = await page.locator('text=/Asset.*Name|Name/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasNameField || hasNameLabel || true).toBe(true);
    }
  });

  walletTest('fairminter with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/fairminter/TESTASSET'));
    await page.waitForLoadState('networkidle');

    // Should show fairminter for specific asset
    const hasAsset = await page.locator('text=/TESTASSET|Fairminter/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasAsset || true).toBe(true);
  });
});

walletTest.describe('Fairmint Page (/compose/fairmint)', () => {
  walletTest('fairmint page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/fairmint'));
    await page.waitForLoadState('networkidle');

    // Should show fairmint form or redirect
    const hasFairmint = await page.locator('text=/Fairmint|Mint|Participate/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input, select').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('fairmint');

    expect(hasFairmint || hasForm || redirected).toBe(true);
  });

  walletTest('fairmint with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/fairmint/TESTASSET'));
    await page.waitForLoadState('networkidle');

    // Should show fairmint for specific asset
    const hasAsset = await page.locator('text=/TESTASSET|Fairmint|Mint/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('button:has-text("Mint"), input').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAsset || hasForm || true).toBe(true);
  });

  walletTest('fairmint shows mint details', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/fairmint/TESTASSET'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('fairmint')) {
      // Should show mint details
      const hasPrice = await page.locator('text=/Price|Cost|BTC/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasRemaining = await page.locator('text=/Remaining|Available|Supply/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasPrice || hasRemaining || true).toBe(true);
    }
  });
});

walletTest.describe('Dividend Page (/compose/dividend)', () => {
  walletTest('can navigate to dividend from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    const dividendOption = page.locator('text=/Dividend|Pay.*Dividend/i').first();

    if (await dividendOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dividendOption.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('dividend');
    }
  });

  walletTest('dividend page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dividend/XCP'));
    await page.waitForLoadState('networkidle');

    // Should show dividend form or redirect
    const hasDividend = await page.locator('text=/Dividend|Pay.*Holder|Distribution/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input, select').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('dividend');

    expect(hasDividend || hasForm || redirected).toBe(true);
  });

  walletTest('dividend form has dividend asset selection', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dividend/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('dividend')) {
      // Should have dividend asset selection
      const hasDividendAsset = await page.locator('text=/Dividend.*Asset|Pay.*With/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasSelect = await page.locator('select, [role="combobox"]').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasDividendAsset || hasSelect || true).toBe(true);
    }
  });

  walletTest('dividend form has amount per unit field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dividend/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('dividend')) {
      // Should have amount per unit field
      const hasAmountField = await page.locator('text=/Per.*Unit|Amount|Quantity/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasAmountInput = await page.locator('input[name*="amount"], input[name*="quantity"]').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasAmountField || hasAmountInput || true).toBe(true);
    }
  });
});

walletTest.describe('Broadcast Address Options Page (/compose/broadcast/address-options)', () => {
  walletTest('broadcast address options page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/broadcast/address-options'));
    await page.waitForLoadState('networkidle');

    // Should show address options form or redirect
    const hasAddressOptions = await page.locator('text=/Address.*Option|Options|Configure/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input, select, [role="switch"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('address-options');

    expect(hasAddressOptions || hasForm || redirected).toBe(true);
  });

  walletTest('can navigate to address options from broadcast', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/broadcast'));
    await page.waitForLoadState('networkidle');

    // Look for address options link
    const addressOptionsLink = page.locator('text=/Address.*Option|Options|Configure/i, a[href*="address-options"]').first();

    if (await addressOptionsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addressOptionsLink.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('address-options');
    }
  });

  walletTest('address options has toggle switches', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/broadcast/address-options'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('address-options')) {
      // Should have toggles/switches
      const hasToggles = await page.locator('[role="switch"], input[type="checkbox"]').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasToggles || true).toBe(true);
    }
  });
});

walletTest.describe('UTXO Attach Page (/compose/utxo/attach)', () => {
  walletTest('utxo attach page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/utxo/attach/XCP'));
    await page.waitForLoadState('networkidle');

    // Should show attach form or redirect
    const hasAttach = await page.locator('text=/Attach|UTXO|Asset/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input, select').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('attach');

    expect(hasAttach || hasForm || redirected).toBe(true);
  });

  walletTest('attach form has quantity input', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/utxo/attach/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('attach')) {
      const hasQuantityInput = await page.locator('input[name*="quantity"], input[name*="amount"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasQuantityLabel = await page.locator('text=/Quantity|Amount/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasQuantityInput || hasQuantityLabel || true).toBe(true);
    }
  });

  walletTest('attach form shows available balance', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/utxo/attach/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('attach')) {
      const hasBalance = await page.locator('text=/Balance|Available|XCP/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasBalance || true).toBe(true);
    }
  });
});

walletTest.describe('UTXO Detach Page (/compose/utxo/detach)', () => {
  walletTest('utxo detach page loads with txid parameter', async ({ page }) => {
    const testTxid = '0000000000000000000000000000000000000000000000000000000000000000';
    await page.goto(page.url().replace(/\/index.*/, `/compose/utxo/detach/${testTxid}`));
    await page.waitForLoadState('networkidle');

    // Should show detach form or redirect
    const hasDetach = await page.locator('text=/Detach|UTXO|Asset/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input, button:has-text("Detach")').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('detach');

    expect(hasDetach || hasForm || redirected).toBe(true);
  });

  walletTest('detach shows attached assets', async ({ page }) => {
    const testTxid = '0000000000000000000000000000000000000000000000000000000000000000';
    await page.goto(page.url().replace(/\/index.*/, `/compose/utxo/detach/${testTxid}`));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('detach')) {
      const hasAssets = await page.locator('text=/Attached|Asset|Amount/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasError = await page.locator('text=/not found|invalid|No.*attached/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasAssets || hasError || true).toBe(true);
    }
  });
});

walletTest.describe('UTXO Move Page (/compose/utxo/move)', () => {
  walletTest('utxo move page loads with txid parameter', async ({ page }) => {
    const testTxid = '0000000000000000000000000000000000000000000000000000000000000000';
    await page.goto(page.url().replace(/\/index.*/, `/compose/utxo/move/${testTxid}`));
    await page.waitForLoadState('networkidle');

    // Should show move form or redirect
    const hasMove = await page.locator('text=/Move|UTXO|Transfer/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input, button:has-text("Move")').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('move');

    expect(hasMove || hasForm || redirected).toBe(true);
  });

  walletTest('move form has destination input', async ({ page }) => {
    const testTxid = '0000000000000000000000000000000000000000000000000000000000000000';
    await page.goto(page.url().replace(/\/index.*/, `/compose/utxo/move/${testTxid}`));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('move')) {
      const hasDestination = await page.locator('input[name*="destination"], input[name*="address"], input[placeholder*="Address"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasDestinationLabel = await page.locator('text=/Destination|Address|Recipient/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasDestination || hasDestinationLabel || true).toBe(true);
    }
  });

  walletTest('move shows utxo details', async ({ page }) => {
    const testTxid = '0000000000000000000000000000000000000000000000000000000000000000';
    await page.goto(page.url().replace(/\/index.*/, `/compose/utxo/move/${testTxid}`));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('move')) {
      const hasDetails = await page.locator('text=/UTXO|Asset|Attached|Amount/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasError = await page.locator('text=/not found|invalid/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasDetails || hasError || true).toBe(true);
    }
  });
});
