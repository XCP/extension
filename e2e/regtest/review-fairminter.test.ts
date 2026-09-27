// @vitest-environment node
/**
 * Review versus ledger: opening a fairminter, and fairmints from every address format.
 *
 *   REGTEST=1 REGTEST_BITCOIND=http://127.0.0.1:28443 REGTEST_COUNTERPARTY=http://127.0.0.1:34000 \
 *     npx vitest run e2e/regtest --no-file-parallelism
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { composeFairmint, composeFairminter } from '@/core/counterparty/compose';
import { credits, debits, minedFee, parsedTransaction, sameAmount, totalFor, txEvents } from './ledger';
import { counterparty, REGTEST_ENABLED } from './regtestHarness';
import { broadcastBatch, burnAll, FORMATS, freshAsset, fundAll, keyOf, signAll, startWallet } from './suite';
import { type ApprovalReview, approvalReview, composeAsWallet, type ReviewPageFacts, reviewPageFacts } from './walletReview';

vi.mock('@/core/bitcoin/utxo', async original => (await import('./walletTransport')).utxoTransport(await original()));

interface LedgerFairminter {
  tx_hash: string; asset: string; status: string;
  price: number; price_normalized: string; quantity_by_price: number; quantity_by_price_normalized: string;
  hard_cap: number; hard_cap_normalized: string; max_mint_per_tx: number; max_mint_per_tx_normalized: string;
  description: string; burn_payment: boolean; divisible: boolean;
}

describe.runIf(REGTEST_ENABLED)('fairminter and fairmint: review matches ledger', () => {
  let miner: string;
  // A fairminter's message overflows an OP_RETURN; from a P2PKH source the wallet composes it
  // the ordinary way (bare multisig) rather than in a Taproot envelope.
  const creator = keyOf('P2PKH', 'fairminter creator');
  const minters = FORMATS.map(format => ({ format, key: keyOf(format, `fairmint minter ${format}`) }));
  const name = freshAsset('FAIR');
  let page: ReviewPageFacts;
  let ledger: LedgerFairminter;

  beforeAll(async () => {
    miner = await startWallet();
    await fundAll(miner, [creator, ...minters.map(m => m.key)]);
    await burnAll(miner, [creator, ...minters.map(m => m.key)]);
  }, 900_000);

  it('opens the fairminter the review describes', async () => {
    // What `pages/compose/fairminter/form.tsx` submits: display units, with the price in XCP.
    const wc = await composeAsWallet('fairminter', composeFairminter, {
      asset: name, lot_price: '0.5', lot_price_asset: 'XCP', lot_size: '10', max_mint_per_tx: '100', hard_cap: '1000',
      divisible: 'true', burn_payment: 'false', lock_description: 'false', lock_quantity: 'false', description: 'fair launch',
    }, creator);
    page = await reviewPageFacts('fairminter', wc);
    const approval = await approvalReview(wc.response.result.rawtransaction, creator);
    const [txid] = await broadcastBatch(await signAll([{ response: wc.response, key: creator }]), miner);
    expect((await parsedTransaction(txid!)).valid).toBe(true);
    expect(wc.response.result.btc_fee).toBe(await minedFee(txid!));
    [ledger] = await counterparty<LedgerFairminter[]>(`/assets/${name}/fairminters?verbose=true`) as [LedgerFairminter];
    expect(ledger.tx_hash).toBe(txid);
    expect(page.fields.asset).toBe(name);
    expect(page.fields.description).toBe(ledger.description);

    // The approval screen's protocol rows are in display units and agree with the ledger.
    const shown = `approval ${JSON.stringify(approval.protocol)} vs ledger ${JSON.stringify(ledger)}`;
    // Core's `price` is XCP per lot in base units; its `price_normalized` is per unit (price / lot).
    expect.soft(sameAmount(approval.protocol['XCP price per lot']?.[0], ledger.price / 1e8), shown).toBe(true);
    expect.soft(sameAmount(approval.protocol['Lot size']?.[0], ledger.quantity_by_price_normalized)).toBe(true);
    expect.soft(sameAmount(approval.protocol['Hard cap']?.[0], ledger.hard_cap_normalized)).toBe(true);
    expect.soft(sameAmount(approval.protocol['Per-tx limit']?.[0], ledger.max_mint_per_tx_normalized)).toBe(true);
  }, 600_000);

  // TODO(review-vs-ledger): the compose review page (`fairminter/review.tsx`) renders `lot_price`,
  // `lot_size`, `hard_cap` and `soft_cap` straight from the params, which `verifiedReviewParams`
  // fills with the normalized form data: base units. A 0.5 XCP price for lots of 10 reads
  // "Lot price: 50000000", "Lot size: 1000000000", "Hard cap: 100000000000" while the ledger's
  // fairminter is 0.5 XCP a lot, lots of 10, and a cap of 1,000. The `*_normalized` params exist beside them (the page
  // already uses `max_mint_per_address_normalized` and `pool_quantity_normalized`). Remove `.fails`
  // once the page reads the normalized values.
  it.fails.each([
    ['lotPrice', () => ledger.price / 1e8],
    ['lotSize', () => ledger.quantity_by_price_normalized],
    ['hardCap', () => ledger.hard_cap_normalized],
  ] as const)('review page %s matches the ledger', (field, fromLedger) => {
    expect(sameAmount(page.fields[field], fromLedger()), `review ${page.fields[field]} vs ledger ${fromLedger()}`).toBe(true);
  });

  it('a fairmint from each address format pays and receives what the review states', async () => {
    const cases: Array<{ format: string; key: typeof creator; page: ReviewPageFacts; approval: ApprovalReview; wc: Awaited<ReturnType<typeof composeAsWallet>> }> = [];
    for (const { format, key } of minters) {
      const wc = await composeAsWallet('fairmint', composeFairmint, { asset: name, quantity: '20' }, key);
      cases.push({ format, key, wc, page: await reviewPageFacts('fairmint', wc), approval: await approvalReview(wc.response.result.rawtransaction, key) });
    }
    const txids = await broadcastBatch(await signAll(cases.map(c => ({ response: c.wc.response, key: c.key }))), miner);
    for (const [i, c] of cases.entries()) {
      const txid = txids[i]!;
      expect((await parsedTransaction(txid)).valid, `${c.format} fairmint valid`).toBe(true);
      const events = await txEvents(txid);
      const received = totalFor(credits(events), c.key.address, name);
      const paid = totalFor(debits(events), c.key.address, 'XCP');
      expect(sameAmount(c.page.fields.youReceive, received / 1e8), `${c.format}: ${c.page.fields.youReceive} vs ${received}`).toBe(true);
      expect(sameAmount(c.page.fields.youPay, paid / 1e8), `${c.format}: ${c.page.fields.youPay} vs ${paid}`).toBe(true);
      expect(sameAmount(c.approval.headline, received / 1e8)).toBe(true);
      const price = Object.entries(c.approval.protocol).find(([label]) => label.startsWith('XCP'))?.[1]?.[0];
      expect(sameAmount(price, paid / 1e8), `${c.format}: approval ${price} vs ${paid}`).toBe(true);
    }
  }, 600_000);
});
