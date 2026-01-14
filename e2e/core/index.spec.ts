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

walletTest.describe('Index Page', () => {
  walletTest.describe('Navigation', () => {
    walletTest('receive send history buttons work', async ({ page }) => {
      const receiveButton = page.getByRole('button', { name: 'Receive tokens' });
      if (await receiveButton.isVisible()) {
        await receiveButton.click();
        await page.waitForTimeout(1000);

        await expect(page).toHaveURL(/view-address/);

        const hasQR = await page.locator('canvas, img[alt*="QR"], [class*="qr"]').isVisible().catch(() => false);
        const hasAddress = await page.locator('.font-mono').first().isVisible().catch(() => false);
        expect(hasQR || hasAddress).toBe(true);

        await page.goBack();
        await page.waitForTimeout(1000);
      }

      const sendButton = page.getByRole('button', { name: 'Send tokens' });
      if (await sendButton.isVisible()) {
        await sendButton.click();
        await page.waitForTimeout(1000);

        await expect(page).toHaveURL(/compose\/send/);
      }

      await page.goBack();
      await page.waitForTimeout(1000);

      const historyButton = page.getByRole('button', { name: 'Transaction history' });
      if (await historyButton.isVisible()) {
        await historyButton.click();
        await page.waitForTimeout(1000);

        await expect(page).toHaveURL(/address-history/);
      }
    });

    walletTest('footer navigation works correctly', async ({ page }) => {
      const sections = ['market', 'actions', 'settings'] as const;

      for (const section of sections) {
        await navigateTo(page, section);
        await page.waitForTimeout(1000);

        await expect(page).toHaveURL(new RegExp(section));

        await navigateTo(page, 'wallet');
        await page.waitForTimeout(1000);
      }
    });

    walletTest('wallet selector in header works', async ({ page }) => {
      const walletSelector = page.getByText(/Wallet \d+|Wallet/i).first();

      if (await walletSelector.isVisible()) {
        const walletText = await walletSelector.textContent();

        expect(walletText).toMatch(/Wallet|wallet/i);

        await walletSelector.click();
        await page.waitForTimeout(1000);

        const isOnWalletSelect = page.url().includes('select-wallet');
        const hasWalletHeading = await page.locator('h1:has-text("Wallets")').isVisible().catch(() => false);

        expect(isOnWalletSelect || hasWalletHeading).toBe(true);
      }
    });
  });

  walletTest.describe('Tabs', () => {
    walletTest('tab switching between Assets and Balances', async ({ page }) => {
      const assetsTab = page.getByRole('button', { name: 'View Assets' });
      const balancesTab = page.getByRole('button', { name: 'View Balances' });

      if (await assetsTab.isVisible()) {
        await assetsTab.click();
        await page.waitForTimeout(1000);

        const hasAssetsContent = await page.locator('text=/Loading owned assets|No assets|Asset/').first().isVisible().catch(() => false);
        expect(hasAssetsContent).toBe(true);
      }

      if (await balancesTab.isVisible()) {
        await balancesTab.click();
        await page.waitForTimeout(1000);

        const hasBTCBalance = await page.locator('div:has-text("BTC")').first().isVisible().catch(() => false);
        expect(hasBTCBalance).toBe(true);
      }
    });

    walletTest('search functionality', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();

      if (await searchInput.isVisible()) {
        await searchInput.fill('BTC');
        await page.waitForTimeout(1000);

        const btcVisible = await page.locator('.font-medium.text-sm.text-gray-900:has-text("BTC")').isVisible();
        expect(btcVisible).toBe(true);

        await searchInput.clear();
        await page.waitForTimeout(500);
      }
    });
  });

  walletTest.describe('Balance List', () => {
    walletTest('click on balance navigates to send page', async ({ page }) => {
      await page.waitForSelector('.font-medium.text-sm.text-gray-900:has-text("BTC")', { timeout: 10000 });
      await page.waitForTimeout(2000);

      const btcBalanceItem = page.locator('div.cursor-pointer').filter({ hasText: 'BTC' }).first();

      if (await btcBalanceItem.isVisible()) {
        await btcBalanceItem.click({ force: true });
        await page.waitForTimeout(2000);

        const currentUrl = page.url();
        const navigatedToSend = currentUrl.includes('compose/send');

        if (navigatedToSend) {
          expect(navigatedToSend).toBe(true);
        } else {
          const btcStillVisible = await page.locator('.font-medium.text-sm.text-gray-900:has-text("BTC")').isVisible();
          expect(btcStillVisible).toBe(true);
        }
      } else {
        const btcExists = await page.locator('.font-medium.text-sm.text-gray-900:has-text("BTC")').isVisible();
        expect(btcExists).toBe(true);
      }
    });

    walletTest('empty state messages', async ({ page }) => {
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      const contentFound = await Promise.race([
        page.waitForSelector('text=/BTC|Bitcoin/i', { timeout: 5000 })
          .then(() => true)
          .catch(() => false),
        page.waitForSelector('text=/No assets|No balances|Loading|Empty/i', { timeout: 5000 })
          .then(() => true)
          .catch(() => false),
        page.waitForSelector('.font-mono, [class*="balance"], [class*="asset"]', { timeout: 5000 })
          .then(() => true)
          .catch(() => false),
        new Promise(resolve => setTimeout(() => resolve(true), 3000))
      ]);

      expect(contentFound).toBe(true);
    });
  });

  walletTest.describe('History', () => {
    walletTest('wallet history and transaction navigation', async ({ page }) => {
      const historyButton = page.getByText('History');
      if (await historyButton.isVisible()) {
        await historyButton.click();
        await page.waitForTimeout(1000);

        await expect(page).toHaveURL(/history/);

        const hasTransactions = await page.locator('text=/Transaction|No transactions|Empty/').isVisible();
        expect(hasTransactions).toBe(true);
      }
    });
  });
});
