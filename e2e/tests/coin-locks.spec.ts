/**
 * Locked coins end to end, in the built extension: an offer funding signed through the real
 * approval locks its slots, the Coins settings page lists them beside a coin locked by hand, and
 * a second site's request to spend a slot asks first, where confirming is the unlock.
 *
 * The chain and ledger answers are fixtures (a parent the wallet owns, its offer funding, no
 * attached assets), so the run is the same every time; signing, review and the locks are real.
 *
 * Output: test-results/coin-locks/*.png (or XCP_COIN_LOCK_SHOTS).
 */
import type { BrowserContext, Page } from '@playwright/test';
import { Address, OutScript, Transaction } from '@scure/btc-signer';
import * as fs from 'fs';
import * as path from 'path';
import { expect, walletTest } from '../fixtures';
import { authorizeGalleryOrigin, callGalleryService } from '../utils/provider-gallery';

const OUT = process.env.XCP_COIN_LOCK_SHOTS ?? 'test-results/coin-locks';
const ORIGIN = 'https://market.example';
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

interface Lock { outpoint: string; kind: string; manual: boolean; refs: string[]; origin: string | null; unlocked: boolean }

walletTest('offer coins are locked when signed, listed, and unlocked only by confirming', async ({ page, context, extensionId }) => {
  walletTest.setTimeout(300_000);
  fs.mkdirSync(OUT, { recursive: true });
  const identity = await authorizeGalleryOrigin(page, ORIGIN);
  const signer = identity.address;
  const script = OutScript.encode(Address().decode(signer));

  // A confirmed parent paying the wallet 60,000 sats, and the offer funding that spends it.
  const parent = new Transaction();
  parent.addInput({ txid: new Uint8Array(32).fill(5), index: 0 });
  parent.addOutput({ script, amount: 60_000n });
  const fund = new Transaction({ version: 2, lockTime: 0 });
  fund.addInput({ txid: parent.id, index: 0, witnessUtxo: { script, amount: 60_000n }, sighashType: 1 });
  fund.addOutput({ script, amount: 20_000n });
  fund.addOutput({ script, amount: 20_000n });
  fund.addOutput({ script, amount: 19_500n });
  const parents = new Map([[parent.id, hex(parent.toBytes(true, false))], [fund.id, hex(fund.toBytes(true, false))]]);
  const plain = 'd4'.repeat(32);

  await stub(context, signer, parents, fund.id, plain);

  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86_400;
  const intent = {
    standard: 'counterparty-marketplace', version: 1, action: 'fund_offers',
    operationId: `offer-funding:${fund.id}`, protocolVersion: 'exact_offer_v1', assets: [],
    bidder: signer, target: { scope: 'asset', asset: 'RAREPEPE' },
    priceSats: 19_000, platformFeeSats: 1_000, delivery: { mode: 'detached' },
    fundingInputs: [{ txid: parent.id, vout: 0, valueSats: 60_000 }], fundingValueSats: 60_000,
    slotCount: 2, slotValueSats: 20_000, networkFeeSats: 500, changeSats: 19_500,
    expectedTxid: fund.id, marketplaceExpiresAt: expiresAt,
    commitments: [{ outpoint: { txid: fund.id, vout: 0 }, offerIds: ['offer-1', 'offer-2'], expiresAt }],
  };
  await seed(page, { id: 'fund', kind: 'sign-psbt', psbtHex: hex(fund.toPSBT()), signInputs: { [signer]: [0] },
    sighashTypes: [1], marketplaceIntent: intent, identity });
  const approval = await openApproval(context, extensionId, 'fund');
  await approval.screenshot({ path: path.join(OUT, '0-fund-offers-approval.png'), fullPage: true });
  // The happy path asks nothing: one step, no warning.
  await approval.getByRole('button', { name: 'Fund offers', exact: true }).click();
  const locks = () => callGalleryService<Lock[]>(page, 'getCoinLocks', [signer]);
  await expect.poll(async () => (await locks()).length, { timeout: 30_000 }).toBe(2);
  expect(await locks()).toEqual([
    expect.objectContaining({ outpoint: `${fund.id}:0`, kind: 'offer_slot', refs: ['offer-1', 'offer-2'], origin: ORIGIN, unlocked: false }),
    expect.objectContaining({ outpoint: `${fund.id}:1`, kind: 'offer_slot', refs: [], origin: ORIGIN, unlocked: false }),
  ]);

  // A coin the user locks by hand.
  await callGalleryService(page, 'updateCoinLocks', [signer, { lock: [{ outpoint: `${plain}:1`, valueSats: 150_000 }] }]);

  // Settings index.
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto(`chrome-extension://${extensionId}/popup.html#/settings`);
  await expect(page.getByText('Coins', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(OUT, '1-settings-index.png') });

  // Coins page, All and Locked.
  await page.goto(`chrome-extension://${extensionId}/popup.html#/settings/coins`);
  await expect(page.getByText('Offer funding').first()).toBeVisible({ timeout: 20_000 });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.screenshot({ path: path.join(OUT, '2-coins-all.png'), fullPage: true });
  await page.getByRole('article', { name: /0.00000546 BTC/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, '2b-coins-all-bottom.png'), fullPage: true });
  await expect(page.getByText('0.00019500 BTC free · 0.00190000 BTC locked', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Locked' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await page.screenshot({ path: path.join(OUT, '3-coins-locked.png'), fullPage: true });

  // Unlock confirmation for the offer coin that backs two offers.
  await page.getByRole('article', { name: /0\.00020000 BTC/ }).filter({ hasText: 'Backs 2 offers' }).getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('dialog').getByText('Spending this coin cancels 2 offers.')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, '4-unlock-confirm-offer.png') });
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('article', { name: /0\.00150000 BTC/ }).getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('dialog').getByText('This coin becomes spendable again.')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, '5-unlock-confirm-manual.png') });
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Another site funds an offer from the locked slot: the approval asks, and confirming unlocks it.
  const spend = new Transaction({ version: 2, lockTime: 0 });
  spend.addInput({ txid: fund.id, index: 0, witnessUtxo: { script, amount: 20_000n }, sighashType: 1 });
  spend.addOutput({ script, amount: 15_000n });
  spend.addOutput({ script, amount: 4_500n });
  const reuse = { ...intent, operationId: `offer-funding:${spend.id}`, priceSats: 14_000,
    fundingInputs: [{ txid: fund.id, vout: 0, valueSats: 20_000 }], fundingValueSats: 20_000,
    slotCount: 1, slotValueSats: 15_000, changeSats: 4_500, expectedTxid: spend.id, commitments: undefined };
  await authorizeGalleryOrigin(page, 'https://other.example');
  await seed(page, { id: 'spend', kind: 'sign-psbt', psbtHex: hex(spend.toPSBT()), signInputs: { [signer]: [0] },
    sighashTypes: [1], marketplaceIntent: reuse, identity, origin: 'https://other.example' });
  const other = await openApproval(context, extensionId, 'spend');
  await other.screenshot({ path: path.join(OUT, '6-site-psbt-review.png'), fullPage: true });
  await other.getByRole('button', { name: 'Review', exact: true }).last().click();
  const attention = other.getByRole('dialog');
  await expect(attention.getByText('This spends a coin locked for your offers. Your 2 offers will be cancelled when this confirms.')).toBeVisible();
  await other.screenshot({ path: path.join(OUT, '7-site-psbt-unlock-attention.png'), fullPage: true });
  expect((await locks()).find(lock => lock.outpoint === `${fund.id}:0`)?.unlocked).toBe(false);
  await attention.getByRole('button', { name: 'Unlock and sign' }).click();
  // The slot is unlocked (its offers end once the spend confirms), and the new funding is locked
  // for the site that asked.
  await expect.poll(async () => (await locks()).find(lock => lock.outpoint === `${fund.id}:0`)?.unlocked, { timeout: 30_000 }).toBe(true);
  expect((await locks()).find(lock => lock.outpoint === `${spend.id}:0`)).toMatchObject({ kind: 'offer_slot', origin: 'https://other.example', unlocked: false });
});

