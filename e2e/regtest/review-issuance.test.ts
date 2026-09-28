// @vitest-environment node
/**
 * Review versus ledger: issuance and its follow-ups (issue more, description, lock, transfer),
 * dividend, destroy, sweep and broadcast.
 *
 *   REGTEST=1 REGTEST_BITCOIND=http://127.0.0.1:28443 REGTEST_COUNTERPARTY=http://127.0.0.1:34000 \
 *     npx vitest run e2e/regtest --no-file-parallelism
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  composeBroadcast, composeDestroy, composeDividend, composeIssuance, composeSendOrMPMA, composeSweep,
} from '@/core/counterparty/compose';
import { asset, balance, credits, minedFee, parsedTransaction, sameAmount, totalFor, txEvents } from './ledger';
import { counterparty, REGTEST_ENABLED, type RegtestKey } from './regtestHarness';
import { broadcastBatch, burnAll, freshAsset, fundAll, keyOf, signAll, startWallet } from './suite';
import { type ApprovalReview, approvalReview, composeAsWallet, type ReviewPageFacts, reviewPageFacts, type WalletCompose, walletAddress } from './walletReview';
import { sameScript } from './walletTransport';

vi.mock('@/core/bitcoin/utxo', async original => (await import('./walletTransport')).utxoTransport(await original()));

describe.runIf(REGTEST_ENABLED)('issuance family, dividend, destroy, sweep, broadcast: review matches ledger', () => {
  let miner: string;
  const issuer = keyOf('P2WPKH', 'issuer');
  const holder = keyOf('P2PKH', 'holder');
  const owner = keyOf('P2TR', 'new owner');
  const sweepTo = keyOf('P2SH-P2WPKH', 'sweep destination');
  const name = freshAsset('REVW');
  let lockApproval: ApprovalReview | undefined;
  let sweepPage: ReviewPageFacts | undefined;

  async function mined(wc: WalletCompose, key: RegtestKey): Promise<string> {
    const [txid] = await broadcastBatch(await signAll([{ response: wc.response, key }]), miner);
    const parsed = await parsedTransaction(txid!);
    expect(parsed.valid, `${wc.composeType} ${txid} valid`).toBe(true);
    expect(wc.response.result.btc_fee).toBe(await minedFee(txid!));
    return txid!;
  }

  beforeAll(async () => {
    miner = await startWallet();
    await fundAll(miner, [issuer, holder, owner]);
    await burnAll(miner, [issuer, holder, owner]);
  }, 900_000);

  it('a new issuance creates the asset with the reviewed supply, divisibility and description', async () => {
    const wc = await composeAsWallet('issuance', composeIssuance, {
      asset: name, quantity: '1000.5', divisible: 'true', lock: 'false', reset: 'false', description: 'first description',
    }, issuer);
    const page = await reviewPageFacts('issuance', wc);
    const approval = await approvalReview(wc.response.result.rawtransaction, issuer);
    const txid = await mined(wc, issuer);
    const ledger = await asset(name);
    expect(page.fields.asset).toBe(ledger.asset);
    expect(sameAmount(page.fields.issuance, ledger.supply_normalized), `${page.fields.issuance} vs ${ledger.supply_normalized}`).toBe(true);
    expect(page.fields.locked).toBe(String(ledger.locked));
    expect(page.fields.description).toBe(ledger.description);
    expect(ledger.divisible).toBe(true);
    expect(totalFor(credits(await txEvents(txid)), issuer.address, name)).toBe(ledger.supply);
    expect(approval.headline).toBe(name);
    expect(sameAmount(approval.subline?.replace(/^Issue /, ''), ledger.supply_normalized)).toBe(true);
    expect(approval.protocol.Divisible).toEqual(['Yes']);
    expect(approval.protocol.Description).toEqual([ledger.description]);

    // Give the holder some, for the dividend below.
    await mined(await composeAsWallet('send', composeSendOrMPMA, { destination: walletAddress(holder), asset: name, quantity: '100' }, issuer), issuer);
  }, 600_000);

  it('issuing more states the supply before and after, as the ledger records them', async () => {
    const before = await asset(name);
    const wc = await composeAsWallet('issuance', composeIssuance, {
      asset: name, quantity: '500', divisible: 'true', lock: 'false', reset: 'false', description: '',
    }, issuer);
    const page = await reviewPageFacts('issue-supply', wc);
    await mined(wc, issuer);
    const after = await asset(name);
    expect(sameAmount(page.fields.currentSupply, before.supply_normalized), `${page.fields.currentSupply} vs ${before.supply_normalized}`).toBe(true);
    expect(sameAmount(page.fields.afterIssuance, after.supply_normalized), `${page.fields.afterIssuance} vs ${after.supply_normalized}`).toBe(true);
    expect(after.description).toBe(before.description);
  }, 600_000);

  it('a description change records the reviewed description', async () => {
    const wc = await composeAsWallet('issuance', composeIssuance, {
      asset: name, quantity: '0', divisible: 'true', description: 'second description',
    }, issuer);
    const page = await reviewPageFacts('update-description', wc);
    await mined(wc, issuer);
    expect(page.fields.description).toBe((await asset(name)).description);
  }, 600_000);

  it('a dividend pays each holder the reviewed rate per unit', async () => {
    const held = await balance(holder.address, name);
    const wc = await composeAsWallet('dividend', composeDividend, { asset: name, dividend_asset: 'XCP', quantity_per_unit: '0.01' }, issuer);
    const page = await reviewPageFacts('dividend', wc);
    const approval = await approvalReview(wc.response.result.rawtransaction, issuer);
    const txid = await mined(wc, issuer);
    const [dividend] = await counterparty<Array<{ quantity_per_unit: number; quantity_per_unit_normalized: string; dividend_asset: string }>>(`/assets/${name}/dividends?verbose=true`);
    expect(page.fields.asset).toBe(name);
    expect(page.fields.dividend!.endsWith(' XCP')).toBe(true);
    expect(sameAmount(page.fields.dividend, dividend!.quantity_per_unit_normalized)).toBe(true);
    expect(sameAmount(approval.headline, dividend!.quantity_per_unit_normalized)).toBe(true);
    // Per unit of a divisible asset: the holder's balance in whole units times the rate.
    const paid = totalFor(credits(await txEvents(txid)), holder.address, 'XCP');
    expect(paid).toBe(Math.floor((held / 1e8) * dividend!.quantity_per_unit));
  }, 600_000);

  it('a destroy removes the reviewed amount, and the approval screen\'s supply before and after hold', async () => {
    const before = await asset(name);
    const wc = await composeAsWallet('destroy', composeDestroy, { asset: name, quantity: '10.5', tag: '' }, issuer);
    const page = await reviewPageFacts('destroy', wc);
    const approval = await approvalReview(wc.response.result.rawtransaction, issuer);
    const txid = await mined(wc, issuer);
    const after = await asset(name);
    const destruction = (await txEvents(txid)).find(e => e.event === 'ASSET_DESTRUCTION')?.params;
    expect(page.fields.amount!.endsWith(` ${name}`)).toBe(true);
    expect(sameAmount(page.fields.amount, destruction!.quantity_normalized)).toBe(true);
    expect(sameAmount(approval.protocol['Supply before']?.[0], before.supply_normalized)).toBe(true);
    expect(sameAmount(approval.protocol['Supply after']?.[0], after.supply_normalized)).toBe(true);
    // The wallet's own review states the same supply before and after.
    expect(sameAmount(page.fields.supplyBefore, before.supply_normalized)).toBe(true);
    expect(sameAmount(page.fields.supplyAfter, after.supply_normalized)).toBe(true);
  }, 600_000);

  it('locking supply locks the supply the review shows', async () => {
    const wc = await composeAsWallet('issuance', composeIssuance, { asset: name, quantity: '0', lock: 'true', divisible: 'true' }, issuer);
    const page = await reviewPageFacts('lock-supply', wc);
    const approval = await approvalReview(wc.response.result.rawtransaction, issuer);
    await mined(wc, issuer);
    const ledger = await asset(name);
    expect(ledger.locked).toBe(true);
    expect(sameAmount(page.fields.supplyToLock, ledger.supply_normalized)).toBe(true);
    expect(approval.subline).toBe('No new supply');
    lockApproval = approval;
  }, 600_000);

  // The ledger locks the supply for good, so the approval screen must say so. `fromLocalUnpack`
  // (tx-action-info.ts) once read `data.lock`/`data.reset` while the local issuance unpack names
  // them `isLock`/`isReset`, so neither the lock nor a reset was ever stated.
  it('the approval screen states that the supply will be locked', () => {
    expect(lockApproval?.protocol.Lock).toEqual(['Yes - supply can never be increased again']);
  });

  it('an ownership transfer hands the asset to the reviewed owner', async () => {
    const wc = await composeAsWallet('issuance', composeIssuance, {
      asset: name, quantity: '0', divisible: 'true', transfer_destination: walletAddress(owner),
    }, issuer);
    const page = await reviewPageFacts('transfer-ownership', wc);
    await mined(wc, issuer);
    const ledger = await asset(name);
    expect(sameScript(page.fields.newOwner, ledger.owner ?? ledger.issuer)).toBe(true);
    expect(sameScript(ledger.owner ?? ledger.issuer, owner.address)).toBe(true);
  }, 600_000);

  it('a broadcast records the reviewed text', async () => {
    const wc = await composeAsWallet('broadcast', composeBroadcast, { text: 'review matches ledger', value: '0', fee_fraction: '0' }, holder);
    const page = await reviewPageFacts('broadcast', wc);
    const approval = await approvalReview(wc.response.result.rawtransaction, holder);
    const txid = await mined(wc, holder);
    const recorded = await counterparty<{ text: string }>(`/broadcasts/${txid}`);
    expect(page.fields.message).toBe(recorded.text);
    expect(approval.headline).toBe(recorded.text);
  }, 600_000);

  it('a sweep of balances and ownership moves what the review says to the reviewed address', async () => {
    const heldXcp = await balance(owner.address, 'XCP');
    const heldAsset = await balance(owner.address, name);
    const wc = await composeAsWallet('sweep', composeSweep, { destination: walletAddress(sweepTo), flags: '3', memo: '' }, owner);
    const page = await reviewPageFacts('sweep', wc);
    sweepPage = page;
    const approval = await approvalReview(wc.response.result.rawtransaction, owner);
    const txid = await mined(wc, owner);
    const events = await txEvents(txid);
    expect(sameScript(page.fields.destination, sweepTo.address)).toBe(true);
    expect(sameScript(approval.address, sweepTo.address)).toBe(true);
    expect(approval.protocol.Includes).toEqual(['All balances and asset ownership']);
    // Everything the owner held arrives, less the XCP the sweep itself costs.
    const fee = heldXcp - (await balance(owner.address, 'XCP')) - totalFor(credits(events), sweepTo.address, 'XCP');
    expect(fee).toBeGreaterThanOrEqual(0);
    expect(totalFor(credits(events), sweepTo.address, name)).toBe(heldAsset);
    const ledger = await asset(name);
    expect(sameScript(ledger.owner ?? ledger.issuer, sweepTo.address)).toBe(true);
  }, 600_000);

  // The sweep above handed asset ownership to the destination (the ledger's owner changed), so the
  // compose review page must say so. `sweep/review.tsx` once read `params.flag` while the form, the
  // verified params and Core all name the field `flags`, so its row never rendered; it now states
  // what the flags move in the approval screen's words.
  it('the compose sweep review states that ownership goes with the balances', () => {
    expect(sweepPage?.fields.flag).toBe('3');
    expect(sweepPage?.fields.includes).toBe('All balances and asset ownership');
  });
});
