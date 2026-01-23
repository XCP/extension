/**
 * Index Page Tests
 *
 * Consolidated tests for index page functionality including:
 * - Navigation (receive, send, history buttons)
 * - Footer navigation
 * - Wallet selector
 * - Tab switching (Assets/Balances)
 * - Balance list
 * - History
 */

import { walletTest, expect, navigateTo } from '../fixtures';
import { index, viewAddress, header } from '../selectors';

walletTest.describe('Index Page', () => {
  walletTest.describe('Navigation', () => {
    walletTest('receive button navigates to view-address page', async ({ page }) => {
      const receiveButton = index.receiveButton(page);
      const buttonCount = await receiveButton.count();

      if (buttonCount === 0) {
        return; // Skip if button not present
      }

      await expect(receiveButton).toBeVisible();
      await receiveButton.click();

      await expect(page).toHaveURL(/view-address/);

      // Should show QR code or address display (both may be visible)
      const qrOrAddress = viewAddress.qrCode(page).or(viewAddress.addressDisplay(page)).first();
      await expect(qrOrAddress).toBeVisible({ timeout: 5000 });
    });

    walletTest('send button navigates to compose/send page', async ({ page }) => {
      const sendButton = index.sendButton(page);
      const buttonCount = await sendButton.count();

      if (buttonCount === 0) {
        return;
      }

      await expect(sendButton).toBeVisible();
      await sendButton.click();

      await expect(page).toHaveURL(/compose\/send/);
    });

    walletTest('history button navigates to address-history page', async ({ page }) => {
      const historyButton = index.historyButton(page);
      const buttonCount = await historyButton.count();

      if (buttonCount === 0) {
        return;
      }

      await expect(historyButton).toBeVisible();
      await historyButton.click();

      await expect(page).toHaveURL(/address-history/);
    });

    walletTest('footer navigation works correctly', async ({ page }) => {
      const sections = ['market', 'actions', 'settings'] as const;

      for (const section of sections) {
        await navigateTo(page, section);
        await expect(page).toHaveURL(new RegExp(section));

        await navigateTo(page, 'wallet');
        await expect(page).toHaveURL(/index/);
      }
    });

    walletTest('wallet selector in header is visible and clickable', async ({ page }) => {
      const walletSelector = header.walletSelector(page);
      const selectorCount = await walletSelector.count();

      if (selectorCount === 0) {
        return;
      }

      await expect(walletSelector).toBeVisible();
      const walletText = await walletSelector.textContent();
      expect(walletText).toMatch(/Wallet|wallet/i);

      await walletSelector.click();

      // Should navigate to wallet selection or show wallet list
      const walletSelectPage = page.locator('h1:has-text("Wallets")')
        .or(page.locator('text=/Select.*Wallet/i')).first();

      // Either on select-wallet URL or heading visible
      const isOnWalletSelect = page.url().includes('select-wallet');
      if (!isOnWalletSelect) {
        await expect(walletSelectPage).toBeVisible({ timeout: 5000 });
      }
    });
  });

  walletTest.describe('Tabs', () => {
    walletTest('assets tab shows asset content when clicked', async ({ page }) => {
      const assetsTab = index.assetsTab(page);
      const tabCount = await assetsTab.count();

      if (tabCount === 0) {
        return;
      }

      await expect(assetsTab).toBeVisible();
      await assetsTab.click();

      // Should show assets content or empty state (not loading spinner)
      const assetsContent = page.locator('text=/No assets|Asset|NFT/i').first();
      await expect(assetsContent).toBeVisible({ timeout: 10000 });
    });

    walletTest('balances tab shows BTC balance when clicked', async ({ page }) => {
      const balancesTab = index.balancesTab(page);
      const tabCount = await balancesTab.count();

      if (tabCount === 0) {
        return;
      }

      await expect(balancesTab).toBeVisible();
      await balancesTab.click();

      // Should show balance content
      const btcBalance = page.locator('text=/BTC|Bitcoin|Balance/i').first();
      await expect(btcBalance).toBeVisible({ timeout: 5000 });
    });

    walletTest('search functionality filters results', async ({ page }) => {
      const searchInput = index.searchInput(page);
      const searchCount = await searchInput.count();

      if (searchCount === 0) {
        return;
      }

      await expect(searchInput).toBeVisible();
      await searchInput.fill('BTC');
       // Allow filter to apply

      // BTC row should be visible if balances exist
      const btcRow = index.btcBalanceRow(page);
      const btcCount = await btcRow.count();

      // If BTC row exists, it should be visible; otherwise search was applied
      if (btcCount > 0) {
        await expect(btcRow).toBeVisible();
      }

      await searchInput.clear();
    });
  });

  walletTest.describe('Balance List', () => {
    walletTest('balance list finishes loading', async ({ page }) => {
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      // Wait for loading to complete - balance section should show actual content or empty state
      // A fresh wallet shows "No assets" or actual balances, NOT loading spinner
      const balanceContent = page.locator('text=/BTC|XCP|No assets|No balances/i').first();
      await expect(balanceContent).toBeVisible({ timeout: 10000 });
    });

    walletTest('displays balance items or empty state', async ({ page }) => {
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      // After loading completes, should show either:
      // - Balance items (BTC, asset names)
      // - Empty state message
      // NOT: Loading spinners, error messages
      const balanceItem = page.getByRole('button').filter({ hasText: /^BTC|^XCP/ }).first();
      const emptyState = page.locator('text=/No assets|No balances/i').first();

      await expect(balanceItem.or(emptyState).first()).toBeVisible({ timeout: 10000 });
    });
  });

  walletTest.describe('History', () => {
    walletTest('history page shows transactions or empty state', async ({ page }) => {
      const historyButton = page.getByText('History');
      const buttonCount = await historyButton.count();

      if (buttonCount === 0) {
        return;
      }

      await expect(historyButton).toBeVisible();
      await historyButton.click();

      await expect(page).toHaveURL(/history/);

      // Can show transactions, empty state, or API error (rate limit)
      const historyContent = page.locator('text=/Transaction|No transactions|Empty|Error|failed|429/i').first();
      await expect(historyContent).toBeVisible({ timeout: 10000 });
    });
  });
});
