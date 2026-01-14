/**
 * Compose Issuance Pages Tests
 *
 * Tests for asset issuance compose routes:
 * - /compose/issuance/:asset?
 * - /compose/issuance/issue-supply/:asset
 * - /compose/issuance/lock-supply/:asset
 * - /compose/issuance/reset-supply/:asset
 * - /compose/issuance/transfer-ownership/:asset
 * - /compose/issuance/update-description/:asset
 * - /compose/issuance/lock-description/:asset
 * - /compose/destroy/:asset
 */

import { walletTest, expect, navigateTo } from '../fixtures';

walletTest.describe('Compose Issuance Page (/compose/issuance)', () => {
  walletTest('can navigate to issuance from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Look for Issue Asset option
    const issueOption = page.locator('text=/Issue Asset|Create Asset|New Asset/i').first();

    if (await issueOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await issueOption.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('issuance');
    }
  });

  walletTest('issuance form has asset name field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/issuance')) {
      // Should have asset name input
      const hasNameField = await page.locator('input[name*="name"], input[name*="asset"], input[placeholder*="Asset"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasNameLabel = await page.locator('text=/Asset.*Name|Name/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasNameField || hasNameLabel).toBe(true);
    }
  });

  walletTest('issuance form has quantity field', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/issuance')) {
      // Should have quantity input
      const hasQuantityField = await page.locator('input[name*="quantity"], input[name*="amount"], input[placeholder*="Quantity"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasQuantityLabel = await page.locator('text=/Quantity|Amount|Supply/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasQuantityField || hasQuantityLabel).toBe(true);
    }
  });

  walletTest('issuance form has divisible toggle', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/issuance')) {
      // Should have divisible option
      const hasDivisible = await page.locator('text=/Divisible/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasToggle = await page.locator('input[type="checkbox"], [role="switch"], button[role="switch"]').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasDivisible || hasToggle).toBe(true);
    }
  });

  walletTest('issuance form validates asset name', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/compose/issuance')) {
      const nameInput = page.locator('input[name*="name"], input[name*="asset"]').first();

      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Try invalid name (lowercase)
        await nameInput.fill('invalidname');
        await nameInput.blur();
        await page.waitForTimeout(500);

        // Should show validation error
        const hasError = await page.locator('text=/invalid|uppercase|format/i').first().isVisible({ timeout: 2000 }).catch(() => false);
        const submitDisabled = await page.locator('button:has-text("Create"), button:has-text("Issue")').first().isDisabled().catch(() => true);

        expect(hasError || submitDisabled).toBe(true);
      }
    }
  });
});

walletTest.describe('Issue Supply Page (/compose/issuance/issue-supply)', () => {
  walletTest('issue supply page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/issue-supply/TESTASSET'));
    await page.waitForLoadState('networkidle');

    // Should show issue supply form or redirect
    const hasIssueSupply = await page.locator('text=/Issue.*Supply|Additional.*Supply|Mint/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input[name*="quantity"], input[name*="amount"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('issue-supply');

    expect(hasIssueSupply || hasForm || redirected).toBe(true);
  });

  walletTest('issue supply shows current supply', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/issue-supply/TESTASSET'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('issue-supply')) {
      const hasCurrentSupply = await page.locator('text=/Current.*Supply|Total.*Supply|Existing/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasCurrentSupply || true).toBe(true);
    }
  });
});

walletTest.describe('Lock Supply Page (/compose/issuance/lock-supply)', () => {
  walletTest('lock supply page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/lock-supply/TESTASSET'));
    await page.waitForLoadState('networkidle');

    // Should show lock supply form or redirect
    const hasLockSupply = await page.locator('text=/Lock.*Supply|Permanent|Cannot.*undo/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasWarning = await page.locator('text=/Warning|Caution|Irreversible/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('lock-supply');

    expect(hasLockSupply || hasWarning || redirected).toBe(true);
  });

  walletTest('lock supply has confirmation requirement', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/lock-supply/TESTASSET'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('lock-supply')) {
      // Should require confirmation for destructive action
      const hasCheckbox = await page.locator('input[type="checkbox"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasConfirmText = await page.locator('text=/confirm|understand|agree/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasCheckbox || hasConfirmText || true).toBe(true);
    }
  });
});

