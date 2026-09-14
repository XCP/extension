// @vitest-environment node

/**
 * End-to-end proof on regtest that a hunted transaction is still the Counterparty transaction it
 * was composed as.
 *
 * Runs the wallet's own compose-time hunt against a live Bitcoin Core + Counterparty Core stack,
 * signs the hunted bytes the way the wallet does, broadcasts them, mines them, and reads back what
 * Counterparty made of them. Three shapes are exercised:
 *
 * 1. A broadcast (OP_RETURN data, then change): hunted, and parsed as a valid broadcast.
 * 2. A burn (burn address first, then change): the hunt refuses it, because the first spendable
 *    output is not ours, and the transaction is still a valid burn.
 * 3. An enhanced XCP send (OP_RETURN data, then change): hunted, and parsed as a valid send.
 *
 *   ZELD_REGTEST=1 ZELD_REGTEST_ZEROS=6 npx vitest run e2e/zeld/regtest-hunt.test.ts
 *
 * At six zeros a single thread needs a few minutes; ZELD_REGTEST_ZEROS=4 proves the same
 * Counterparty handling in seconds.
 */

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countLeadingZeroNibbles } from '@/core/zeld/protocol';
import {
  broadcastAndMine,
  compose,
  counterparty,
  ensureMinerWallet,
  fund,
  huntAsWallet,
  keyFor,
  parsedTransaction,
  REGTEST_ENABLED,
  rpc,
  signAsWallet,
  xcpBalance,
} from './regtestHarness';

const targetZeros = Number(process.env.ZELD_REGTEST_ZEROS ?? 6);

describe('ZELD hunt on Counterparty regtest', () => {
  it.runIf(REGTEST_ENABLED)(`hunts ${targetZeros} zeros and Counterparty still parses every message`, async () => {
    const lines: string[] = [];
    const log = (message: string, detail?: unknown) => {
      const line = `[zeld regtest] ${message}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`;
      lines.push(line);
      console.log(line);
      // Also written to ZELD_REGTEST_OUT when set, so a CI log filter cannot lose the evidence.
      if (process.env.ZELD_REGTEST_OUT) writeFileSync(process.env.ZELD_REGTEST_OUT, `${lines.join('\n')}\n`);
    };

    const hunter = keyFor('hunter');
    const minerAddress = await ensureMinerWallet();
    await fund(minerAddress, [hunter], 3);
    log('funded', { hunter: hunter.address });

    // 1. Broadcast: data output first, change second. Hunted.
    const broadcast = await huntAsWallet(await compose(hunter.address, 'broadcast', {
      text: 'ZELD hunt regtest', value: '0', fee_fraction: '0', encoding: 'opreturn',
    }), hunter, targetZeros);
    expect(broadcast.result.zeld_hunt?.status).toBe('found');
    expect(countLeadingZeroNibbles(broadcast.result.zeld_hunt!.txid!)).toBeGreaterThanOrEqual(targetZeros);
    const signedBroadcast = signAsWallet(broadcast, hunter);
    expect(signedBroadcast.txid).toBe(broadcast.result.zeld_hunt!.txid);
    log('broadcast hunted', broadcast.result.zeld_hunt);
    await broadcastAndMine(signedBroadcast.hex, minerAddress);
    const parsedBroadcast = await parsedTransaction(signedBroadcast.txid);
    expect(parsedBroadcast.supported).toBe(true);
    expect(parsedBroadcast.unpacked_data?.message_type).toBe('broadcast');
    const broadcasts = await counterparty<Array<{ text: string; tx_hash: string }>>(`/addresses/${hunter.address}/broadcasts`);
    expect(broadcasts.some(item => item.tx_hash === signedBroadcast.txid && item.text === 'ZELD hunt regtest')).toBe(true);
    log('broadcast parsed', { txid: signedBroadcast.txid, message_type: parsedBroadcast.unpacked_data?.message_type });

    // 2. Burn: the burn address is the first spendable output, so the hunt must refuse.
    const burn = await huntAsWallet(await compose(hunter.address, 'burn', { quantity: '100000000' }), hunter, targetZeros);
    expect(burn.result.zeld_hunt).toMatchObject({ status: 'skipped', reason: expect.stringContaining('someone else') });
    const signedBurn = signAsWallet(burn, hunter);
    await broadcastAndMine(signedBurn.hex, minerAddress);
    const parsedBurn = await parsedTransaction(signedBurn.txid);
    expect(parsedBurn.supported).toBe(true);
    const xcp = await xcpBalance(hunter.address);
    expect(xcp).toBeGreaterThan(0);
    log('burn refused by the hunt and credited by Counterparty', { txid: signedBurn.txid, xcp });

    // 3. Enhanced send: data output first, change second. Hunted.
    const send = await huntAsWallet(await compose(hunter.address, 'send', {
      destination: minerAddress, asset: 'XCP', quantity: '100000000', use_enhanced_send: 'true', encoding: 'opreturn',
    }), hunter, targetZeros);
    expect(send.result.zeld_hunt?.status).toBe('found');
    const signedSend = signAsWallet(send, hunter);
    expect(signedSend.txid).toBe(send.result.zeld_hunt!.txid);
    log('send hunted', send.result.zeld_hunt);
    await broadcastAndMine(signedSend.hex, minerAddress);
    const parsedSend = await parsedTransaction(signedSend.txid);
    expect(parsedSend.supported).toBe(true);
    expect(parsedSend.unpacked_data?.message_type).toBe('enhanced_send');
    expect(await xcpBalance(minerAddress)).toBe(100000000);
    log('send parsed', { txid: signedSend.txid });

    // The ZELD side of every hunted transaction: nLockTime carries the nonce behind final
    // sequences, and the first spendable output, where the reward lands, is the hunter's own.
    for (const txid of [signedBroadcast.txid, signedSend.txid]) {
      const decoded = await rpc<{ locktime: number; vin: Array<{ sequence: number }>; vout: Array<{ scriptPubKey: { type: string; hex: string } }> }>(
        'getrawtransaction', [txid, true],
      );
      expect(decoded.vin.every(input => input.sequence === 0xffff_ffff)).toBe(true);
      expect(decoded.locktime).toBeGreaterThan(0);
      const rewardOutput = decoded.vout.find(output => output.scriptPubKey.type !== 'nulldata');
      expect(rewardOutput?.scriptPubKey.hex).toBe(hunter.scriptHex);
    }
    log('done', { broadcast: signedBroadcast.txid, send: signedSend.txid });
  }, 3_600_000);
});
