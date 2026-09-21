// @vitest-environment node

/**
 * Regtest walk through the one case the guard cannot reorder its way out of.
 *
 * An address whose entire balance sits on hunted change tries to transfer asset ownership. The
 * transfer pays the new owner first, so the guard refuses with a pointer to the ZELD page. The
 * user moves the ZELD to a small output there, tries again, and the transfer goes through with
 * the ZELD still on the small output.
 *
 * The wallet's own compose path is used throughout (Counterparty compose, change-first, guard,
 * hunt), with the regtest node standing in for the public indexers the wallet normally reads.
 *
 *   ZELD_REGTEST=1 npx vitest run e2e/zeld/regtest-park-then-transfer.test.ts
 *
 * Hunts run at six zeros here, because the guard's txid heuristic only engages at six.
 */

import { describe, expect, it, vi } from 'vitest';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { composeIssuance } from '@/core/counterparty/compose';
import { DEFAULT_SETTINGS, setSettingsProvider } from '@/core/settings';
import { composeZeldPark } from '@/core/zeld/sendCompose';
import {
  broadcastAndMine,
  counterparty,
  ensureMinerWallet,
  ensureXcp,
  fund,
  huntAsWallet,
  keyFor,
  parsedTransaction,
  REGTEST_ENABLED,
  rpc,
  signAsWallet,
} from './regtestHarness';

// The wallet reads UTXOs from mempool.space and ZELD balances from api.zeldhash.com, neither of
// which knows this regtest chain. Answer both from the node: the UTXO set, and "every output on a
// six-zero txid that is its first spendable output holds ZELD", which is what the indexer would
// say once those blocks were indexed.
vi.mock('@/core/bitcoin/utxo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/bitcoin/utxo')>()),
  fetchUTXOs: async (address: string) => {
    const { scanUnspents } = await import('./regtestHarness');
    return (await scanUnspents(address)).map(u => ({
      txid: u.txid, vout: u.vout, value: Math.round(u.amount * 1e8),
      status: { confirmed: true, block_height: u.height, block_hash: '', block_time: 0 },
    }));
  },
}));
vi.mock('@/core/zeld/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/zeld/api')>();
  const utxosOf = async (address: string) => {
    const { rpc, scanUnspents } = await import('./regtestHarness');
    const zeld: Array<{ txid: string; vout: number; balance: bigint }> = [];
    for (const u of await scanUnspents(address)) {
      if (!actual.isLikelyZeldTxid(u.txid)) continue;
      const raw = await rpc<string>('getrawtransaction', [u.txid], null);
      const parsed = parseRawTransactionLocally(raw);
      const first = parsed?.outputs.find(o => o.type !== 'op_return');
      if (first?.index === u.vout) zeld.push({ txid: u.txid, vout: u.vout, balance: 409_600_000_000n });
    }
    return zeld;
  };
  return {
    ...actual,
    fetchZeldUtxos: utxosOf,
    fetchZeldBalance: async (address: string) => {
      const utxos = await utxosOf(address);
      return { utxos, baseUnits: utxos.reduce((sum, u) => sum + u.balance, 0n) };
    },
    fetchZeldOutpointBalance: async () => 0n,
  };
});

describe('ownership transfer from an address whose balance is all hunted change', () => {
  it.runIf(REGTEST_ENABLED)('is refused with a pointer, then succeeds after parking the ZELD', async () => {
    const log = (message: string, detail?: unknown) => console.log(`[zeld park] ${message}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
    // Point the wallet's Counterparty reads (compose, parent transactions, attachments) at regtest.
    setSettingsProvider(() => ({ ...DEFAULT_SETTINGS, counterpartyApiBase: process.env.ZELD_REGTEST_COUNTERPARTY ?? 'http://127.0.0.1:24000', allowUnconfirmedTxs: false }));

    const owner = keyFor('owner');
    const minerAddress = await ensureMinerWallet();
    await fund(minerAddress, [owner], 3);
    await ensureXcp(owner, minerAddress);

    // Issue an asset, hunted at six zeros: afterwards the owner's only output is hunted change.
    // A named asset is 4 to 12 uppercase letters, so spell the run's timestamp in letters.
    const asset = `ZELDT${String(Date.now()).slice(-6).replace(/\d/g, (d) => 'ABCDEFGHIJ'[Number(d)]!)}`;
    const issued = await huntAsWallet(await composeIssuance({
      sourceAddress: owner.address, asset, quantity: 1000, divisible: false, lock: false, reset: false, sat_per_vbyte: 2,
    }), owner, 6);
    expect(issued.result.zeld_hunt?.status).toBe('found');
    const signedIssue = await signAsWallet(issued, owner);
    await broadcastAndMine(signedIssue.hex, minerAddress);
    expect((await parsedTransaction(signedIssue.txid)).unpacked_data?.message_type).toBe('issuance');
    log('asset issued on a six-zero txid', { asset, txid: signedIssue.txid });

    // 1. Transfer ownership: pays the new owner first, every input carries ZELD, nothing clean.
    await expect(composeIssuance({
      sourceAddress: owner.address, asset, quantity: 0, divisible: false, lock: false, reset: false,
      transfer_destination: minerAddress, sat_per_vbyte: 2,
    })).rejects.toThrow('Move your ZELD to a small output');
    log('transfer refused as expected');

    // 2. Park: all ZELD onto a 330-sat output, the rest returned as clean change. Hunted too.
    const park = await huntAsWallet(await composeZeldPark({ sourceAddress: owner.address, sat_per_vbyte: 2 }), owner, 6);
    expect(park.result.zeld_send?.park).toBe(true);
    const signedPark = await signAsWallet(park, owner);
    await broadcastAndMine(signedPark.hex, minerAddress);
    const parkTx = parseRawTransactionLocally(await rpc<string>('getrawtransaction', [signedPark.txid], null))!;
    expect(parkTx.outputs[0]?.value).toBe(330);
    log('parked', { txid: signedPark.txid, hunt: park.result.zeld_hunt?.status });

    // 3. Transfer again: funded from the clean change, the small output left alone.
    const transfer = await huntAsWallet(await composeIssuance({
      sourceAddress: owner.address, asset, quantity: 0, divisible: false, lock: false, reset: false,
      transfer_destination: minerAddress, sat_per_vbyte: 2,
    }), owner, 6);
    expect(transfer.result.zeld_hunt?.status).toBe('skipped');
    const transferTx = parseRawTransactionLocally(transfer.result.rawtransaction)!;
    expect(transferTx.inputs.some(i => i.txid === signedPark.txid && i.vout === 0)).toBe(false);
    const signedTransfer = await signAsWallet(transfer, owner);
    await broadcastAndMine(signedTransfer.hex, minerAddress);
    const info = await counterparty<{ owner: string }>(`/assets/${asset}`);
    expect(info.owner).toBe(minerAddress);
    log('transferred', { txid: signedTransfer.txid, owner: info.owner });
  }, 3_600_000);
});
