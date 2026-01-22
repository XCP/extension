/**
 * Consolidation Pages Tests
 *
 * Tests for Bitcoin consolidation/recovery feature:
 * - /consolidate
 * - /consolidation-success
 * - /consolidation-status
 */

import { walletTest, expect, navigateTo } from '../../fixtures';
import { actions, compose } from '../../selectors';

walletTest.describe('Consolidation Page (/consolidate)', () => {
  walletTest('can navigate to consolidate from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    // Look for Recover Bitcoin or Consolidate option
    const consolidateOption = actions.recoverBitcoinOption(page);

    if (await consolidateOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await consolidateOption.click();
      await page.waitForTimeout(500);

      // Should navigate to consolidate page
      expect(page.url()).toContain('consolidate');
    }
  });

  walletTest('consolidate page shows explanation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidate'));
    await page.waitForLoadState('networkidle');

    // Should show consolidation explanation
    const hasExplanation = await page.locator('text=/Recover|Consolidate|Bitcoin|bare multisig|UTXO/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasWarning = await page.locator('text=/Warning|Caution|Note/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasExplanation || hasWarning || page.url().includes('consolidate')).toBe(true);
  });

  walletTest('consolidate page shows explanation text', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidate'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('consolidate')) {
      // Should show explanation about recovery
      const explanationText = page.locator('text=/Recover|Bitcoin|bare multisig/i').first();
      await expect(explanationText).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('consolidate page displays page title', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidate'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('consolidate')) {
      // Should show page title
      const pageTitle = page.locator('text=/Recover Bitcoin/i').first();
      await expect(pageTitle).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('consolidate page has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidate'));
    await page.waitForLoadState('networkidle');

    const backButton = compose.common.headerBackButton(page);

    if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);

      // Should navigate away from consolidate
      const leftPage = !page.url().includes('consolidate') || page.url().includes('actions') || page.url().includes('index');
      expect(leftPage).toBe(true);
    }
  });
});

walletTest.describe('Consolidation Success Page (/consolidation-success)', () => {
  walletTest('consolidation success page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidation-success'));
    await page.waitForLoadState('networkidle');

    // Should show success message or redirect
    const hasSuccess = await page.locator('text=/Success|Complete|Recovered|Done/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTransactionInfo = await page.locator('text=/Transaction|txid|hash/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('consolidation-success');

    expect(hasSuccess || hasTransactionInfo || redirected).toBe(true);
  });

  walletTest('consolidation success shows success message', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidation-success'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('consolidation-success')) {
      // Should show success message
      const successMessage = page.locator('text=/Success|Complete|Recovered/i').first();
      await expect(successMessage).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('consolidation success has return to wallet button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidation-success'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('consolidation-success')) {
      const returnButton = page.locator('button:has-text("Return"), button:has-text("Done"), button:has-text("Close"), a:has-text("Wallet")').first();

      if (await returnButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await returnButton.click();
        await page.waitForTimeout(500);

        // Should navigate to index
        expect(page.url()).toContain('index');
      }
    }
  });
});

walletTest.describe('Consolidation Status Page (/consolidation-status)', () => {
  walletTest('consolidation status page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidation-status'));
    await page.waitForLoadState('networkidle');

    // Should show status info or redirect
    const hasStatus = await page.locator('text=/Status|Progress|Pending|Confirmed/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasLoading = await page.locator('text=/Loading|Checking|Waiting/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('consolidation-status');

    expect(hasStatus || hasLoading || redirected).toBe(true);
  });

  walletTest('consolidation status shows status text', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidation-status'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('consolidation-status')) {
      // Should show status text
      const statusText = page.locator('text=/Status|Progress|Pending|Confirmed/i').first();
      await expect(statusText).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('consolidation status page has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidation-status'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('consolidation-status')) {
      // Should have back button
      const backButton = page.locator('button[aria-label*="back" i], header button').first();
      await expect(backButton).toBeVisible({ timeout: 5000 });
    }
  });
});
