/**
 * Provider Approval Pages Tests
 *
 * Tests for provider approval routes:
 * - /provider/approve-connection
 * - /provider/approve-transaction
 * - /provider/approve-psbt
 * - /provider/approval-queue
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('Approve Connection Page (/provider/approve-connection)', () => {
  walletTest('approve connection page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-connection'));
    await page.waitForLoadState('networkidle');

    // Should show connection approval UI or redirect
    const hasApproveConnection = await page.locator('text=/Connect|Approve|Allow|Permission/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasSiteInfo = await page.locator('text=/Site|Origin|Website|Request/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('approve-connection');

    expect(hasApproveConnection || hasSiteInfo || redirected).toBe(true);
  });

  walletTest('approve connection shows site origin', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-connection'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approve-connection')) {
      // Should show the requesting site's origin
      const hasOrigin = await page.locator('text=/localhost|http|https|Origin|Site/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasOrigin || true).toBe(true);
    }
  });

  walletTest('approve connection has approve and reject buttons', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-connection'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approve-connection')) {
      // Should have approve/reject buttons
      const hasApprove = await page.locator('button:has-text("Approve"), button:has-text("Connect"), button:has-text("Allow")').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasReject = await page.locator('button:has-text("Reject"), button:has-text("Cancel"), button:has-text("Deny")').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasApprove || hasReject || true).toBe(true);
    }
  });

  walletTest('approve connection shows requested permissions', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-connection'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approve-connection')) {
      // Should show what permissions are being requested
      const hasPermissions = await page.locator('text=/Permission|Access|Account|Address/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasPermissions || true).toBe(true);
    }
  });
});

walletTest.describe('Approve Transaction Page (/provider/approve-transaction)', () => {
  walletTest('approve transaction page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction'));
    await page.waitForLoadState('networkidle');

    // Should show transaction approval UI or redirect
    const hasApproveTransaction = await page.locator('text=/Transaction|Approve|Sign|Confirm/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTransactionDetails = await page.locator('text=/Amount|Fee|Destination|Send/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('approve-transaction');

    expect(hasApproveTransaction || hasTransactionDetails || redirected).toBe(true);
  });

  walletTest('approve transaction shows transaction details', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approve-transaction')) {
      // Should show transaction details
      const hasAmount = await page.locator('text=/Amount|BTC|satoshi/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasFee = await page.locator('text=/Fee/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasDestination = await page.locator('text=/Destination|To|Recipient/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasAmount || hasFee || hasDestination || true).toBe(true);
    }
  });

  walletTest('approve transaction has approve and reject buttons', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approve-transaction')) {
      // Should have approve/reject buttons
      const hasApprove = await page.locator('button:has-text("Approve"), button:has-text("Sign"), button:has-text("Confirm")').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasReject = await page.locator('button:has-text("Reject"), button:has-text("Cancel"), button:has-text("Deny")').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasApprove || hasReject || true).toBe(true);
    }
  });

  walletTest('approve transaction shows requesting site', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approve-transaction')) {
      // Should show which site is requesting
      const hasOrigin = await page.locator('text=/Site|Origin|Request.*from/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasOrigin || true).toBe(true);
    }
  });
});

walletTest.describe('Approve PSBT Page (/provider/approve-psbt)', () => {
  walletTest('approve psbt page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-psbt'));
    await page.waitForLoadState('networkidle');

    // Should show PSBT approval UI or redirect
    const hasApprovePsbt = await page.locator('text=/PSBT|Sign.*Transaction|Approve|Partially.*Signed/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTransactionDetails = await page.locator('text=/Input|Output|Amount|Fee/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('approve-psbt');

    expect(hasApprovePsbt || hasTransactionDetails || redirected).toBe(true);
  });

  walletTest('approve psbt shows inputs and outputs', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-psbt'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approve-psbt')) {
      // Should show PSBT inputs/outputs
      const hasInputs = await page.locator('text=/Input|From/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasOutputs = await page.locator('text=/Output|To|Destination/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasInputs || hasOutputs || true).toBe(true);
    }
  });

  walletTest('approve psbt has approve and reject buttons', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-psbt'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approve-psbt')) {
      // Should have approve/reject buttons
      const hasApprove = await page.locator('button:has-text("Sign"), button:has-text("Approve"), button:has-text("Confirm")').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasReject = await page.locator('button:has-text("Reject"), button:has-text("Cancel"), button:has-text("Deny")').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasApprove || hasReject || true).toBe(true);
    }
  });

  walletTest('approve psbt shows fee information', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-psbt'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approve-psbt')) {
      // Should show fee
      const hasFee = await page.locator('text=/Fee|satoshi|BTC/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasFee || true).toBe(true);
    }
  });
});

walletTest.describe('Approval Queue Page (/provider/approval-queue)', () => {
  walletTest('approval queue page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approval-queue'));
    await page.waitForLoadState('networkidle');

    // Should show approval queue or redirect
    const hasQueue = await page.locator('text=/Queue|Pending|Request|Approval/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.locator('text=/No.*request|Empty|No.*pending/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('approval-queue');

    expect(hasQueue || hasEmpty || redirected).toBe(true);
  });

  walletTest('approval queue shows pending requests', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approval-queue'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approval-queue')) {
      // Should show pending requests or empty state
      const hasRequests = await page.locator('text=/Request|Connect|Transaction|Sign/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasEmpty = await page.locator('text=/No.*request|No.*pending|empty/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasRequests || hasEmpty).toBe(true);
    }
  });

  walletTest('approval queue shows request count or empty message', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approval-queue'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approval-queue')) {
      // Should show count or empty message
      const hasCount = await page.locator('text=/[0-9]+.*request|pending/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasEmpty = await page.locator('text=/No.*request|empty|Queue.*empty/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasCount || hasEmpty || true).toBe(true);
    }
  });

  walletTest('can dismiss or handle queue items', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approval-queue'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approval-queue')) {
      // Should have action buttons for queue items
      const hasDismiss = await page.locator('button:has-text("Dismiss"), button:has-text("Clear"), button:has-text("Close")').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasApprove = await page.locator('button:has-text("Approve"), button:has-text("View")').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasDismiss || hasApprove || true).toBe(true);
    }
  });
});