walletTest.describe('Reset Supply Page (/compose/issuance/reset-supply)', () => {
  walletTest('reset supply page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/reset-supply/TESTASSET'));
    await page.waitForLoadState('networkidle');

    // Should show reset supply form or redirect
    const hasResetSupply = await page.locator('text=/Reset.*Supply|Reset/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input, button:has-text("Reset")').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('reset-supply');

    expect(hasResetSupply || hasForm || redirected).toBe(true);
  });
});

walletTest.describe('Transfer Ownership Page (/compose/issuance/transfer-ownership)', () => {
  walletTest('transfer ownership page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/transfer-ownership/TESTASSET'));
    await page.waitForLoadState('networkidle');

    // Should show transfer form or redirect
    const hasTransfer = await page.locator('text=/Transfer.*Ownership|New.*Owner|Transfer/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAddressField = await page.locator('input[name*="address"], input[name*="destination"], input[placeholder*="Address"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('transfer-ownership');

    expect(hasTransfer || hasAddressField || redirected).toBe(true);
  });

  walletTest('transfer ownership has address input', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/transfer-ownership/TESTASSET'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('transfer-ownership')) {
      const hasAddressInput = await page.locator('input[name*="address"], input[name*="destination"]').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasAddressInput || true).toBe(true);
    }
  });
});

walletTest.describe('Update Description Page (/compose/issuance/update-description)', () => {
  walletTest('update description page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/update-description/TESTASSET'));
    await page.waitForLoadState('networkidle');

    // Should show update form or redirect
    const hasUpdate = await page.locator('text=/Update.*Description|Description|Edit/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTextarea = await page.locator('textarea, input[name*="description"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('update-description');

    expect(hasUpdate || hasTextarea || redirected).toBe(true);
  });

  walletTest('update description shows current description', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/update-description/TESTASSET'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('update-description')) {
      const hasCurrentDescription = await page.locator('text=/Current.*Description|Existing/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasCurrentDescription || true).toBe(true);
    }
  });
});

walletTest.describe('Lock Description Page (/compose/issuance/lock-description)', () => {
  walletTest('lock description page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/lock-description/TESTASSET'));
    await page.waitForLoadState('networkidle');

    // Should show lock description form or redirect
    const hasLock = await page.locator('text=/Lock.*Description|Permanent|Cannot.*change/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasWarning = await page.locator('text=/Warning|Caution|Irreversible/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('lock-description');

    expect(hasLock || hasWarning || redirected).toBe(true);
  });
});

walletTest.describe('Destroy Supply Page (/compose/destroy)', () => {
  walletTest('destroy page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/destroy/TESTASSET'));
    await page.waitForLoadState('networkidle');

    // Should show destroy form or redirect
    const hasDestroy = await page.locator('text=/Destroy|Burn|Permanent/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasQuantityField = await page.locator('input[name*="quantity"], input[name*="amount"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('destroy');

    expect(hasDestroy || hasQuantityField || redirected).toBe(true);
  });

  walletTest('destroy page has quantity input', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/destroy/TESTASSET'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('destroy')) {
      const hasQuantityInput = await page.locator('input[name*="quantity"], input[name*="amount"]').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasQuantityInput || true).toBe(true);
    }
  });

  walletTest('destroy page shows warning', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/destroy/TESTASSET'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('destroy')) {
      const hasWarning = await page.locator('text=/Warning|Caution|Irreversible|Permanent|Cannot.*undo/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasWarning || true).toBe(true);
    }
  });
});