async function stub(context: BrowserContext, signer: string, parents: Map<string, string>, fundId: string, plain: string) {
  await context.route(/mempool\.space\/api\/tx\/([0-9a-f]{64})\/hex$/, route => {
    const txid = /tx\/([0-9a-f]{64})\/hex$/.exec(route.request().url())![1]!;
    const raw = parents.get(txid);
    return raw ? route.fulfill({ body: raw }) : route.fulfill({ status: 404, body: 'Transaction not found' });
  });
  await context.route(/mempool\.space\/api\/tx\/([0-9a-f]{64})\/status$/, route =>
    route.fulfill({ json: { confirmed: true, block_height: 900_000 } }));
  await context.route(/mempool\.space\/api\/tx\/([0-9a-f]{64})$/, route => {
    const txid = /tx\/([0-9a-f]{64})$/.exec(route.request().url())![1]!;
    const values = txid === fundId ? [20_000, 20_000, 19_500] : [60_000];
    return route.fulfill({ json: { txid, status: { confirmed: true, block_height: 900_000 },
      vout: values.map(value => ({ value, scriptpubkey_address: signer })) } });
  });
  await context.route('https://mempool.space/api/address/*/utxo', route => route.fulfill({ json: [
    { txid: fundId, vout: 0, value: 20_000, status: { confirmed: false } },
    { txid: fundId, vout: 1, value: 20_000, status: { confirmed: false } },
    { txid: fundId, vout: 2, value: 19_500, status: { confirmed: false } },
    { txid: plain, vout: 1, value: 150_000, status: { confirmed: true, block_height: 899_990, block_hash: '', block_time: 0 } },
    { txid: 'e5'.repeat(32), vout: 0, value: 546, status: { confirmed: true, block_height: 899_000, block_hash: '', block_time: 0 } },
  ] }));
  await context.route('https://mempool.space/api/blocks/tip/height', route => route.fulfill({ body: '900004' }));
  await context.route('**/v2/utxos/withbalances?**', route => {
    const utxos = new URL(route.request().url()).searchParams.get('utxos')?.split(',') ?? [];
    return route.fulfill({ json: { result: Object.fromEntries(utxos.map(utxo => [utxo, utxo.startsWith('e5')])) } });
  });
  await context.route(/\/v2\/utxos\/[^/]+\/balances/, route => route.fulfill({ json: { result: [], next_cursor: null, result_count: 0 } }));
  await context.route('https://mempool.space/api/v1/fees/precise', route => route.fulfill({ json: { fastestFee: 2, halfHourFee: 1, hourFee: 1 } }));
}

async function seed(page: Page, request: Record<string, unknown> & { identity: { walletId: string; address: string }; id: string }) {
  const { identity, ...rest } = request;
  await page.evaluate(async (req) => {
    await chrome.storage.session.set({ pending_sign_flow: [req] });
  }, { origin: ORIGIN, timestamp: Date.now(), ...identity, requestKey: `xcp_signPsbt:${request.id}`, status: 'pending', ...rest });
}

async function openApproval(context: BrowserContext, extensionId: string, id: string) {
  const approval = await context.newPage();
  await approval.setViewportSize({ width: 380, height: 1100 });
  await approval.goto(`chrome-extension://${extensionId}/popup.html#/requests/psbt/approve?requestId=${id}`);
  await expect(approval.getByRole('button', { name: /^(Fund offers|Review|Sign transaction|Blocked)$/ })).toBeVisible({ timeout: 60_000 });
  return approval;
}
