/**
 * Coins Settings Page Tests
 *
 * Tests for /settings/coins - the address's coins, which are locked, and locking them by hand.
 * The explorer and ledger answers are fixtures, so the coins listed are the same on every run;
 * the locks are the real ones, written to and read back from the keychain.
 */

import type { BrowserContext } from '@playwright/test';
import { expect, walletTest } from '../../fixtures';
import { common } from '../../selectors';

const COIN_A = 'a1'.repeat(32);
const COIN_B = 'b2'.repeat(32);
const ATTACHED = 'c3'.repeat(32);

async function stubCoins(context: BrowserContext) {
  await context.route('https://mempool.space/api/address/*/utxo', route => route.fulfill({
    json: [
      { txid: COIN_A, vout: 0, value: 250_000, status: { confirmed: true, block_height: 900_000, block_hash: '', block_time: 0 } },
      { txid: COIN_B, vout: 1, value: 40_000, status: { confirmed: false } },
      { txid: ATTACHED, vout: 0, value: 546, status: { confirmed: true, block_height: 899_000, block_hash: '', block_time: 0 } },
    ],
  }));
  await context.route('https://mempool.space/api/blocks/tip/height', route => route.fulfill({ body: '900004' }));
  await context.route('**/v2/utxos/withbalances?**', route => {
    const utxos = new URL(route.request().url()).searchParams.get('utxos')?.split(',') ?? [];
    return route.fulfill({ json: { result: Object.fromEntries(utxos.map(utxo => [utxo, utxo.startsWith(ATTACHED)])) } });
  });
}

const openCoins = async (page: import('@playwright/test').Page) => {
  await page.goto(page.url().replace(/\/index.*/, '/settings/coins'));
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15_000 });
};

walletTest.describe('Coins Page (/settings/coins)', () => {
  walletTest('lists the address\'s coins with their settlement and what they hold', async ({ page, context }) => {
    await stubCoins(context);
    await openCoins(page);

    await expect(page.getByText('0.00290000 BTC free', { exact: true })).toBeVisible();
    const large = page.getByRole('article', { name: /0\.00250000 BTC/ });
    await expect(large.getByText('5 confirmations')).toBeVisible();
    await expect(page.getByRole('article', { name: /0\.00040000 BTC/ }).getByText('Unconfirmed')).toBeVisible();
    const attached = page.getByRole('article', { name: /0\.00000546 BTC/ });
    await expect(attached.getByText('Holds assets')).toBeVisible();
    await expect(attached.getByRole('button')).toHaveCount(0);
  });

  walletTest('locks a coin by hand, keeps it locked, and unlocks it after confirming', async ({ page, context }) => {
    await stubCoins(context);
    await openCoins(page);

    const coin = () => page.getByRole('article', { name: /0\.00250000 BTC/ });
    await coin().getByRole('button', { name: 'Lock' }).click();
    await expect(coin().getByText('Locked by you')).toBeVisible();
    await expect(page.getByText('0.00040000 BTC free · 0.00250000 BTC locked', { exact: true })).toBeVisible();

    // Written to the keychain, not held by the page.
    await page.reload();
    await expect(coin().getByText('Locked by you')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: 'Locked' }).click();
    await expect(page.getByRole('article')).toHaveCount(1);

    await coin().getByRole('button', { name: 'Unlock' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('This coin becomes spendable again.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText('No locked coins')).toBeVisible();
  });

  walletTest('has back navigation to settings', async ({ page, context }) => {
    await stubCoins(context);
    await openCoins(page);
    await common.headerBackButton(page).click();
    await expect(page).toHaveURL(/settings$/, { timeout: 5000 });
  });
});
