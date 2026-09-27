// @vitest-environment node
/**
 * Review versus ledger: dispensers (open, dispense from every address format, close) and the DEX
 * (order, match, cancel).
 *
 *   REGTEST=1 REGTEST_BITCOIND=http://127.0.0.1:28443 REGTEST_COUNTERPARTY=http://127.0.0.1:34000 \
 *     npx vitest run e2e/regtest --no-file-parallelism
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { composeBTCPay, composeCancel, composeDispense, composeDispenser, composeIssuance, composeOrder } from '@/core/counterparty/compose';
import { balance, credits, debits, minedFee, parsedTransaction, sameAmount, totalFor, txEvents } from './ledger';
import { counterparty, mineBlocks, REGTEST_ENABLED, type RegtestKey } from './regtestHarness';
import { broadcastBatch, burnAll, FORMATS, freshAsset, fundAll, keyOf, signAll, startWallet } from './suite';
import { approvalReview, composeAsWallet, type ReviewPageFacts, reviewPageFacts, type WalletCompose, walletAddress } from './walletReview';
import { outputsOf, scriptOf } from './walletTransport';

vi.mock('@/core/bitcoin/utxo', async original => (await import('./walletTransport')).utxoTransport(await original()));

interface LedgerMatch { id: string; status: string; forward_quantity: number; backward_quantity: number }

interface LedgerDispenser {
  tx_hash: string; asset: string; status: number; give_quantity: number; escrow_quantity: number;
  give_remaining: number; satoshirate: number; give_quantity_normalized: string; escrow_quantity_normalized: string;
  give_remaining_normalized: string; satoshirate_normalized?: string;
}

describe.runIf(REGTEST_ENABLED)('dispensers and orders: review matches ledger', () => {
  let miner: string;
  const seller = keyOf('P2WPKH', 'dex seller');
  const buyers = FORMATS.map(format => ({ format, key: keyOf(format, `dex buyer ${format}`) }));
  const maker = keyOf('P2TR', 'dex maker');
  const taker = keyOf('P2SH-P2WPKH', 'dex taker');
  const units = freshAsset('UNIT'); // indivisible, sold from the second dispenser
  const token = freshAsset('TOKN'); // indivisible, traded on the DEX

  async function mined(wc: WalletCompose, key: RegtestKey): Promise<string> {
    const [txid] = await broadcastBatch(await signAll([{ response: wc.response, key }]), miner);
    const parsed = await parsedTransaction(txid!);
    expect(parsed.valid, `${wc.composeType} ${txid} valid`).toBe(true);
    return txid!;
  }

  /** Issue this run's two indivisible assets, both in one block. */
  async function issueAll(issues: Array<[RegtestKey, string, string]>): Promise<void> {
    const composed = [];
    for (const [key, asset, quantity] of issues) {
      composed.push({ key, response: (await composeAsWallet('issuance', composeIssuance, {
        asset, quantity, divisible: 'false', lock: 'false', reset: 'false', description: 'review suite',
      }, key)).response });
    }
    const txids = await broadcastBatch(await signAll(composed), miner);
    for (const txid of txids) expect((await parsedTransaction(txid)).valid).toBe(true);
  }

  beforeAll(async () => {
    miner = await startWallet();
    await fundAll(miner, [seller, maker, taker, ...buyers.map(b => b.key)]);
    await burnAll(miner, [seller, maker, taker]);
    await issueAll([[seller, units, '25'], [taker, token, '1000']]);
  }, 900_000);

  it('opening a dispenser escrows what the review states, at the stated price', async () => {
    const wc = await composeAsWallet('dispenser', composeDispenser, {
      asset: 'XCP', give_quantity: '1', escrow_quantity: '20', mainchainrate: '0.0001', mainchainrate_asset: 'BTC', status: '0',
    }, seller);
    const page = await reviewPageFacts('dispenser', wc);
    const approval = await approvalReview(wc.response.result.rawtransaction, seller);
    const txid = await mined(wc, seller);

    const dispenser = await counterparty<LedgerDispenser>(`/dispensers/${txid}?verbose=true`);
    const events = await txEvents(txid);
    expect(page.fields.asset).toBe(dispenser.asset);
    expect(sameAmount(page.fields.escrow, dispenser.escrow_quantity_normalized)).toBe(true);
    expect(sameAmount(page.fields.perDispense, dispenser.give_quantity_normalized)).toBe(true);
    expect(sameAmount(page.fields.priceBtc, dispenser.satoshirate / 1e8)).toBe(true);
    expect(totalFor(debits(events), seller.address, 'XCP')).toBe(dispenser.escrow_quantity);
    expect(dispenser.status).toBe(0);
    expect(approval.label).toBe('Fund dispenser');
    expect(sameAmount(approval.protocol.Escrow?.[0], dispenser.escrow_quantity_normalized)).toBe(true);
    expect(sameAmount(approval.protocol.Dispense?.[0], dispenser.give_quantity_normalized)).toBe(true);
    expect(approval.protocol.Dispenses).toEqual(['20']);
    expect(page.btcFeeSats).toBe(await minedFee(txid));

    // A second dispenser at the same address, of an indivisible asset with a remainder: 25 units
    // at 10 a dispense is two full dispenses and 5 left over.
    const second = await composeAsWallet('dispenser', composeDispenser, {
      asset: units, give_quantity: '10', escrow_quantity: '25', mainchainrate: '0.0001', mainchainrate_asset: 'BTC', status: '0',
    }, seller);
    const secondPage = await reviewPageFacts('dispenser', second);
    const secondTxid = await mined(second, seller);
    const unitsDispenser = await counterparty<LedgerDispenser>(`/dispensers/${secondTxid}?verbose=true`);
    expect(sameAmount(secondPage.fields.escrow, unitsDispenser.escrow_quantity_normalized)).toBe(true);
    expect(secondPage.fields.escrow).toBe('25');
    expect(sameAmount(secondPage.fields.perDispense, unitsDispenser.give_quantity_normalized)).toBe(true);
  }, 600_000);

  it('a dispense pays out exactly what the review says, from both dispensers, capped by what is left', async () => {
    // Three dispenses' worth: three XCP, but only two lots of UNIT remain.
    const buyer = buyers[0]!.key;
    const wc = await composeAsWallet('dispense', composeDispense, {
      dispenser: walletAddress(seller), quantity: '30000',
    }, buyer);
    const page = await reviewPageFacts('dispense', wc);
    const approval = await approvalReview(wc.response.result.rawtransaction, buyer);
    const txid = await mined(wc, buyer);
    const events = await txEvents(txid);

    const xcp = totalFor(credits(events), buyer.address, 'XCP');
    const got = totalFor(credits(events), buyer.address, units);
    expect(xcp).toBe(300_000_000);
    expect(got).toBe(20);
    expect(page.fields.dispensers).toBe('2');
    const lines = page.fields.youReceive!.split('\n');
    expect(lines).toContain(`20 ${units} (all the dispenser has left)`);
    expect(lines.some(line => line.endsWith(' XCP') && sameAmount(line, xcp / 1e8))).toBe(true);
    expect(approval.protocol['You receive']?.slice().sort()).toEqual(lines.slice().sort());
    // What the review says is paid, and what the dispenser output carries.
    const paid = outputsOf(wc.response.result.rawtransaction).find(o => o.script === scriptOf(seller.address));
    expect(sameAmount(page.fields.btcPayment, paid!.value / 1e8)).toBe(true);
    const dispenses = events.filter(e => e.event === 'DISPENSE');
    expect(dispenses.reduce((sum, e) => sum + Number(e.params.btc_amount), 0)).toBe(2 * paid!.value);
    expect(page.btcFeeSats).toBe(await minedFee(txid));
  }, 600_000);

  it('dispenses from every address format, batched into one block, each get what the review said', async () => {
    const composed = [];
    for (const { format, key } of buyers.slice(1)) {
      const wc = await composeAsWallet('dispense', composeDispense, { dispenser: walletAddress(seller), quantity: '10000' }, key);
      composed.push({ format, key, wc, page: await reviewPageFacts('dispense', wc), approval: await approvalReview(wc.response.result.rawtransaction, key) });
    }
    const txids = await broadcastBatch(await signAll(composed.map(c => ({ response: c.wc.response, key: c.key }))), miner);
    for (const [i, c] of composed.entries()) {
      expect((await parsedTransaction(txids[i]!)).valid, `${c.format} dispense valid`).toBe(true);
      const credited = totalFor(credits(await txEvents(txids[i]!)), c.key.address, 'XCP');
      // The UNIT dispenser closed when it ran out, so only XCP pays.
      expect(c.page.fields.dispensers).toBe('1');
      expect(c.page.fields.numberOfDispenses).toBe('1');
      expect(sameAmount(c.page.fields.youReceive, credited / 1e8), `${c.format}: ${c.page.fields.youReceive} vs ${credited}`).toBe(true);
      expect(sameAmount(c.approval.protocol['You receive']?.[0], credited / 1e8)).toBe(true);
      expect(await balance(c.key.address, 'XCP')).toBe(credited);
    }
  }, 600_000);

  it('closing a dispenser returns the escrow the review states', async () => {
    const found = await counterparty<LedgerDispenser | LedgerDispenser[]>(`/addresses/${seller.address}/dispensers/XCP?verbose=true`);
    const open = Array.isArray(found) ? found[0] : found;
    expect(open!.status).toBe(0);
    const before = await balance(seller.address, 'XCP');
    // The close form (`dispenser/close/form.tsx`) carries the dispenser's remaining escrow as read.
    const wc = await composeAsWallet('dispenser', composeDispenser, {
      asset: 'XCP', status: '10', give_remaining_normalized: open!.give_remaining_normalized,
    }, seller);
    const page = await reviewPageFacts('dispenser-close', wc);
    const approval = await approvalReview(wc.response.result.rawtransaction, seller);
    const txid = await mined(wc, seller);
    expect(approval.label).toBe('Close dispenser');
    expect(approval.headline).toBe('Close the XCP dispenser');

    // Core may hold a close open for a few blocks ("closing") before refunding.
    let closed = await counterparty<LedgerDispenser>(`/dispensers/${open!.tx_hash}?verbose=true`);
    for (let i = 0; i < 12 && closed.status !== 10; i++) {
      await mineBlocks(1, miner);
      closed = await counterparty<LedgerDispenser>(`/dispensers/${open!.tx_hash}?verbose=true`);
    }
    expect(closed.status).toBe(10);
    const refunded = (await balance(seller.address, 'XCP')) - before;
    expect(sameAmount(page.fields.escrowReturned, refunded / 1e8), `review ${page.fields.escrowReturned} vs refund ${refunded}`).toBe(true);
    expect(txid).toBeTruthy();
  }, 600_000);

  it('an order gives and gets what the review states, and its match settles at those amounts', async () => {
    const wc = await composeAsWallet('order', composeOrder, {
      give_asset: 'XCP', give_quantity: '2.5', get_asset: token, get_quantity: '50', expiration: '100', fee_required: '0',
    }, maker);
    const page = await reviewPageFacts('order', wc);
    const approval = await approvalReview(wc.response.result.rawtransaction, maker);
    const txid = await mined(wc, maker);
    const order = await counterparty<{ give_asset: string; give_quantity: number; get_asset: string; get_quantity: number; expiration: number; status: string }>(`/orders/${txid}?verbose=true`);
    expect(page.fields.give!.endsWith(' XCP')).toBe(true);
    expect(sameAmount(page.fields.give, order.give_quantity / 1e8)).toBe(true);
    expect(page.fields.get).toBe(`${order.get_quantity} ${order.get_asset}`);
    expect(page.fields.expiration).toBe(String(order.expiration));
    expect(totalFor(debits(await txEvents(txid)), maker.address, 'XCP')).toBe(order.give_quantity);
    expect(approval.headline).toBe(`Give 2.50000000 XCP for 50 ${token}`);

    // The taker's mirror order matches it.
    const takerWc = await composeAsWallet('order', composeOrder, {
      give_asset: token, give_quantity: '50', get_asset: 'XCP', get_quantity: '2.5', expiration: '100', fee_required: '0',
    }, taker);
    const takerPage = await reviewPageFacts('order', takerWc);
    const takerTxid = await mined(takerWc, taker);
    const events = await txEvents(takerTxid);
    expect(events.some(e => e.event === 'ORDER_MATCH')).toBe(true);
    const takerGot = totalFor(credits(events), taker.address, 'XCP');
    const makerGot = totalFor(credits(events), maker.address, token);
    expect(sameAmount(takerPage.fields.get, takerGot / 1e8)).toBe(true);
    expect(sameAmount(page.fields.get, makerGot)).toBe(true);
  }, 600_000);

  it('cancelling an order refunds the order the review names', async () => {
    const wc = await composeAsWallet('order', composeOrder, {
      give_asset: 'XCP', give_quantity: '1', get_asset: token, get_quantity: '7', expiration: '100', fee_required: '0',
    }, maker);
    const orderTxid = await mined(wc, maker);
    const cancel = await composeAsWallet('cancel', composeCancel, { offer_hash: orderTxid }, maker);
    const page = await reviewPageFacts('cancel', cancel);
    const approval = await approvalReview(cancel.response.result.rawtransaction, maker);
    const txid = await mined(cancel, maker);
    const order = await counterparty<{ status: string; give_quantity: number }>(`/orders/${orderTxid}?verbose=true`);
    expect(page.fields.orderHash).toBe(orderTxid);
    expect(approval.protocol['Order hash']).toEqual([orderTxid]);
    expect(approval.headline).toBe(`Cancel order: sell 1.00000000 XCP for 7 ${token}`);
    expect(order.status).toBe('cancelled');
    expect(totalFor(credits(await txEvents(txid)), maker.address, 'XCP')).toBe(order.give_quantity);
  }, 600_000);

  let btcpay: { matchId: string; sellTxid: string; buyPage: ReviewPageFacts } | undefined;

  it('a BTC order matches, owing the BTC the review states', async () => {
    // The maker sells this run's token (bought above) for BTC; the taker's BTC order matches it and
    // must then pay. A fresh asset keeps orders left on the chain by earlier runs out of the book.
    const sell = await composeAsWallet('order', composeOrder, {
      give_asset: token, give_quantity: '10', get_asset: 'BTC', get_quantity: '0.001', expiration: '100', fee_required: '0',
    }, maker);
    const sellTxid = await mined(sell, maker);
    const buy = await composeAsWallet('order', composeOrder, {
      give_asset: 'BTC', give_quantity: '0.001', get_asset: token, get_quantity: '10', expiration: '100', fee_required: '0',
    }, taker);
    const buyPage = await reviewPageFacts('order', buy);
    const buyTxid = await mined(buy, taker);
    const [match] = await counterparty<LedgerMatch[]>(`/orders/${sellTxid}/matches`);
    expect(match?.status).toBe('pending');
    expect(match?.id).toBe(`${sellTxid}_${buyTxid}`);
    expect(sameAmount(buyPage.fields.give, match!.backward_quantity / 1e8)).toBe(true);
    btcpay = { matchId: match!.id, sellTxid, buyPage };
  }, 600_000);

  // `composer-context.tsx` refuses a BTCPay unless `fetchOrderMatch` reads the match. It once asked
  // for `/v2/order_matches/<id>`, a route Core 11.3 does not serve, so every in-wallet BTCPay
  // failed before review; it now reads `/v2/orders/<tx0_hash>/matches` and picks the match by id.
  it('the wallet composes a BTCPay for the pending match', async () => {
    const error = await composeAsWallet('btcpay', composeBTCPay, { order_match_id: btcpay!.matchId }, taker).then(() => null, e => e);
    expect(error).toBeNull();
  }, 120_000);

  it('a BTCPay, as composed, pays the maker what the ledger asks and settles the match the review names', async () => {
    const { matchId, sellTxid, buyPage } = btcpay!;
    // The production composer on its own, so this settles the match whatever the wallet check says.
    const response = await composeBTCPay({ sourceAddress: walletAddress(taker), order_match_id: matchId, sat_per_vbyte: 2 });
    const approval = await approvalReview(response.result.rawtransaction, taker);
    const [txid] = await broadcastBatch(await signAll([{ response, key: taker }]), miner);
    expect((await parsedTransaction(txid!)).valid).toBe(true);
    expect(approval.label).toBe('BTC Pay');
    expect(approval.protocol['Order match']).toEqual([matchId]);
    const [settled] = await counterparty<LedgerMatch[]>(`/orders/${sellTxid}/matches`);
    expect(settled?.status).toBe('completed');
    const paid = outputsOf(response.result.rawtransaction).find(o => o.script === scriptOf(maker.address));
    expect(paid?.value).toBe(settled!.backward_quantity);
    expect(sameAmount(buyPage.fields.give, paid!.value / 1e8)).toBe(true);
    const received = totalFor(credits(await txEvents(txid!)), taker.address, token);
    expect(sameAmount(buyPage.fields.get, received), `review ${buyPage.fields.get} vs credited ${received}`).toBe(true);
  }, 600_000);
});
