// @vitest-environment node

/**
 * Regtest proof of the legacy (P2PKH) signing-time hunt: a Counterparty enhanced send from a
 * legacy address is composed through the real API, signed per attempt by the wallet's own
 * legacy hunt until the txid has the target zeros, accepted by the node and parsed by
 * Counterparty as the enhanced send it is.
 *
 *   ZELD_REGTEST=1 ZELD_REGTEST_ZEROS=4 npx vitest run e2e/zeld/regtest-legacy-hunt.test.ts
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { huntTxid } from '@/core/zeld/hunt';
import { huntZeldWhileSigning } from '@/core/zeld/signHunt';
import {
  broadcastAndMine,
  compose,
  ensureMinerWallet,
  ensureXcp,
  fund,
  legacyKeyFor,
  parsedTransaction,
  REGTEST_ENABLED,
  rpc,
  xcpBalance,
} from './regtestHarness';

const targetZeros = Number(process.env.ZELD_REGTEST_ZEROS ?? 4);

describe('legacy signing-time hunt on regtest', () => {
  it.runIf(REGTEST_ENABLED)(`signs an enhanced send from a P2PKH address with a ${targetZeros}-zero txid`, async () => {
    const hunter = legacyKeyFor('hunter');
    const recipient = legacyKeyFor('recipient');
    const minerAddress = await ensureMinerWallet();
    await fund(minerAddress, [hunter], 3);
    await ensureXcp(hunter, minerAddress);

    const composed = await compose(hunter.address, 'send', { asset: 'XCP', quantity: '100000000', destination: recipient.address });
    const hunted = await huntZeldWhileSigning({
      rawTxHex: composed.result.rawtransaction,
      sourceAddress: hunter.address,
      lockScripts: composed.result.lock_scripts,
      privateKeyHex: bytesToHex(hunter.privateKey),
      compressed: true,
      seconds: 60,
      targetZeros,
      hunt: (job, options) => huntTxid(job, { ...options, seconds: 1_800, createWorker: () => null, batchSize: 20_000 }),
    });
    expect(hunted).not.toBeNull();
    expect(hunted!.txid.startsWith('0'.repeat(targetZeros))).toBe(true);
    console.log(`[zeld legacy] found ${hunted!.txid} after ${hunted!.attempts} attempts in ${(hunted!.elapsedMs / 1000).toFixed(1)}s`);

    const txid = await broadcastAndMine(hunted!.signedTxHex, minerAddress);
    expect(txid).toBe(hunted!.txid);
    const decoded = await rpc<{ locktime: number; vin: Array<{ sequence: number; scriptSig: { hex: string } }>; vout: Array<{ scriptPubKey: { type: string; hex: string } }> }>(
      'getrawtransaction', [txid, true],
    );
    expect(decoded.locktime).toBe(hunted!.nonce);
    expect(decoded.vin.every(input => input.sequence === 0xffff_ffff)).toBe(true);
    expect(decoded.vin[0]!.scriptSig.hex.length).toBeGreaterThan(200);
    expect(decoded.vout.find(output => output.scriptPubKey.type !== 'nulldata')?.scriptPubKey.hex).toBe(hunter.scriptHex);

    const parsed = await parsedTransaction(txid);
    expect(parsed.supported).toBe(true);
    expect(parsed.unpacked_data?.message_type).toBe('enhanced_send');
    expect(await xcpBalance(recipient.address)).toBeGreaterThanOrEqual(100_000_000);
  }, 3_600_000);
});
