// @vitest-environment node

/**
 * Regtest proof of the nested SegWit (P2SH-P2WPKH) hunt: the txid the hunt finds before signing,
 * over the redeem-script scriptSig the signer will produce, is the txid of the signed transaction
 * the node accepts and Counterparty parses.
 *
 *   ZELD_REGTEST=1 ZELD_REGTEST_ZEROS=4 npx vitest run e2e/zeld/regtest-nested-hunt.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  broadcastAndMine,
  compose,
  ensureMinerWallet,
  fund,
  huntAsWallet,
  nestedKeyFor,
  parsedTransaction,
  REGTEST_ENABLED,
  rpc,
  signAsWallet,
} from './regtestHarness';

const targetZeros = Number(process.env.ZELD_REGTEST_ZEROS ?? 4);

describe('nested SegWit hunt on regtest', () => {
  it.runIf(REGTEST_ENABLED)(`hunts a broadcast from a P2SH-P2WPKH address to a ${targetZeros}-zero txid`, async () => {
    const hunter = nestedKeyFor('hunter');
    const minerAddress = await ensureMinerWallet();
    await fund(minerAddress, [hunter], 3);

    const hunted = await huntAsWallet(await compose(hunter.address, 'broadcast', {
      text: 'ZELD nested regtest', value: '0', fee_fraction: '0', encoding: 'opreturn',
    }), hunter, targetZeros);
    expect(hunted.result.zeld_hunt?.status).toBe('found');
    const signed = await signAsWallet(hunted, hunter);
    expect(signed.txid).toBe(hunted.result.zeld_hunt!.txid);
    console.log(`[zeld nested] ${signed.txid} after ${hunted.result.zeld_hunt!.attempts} attempts`);

    const txid = await broadcastAndMine(signed.hex, minerAddress);
    expect(txid).toBe(signed.txid);
    const decoded = await rpc<{ locktime: number; vin: Array<{ sequence: number; scriptSig: { hex: string } }> }>('getrawtransaction', [txid, true]);
    expect(decoded.locktime).toBe(hunted.result.zeld_hunt!.nonce);
    expect(decoded.vin[0]!.scriptSig.hex).toBe('16' + Buffer.from(hunter.redeemScript!).toString('hex'));
    const parsed = await parsedTransaction(txid);
    expect(parsed.supported).toBe(true);
    expect(parsed.unpacked_data?.message_type).toBe('broadcast');
  }, 3_600_000);
});
