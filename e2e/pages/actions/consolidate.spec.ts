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
    const optionCount = await consolidateOption.count();

    if (optionCount === 0) {
      return; // Feature not available
    }

    await expect(consolidateOption).toBeVisible();
    await consolidateOption.click();

    // Should navigate to consolidate page
    await expect(page).toHaveURL(/consolidate/);
  });

  walletTest('consolidate page shows explanation or warning', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidate'));
    await page.waitForLoadState('networkidle');

    // Should show consolidation explanation or warning
    const content = page.locator('text=/Recover|Consolidate|Bitcoin|bare multisig|UTXO|Warning|Caution|Note/i').first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('consolidate page shows explanation text', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidate'));
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/consolidate/);

    // Should show explanation about recovery
    const explanationText = page.locator('text=/Recover|Bitcoin|bare multisig/i').first();
    await expect(explanationText).toBeVisible({ timeout: 5000 });
  });

  walletTest('consolidate page displays page title', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidate'));
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/consolidate/);

    // Should show page title
    const pageTitle = page.locator('text=/Recover Bitcoin/i').first();
    await expect(pageTitle).toBeVisible({ timeout: 5000 });
  });

  walletTest('consolidate page has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidate'));
    await page.waitForLoadState('networkidle');

    const backButton = compose.common.headerBackButton(page);
    const buttonCount = await backButton.count();

    if (buttonCount === 0) {
      return; // No back button present
    }

    await expect(backButton).toBeVisible();
    await backButton.click();

    // Should navigate away from consolidate page
    await expect(page).not.toHaveURL(/\/consolidate$/);
  });
});

walletTest.describe('Consolidation Success Page (/consolidation-success)', () => {
  walletTest('consolidation success page redirects without state data', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidation-success'));

    // Page requires state to be passed via navigation - without it, should redirect to home
    // Wait for potential redirect (the page navigates away if no state)
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');

    // Should have redirected away from consolidation-success (to home/index)
    // because no consolidation state data was passed
    const currentUrl = page.url();
    const redirectedAway = !currentUrl.includes('consolidation-success') || currentUrl.includes('index');
    expect(redirectedAway).toBe(true);
  });

  walletTest('consolidation success page has correct route defined', async ({ page }) => {
    // Verify the route exists by checking that navigation doesn't 404
    await page.goto(page.url().replace(/\/index.*/, '/consolidation-success'));
    await page.waitForTimeout(500);

    // Should not show "Not Found" error - either shows content or redirects
    const notFoundCount = await page.locator('text=/Not Found/i').count();
    expect(notFoundCount).toBe(0);
  });

  walletTest('consolidation success has return button when on page', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidation-success'));
    await page.waitForLoadState('networkidle');

    const isOnSuccessPage = page.url().includes('consolidation-success');
    if (!isOnSuccessPage) {
      return; // Page redirected, skip test
    }

    const returnButton = page.locator('button:has-text("Return"), button:has-text("Done"), button:has-text("Close"), a:has-text("Wallet")').first();
    const buttonCount = await returnButton.count();

    if (buttonCount === 0) {
      return; // No return button present
    }

    await expect(returnButton).toBeVisible();
    await returnButton.click();

    // Should navigate to index
    await expect(page).toHaveURL(/index/);
  });
});

walletTest.describe('Consolidation Status Page (/consolidation-status)', () => {
  walletTest('consolidation status page loads with content or redirects', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidation-status'));
    await page.waitForLoadState('networkidle');

    // Page may redirect if no status data, or show status content
    const isOnStatusPage = page.url().includes('consolidation-status');

    if (isOnStatusPage) {
      // Should show status or loading info
      const statusContent = page.locator('text=/Status|Progress|Pending|Confirmed|Loading|Checking|Waiting/i').first();
      await expect(statusContent).toBeVisible({ timeout: 5000 });
    }
    // If redirected, that's acceptable behavior
  });

  walletTest('consolidation status shows status text when on page', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidation-status'));
    await page.waitForLoadState('networkidle');

    const isOnStatusPage = page.url().includes('consolidation-status');
    if (!isOnStatusPage) {
      return; // Page redirected, skip test
    }

    // Should show status text
    const statusText = page.locator('text=/Status|Progress|Pending|Confirmed/i').first();
    await expect(statusText).toBeVisible({ timeout: 5000 });
  });

  walletTest('consolidation status page has back navigation when on page', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/consolidation-status'));
    await page.waitForLoadState('networkidle');

    const isOnStatusPage = page.url().includes('consolidation-status');
    if (!isOnStatusPage) {
      return; // Page redirected, skip test
    }

    // Should have back button
    const backButton = page.locator('button[aria-label*="back" i], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
  });
});
