// @vitest-environment node

/**
 * Regtest proof that a dispense still dispenses when the buyer's change is output 0.
 *
 * That ordering is what lets a hunted wallet keep buying from dispensers with change that carries
 * ZELD: the ZELD (and any new reward) lands on output 0, the dispenser output is credited by
 * position-independent parsing, and the buyer receives the asset.
 *
 * Seller B burns for XCP and opens a dispenser. Buyer A composes a dispense through Counterparty's
 * API, moves its change to output 0 with the wallet's own reorder, hunts, signs, broadcasts, and
 * mines. Then Counterparty must report a valid dispense and A must hold the asset.
 *
 *   ZELD_REGTEST=1 ZELD_REGTEST_ZEROS=4 npx vitest run e2e/zeld/regtest-dispense-order.test.ts
 */

import { describe, expect, it } from 'vitest';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { withChangeFirst } from '@/core/zeld/reorder';
import {
  broadcastAndMine,
  compose,
  counterparty,
  ensureMinerWallet,
  ensureXcp,
  fund,
  huntAsWallet,
  keyFor,
  parsedTransaction,
  REGTEST_ENABLED,
  signAsWallet,
  xcpBalance,
} from './regtestHarness';

const targetZeros = Number(process.env.ZELD_REGTEST_ZEROS ?? 4);

describe('dispense with change first on Counterparty regtest', () => {
  it.runIf(REGTEST_ENABLED)('still dispenses, and the buyer hunts on the way', async () => {
    const log = (message: string, detail?: unknown) => console.log(`[zeld dispense] ${message}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
    const buyer = keyFor('buyer');
    const seller = keyFor('seller');
    const minerAddress = await ensureMinerWallet();
    await fund(minerAddress, [buyer, seller], 2);

    // Seller: XCP from a burn, then a dispenser giving 1 XCP per 10,000 sats with 5 XCP in escrow.
    await ensureXcp(seller, minerAddress);
    const open = await signAsWallet(await compose(seller.address, 'dispenser', {
      asset: 'XCP', give_quantity: '100000000', escrow_quantity: '500000000', mainchainrate: '10000', status: '0',
    }), seller);
    await broadcastAndMine(open.hex, minerAddress);
    const dispensers = await counterparty<Array<{ status: number }>>(`/addresses/${seller.address}/dispensers`);
    expect(dispensers.some(d => d.status === 0)).toBe(true);
    log('dispenser open', { seller: seller.address });

    // Buyer: compose a dispense as the wallet does, then move change to output 0.
    const composed = await compose(buyer.address, 'dispense', { dispenser: seller.address, quantity: '20000' });
    const before = parseRawTransactionLocally(composed.result.rawtransaction)!;
    expect(before.outputs[0]?.script).toBe(seller.scriptHex);
    const reordered = withChangeFirst(composed.result.rawtransaction, buyer.address);
    expect(reordered.movedFrom).toBeGreaterThan(0);
    const after = parseRawTransactionLocally(reordered.rawtransaction)!;
    expect(after.outputs[0]?.script).toBe(buyer.scriptHex);
    expect(after.outputs[1]?.script).toBe(seller.scriptHex);
    expect(after.outputs.map(o => o.type)).toEqual(['address', 'address', 'op_return']);
    log('reordered', { outputs: after.outputs.map(o => `${o.type}:${o.value}`) });

    const hunted = await huntAsWallet(
      { ...composed, result: { ...composed.result, rawtransaction: reordered.rawtransaction } },
      buyer,
      targetZeros,
    );
    expect(hunted.result.zeld_hunt?.status).toBe('found');
    const signed = await signAsWallet(hunted, buyer);
    expect(signed.txid).toBe(hunted.result.zeld_hunt!.txid);
    const txid = await broadcastAndMine(signed.hex, minerAddress);
    log('dispense hunted and mined', { txid });

    const parsed = await parsedTransaction(txid);
    log('parsed', parsed);
    expect(parsed.supported).toBe(true);
    const dispenses = await counterparty<Array<{ tx_hash: string; dispense_quantity: number }>>(`/addresses/${buyer.address}/dispenses/receives`);
    const mine = dispenses.filter(d => d.tx_hash === txid);
    log('dispenses', mine);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.dispense_quantity).toBe(200000000);
    expect(await xcpBalance(buyer.address)).toBe(200000000);
  }, 3_600_000);
});
