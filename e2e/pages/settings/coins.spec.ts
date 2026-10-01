/** The offers-first list uses real keychain locks and fixture chain responses. */
import type { BrowserContext, Page } from '@playwright/test';
import { expect, walletTest } from '../../fixtures';
import { common } from '../../selectors';
import { authorizeGalleryOrigin, callGalleryService } from '../../utils/provider-gallery';

const COIN_A = 'a1'.repeat(32);
const COIN_B = 'b2'.repeat(32);
const ATTACHED = 'c3'.repeat(32);

async function stubCoins(context: BrowserContext) {
  await context.route('https://mempool.space/api/address/*/utxo', route => route.fulfill({
    json: [
      { txid: COIN_A, vout: 0, value: 250_000, status: { confirmed: true, block_height: 900_000, block_hash: '', block_time: 0 } },
      { txid: COIN_B, vout: 1, value: 40_000, status: { confirmed: false } },
      ...Array.from({ length: 500 }, (_, vout) => ({ txid: ATTACHED, vout, value: 546,
        status: { confirmed: true, block_height: 899_000, block_hash: '', block_time: 0 } })),
    ],
  }));
  await context.route('https://mempool.space/api/blocks/tip/height', route => route.fulfill({ body: '900004' }));
}

const openCoins = async (page: Page) => {
  await page.goto(page.url().replace(/#.*$/, '#/settings/coins'));
  await expect(page.getByRole('heading', { name: 'Coin Control', exact: true }).first()).toBeVisible();
};

walletTest.describe('Coins Page (/settings/coins)', () => {
  walletTest('shows an empty protection list without requesting wallet UTXOs or attachments', async ({ page, context }) => {
    let utxoReads = 0;
    let assetReads = 0;
    await stubCoins(context);
    await context.route('**/v2/utxos/withbalances?**', route => { assetReads++; return route.abort(); });
    await context.route('https://mempool.space/api/address/*/utxo', route => { utxoReads++; return route.fallback(); });
    await openCoins(page);
    await expect(page.getByText('No protected coins', { exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByRole('tablist')).toHaveCount(0);
    expect(utxoReads).toBe(0);
    expect(assetReads).toBe(0);
    await page.screenshot({ path: 'test-results/coins-empty.png' });
  });

  walletTest('shows existing hand locks among hundreds of unrelated outputs and unlocks without rescanning', async ({ page, context }) => {
    await stubCoins(context);
    const { address } = await authorizeGalleryOrigin(page, 'https://market.example');
    await callGalleryService(page, 'updateCoinLocks', [address, { lock: [{ outpoint: `${COIN_A}:0`, valueSats: 250_000 }] }]);
    let assetReads = 0;
    await context.route('**/v2/utxos/withbalances?**', route => { assetReads++; return route.abort(); });
    await openCoins(page);
    const coin = page.getByRole('article', { name: /0\.00250000 BTC/ });
    await expect(coin.getByText('Locked by you')).toBeVisible();
    await expect(coin.getByText('5 confirmations')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByText('Available', { exact: true })).toHaveCount(0);
    expect(assetReads).toBe(0);
    await page.screenshot({ path: 'test-results/coins-manual.png' });

    await page.reload();
    await expect(coin.getByText('Locked by you')).toBeVisible();
    await expect(coin.getByText('5 confirmations')).toBeVisible();
    let readsAfterUnlock = 0;
    await context.route('https://mempool.space/api/address/*/utxo', route => { readsAfterUnlock++; return route.abort(); });
    await coin.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText('No protected coins')).toBeVisible();
    expect(readsAfterUnlock).toBe(0);
    expect(await callGalleryService(page, 'getCoinLocks', [address])).toEqual([]);
  });

  walletTest('has back navigation to settings', async ({ page }) => {
    await openCoins(page);
    await common.headerBackButton(page).click();
    await expect(page).toHaveURL(/settings$/, { timeout: 5000 });
  });
});
