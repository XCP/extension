// @vitest-environment node

/**
 * Regtest walk through the UTXO shapes, which are the ones a Counterparty wallet uses daily.
 *
 * An attach from hunted change must not put the ZELD on the asset's UTXO, or the next move to a
 * buyer would carry it away. The wallet names the attach output after the change, hunts the
 * attach, and the ZELD lands on the change. The clean attached output then moves to a buyer
 * without complaint, and a detach of a fresh attachment hunts too, with its change keeping the
 * ZELD the input brought in.
 *
 *   ZELD_REGTEST=1 npx vitest run e2e/zeld/regtest-utxo-shapes.test.ts
 */

import { describe, expect, it, vi } from 'vitest';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { composeAttach, composeIssuance, composeUtxoTransaction } from '@/core/counterparty/compose';
import { assertUtxoCarriesNoZeld, withDetachZeldKept } from '@/core/zeld/composeGuard';
import { DEFAULT_SETTINGS, setSettingsProvider } from '@/core/settings';
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
  rpc,
  scanUnspents,
  signAsWallet,
} from './regtestHarness';

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
    fetchZeldOutpointBalance: async (txid: string, vout: number) => {
      // The indexer's word on one outpoint: ZELD if it is a six-zero txid's first spendable output.
      if (!actual.isLikelyZeldTxid(txid)) return 0n;
      const parsed = parseRawTransactionLocally(await rpc<string>('getrawtransaction', [txid], null));
      return parsed?.outputs.find(o => o.type !== 'op_return')?.index === vout ? 409_600_000_000n : 0n;
    },
  };
});

interface UtxoBalance { utxo: string | null; quantity: number; address: string | null }
const balancesOf = (asset: string) => counterparty<UtxoBalance[]>(`/assets/${asset}/balances`);

/**
 * A UTXO-sourced compose the way `composeMove` and `composeDetach` make it, with the fee inputs
 * named because the regtest node has no Electrs to find them. The ZELD steps are the ones those
 * two run after their compose.
 */
async function composeFromUtxo(endpoint: 'movetoutxo' | 'detach', sourceUtxo: string, address: string, params: Record<string, string>) {
  const others = (await scanUnspents(address))
    .map(u => `${u.txid}:${u.vout}`)
    .filter(outpoint => outpoint !== sourceUtxo)
    .join(',');
  const composeWith = (extra: Record<string, string>) => composeUtxoTransaction(endpoint, { ...params, ...extra, inputs_set: others }, sourceUtxo, 2);
  const composed = await composeWith({});
  if (endpoint === 'movetoutxo') {
    await assertUtxoCarriesNoZeld(sourceUtxo, endpoint);
    return composed;
  }
  return withDetachZeldKept(composed, sourceUtxo, address, composeWith);
}

describe('attach, move and detach from hunted change', () => {
  it.runIf(REGTEST_ENABLED)('keeps ZELD on the change through an attach, so the attached output moves clean', async () => {
    const log = (message: string, detail?: unknown) => console.log(`[zeld utxo] ${message}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
    setSettingsProvider(() => ({ ...DEFAULT_SETTINGS, counterpartyApiBase: process.env.ZELD_REGTEST_COUNTERPARTY ?? 'http://127.0.0.1:24000', allowUnconfirmedTxs: false }));

    const owner = keyFor('utxo-owner');
    const minerAddress = await ensureMinerWallet();
    await fund(minerAddress, [owner], 3);
    await ensureXcp(owner, minerAddress);

    // Issue, hunted: the owner's balance is now one hunted change output carrying ZELD.
    const asset = `ZELDU${String(Date.now()).slice(-6).replace(/\d/g, (d) => 'ABCDEFGHIJ'[Number(d)]!)}`;
    const issued = await huntAsWallet(await composeIssuance({
      sourceAddress: owner.address, asset, quantity: 1000, divisible: false, lock: false, reset: false, sat_per_vbyte: 2,
    }), owner, 6);
    expect(issued.result.zeld_hunt?.status).toBe('found');
    const signedIssue = await signAsWallet(issued, owner);
    await broadcastAndMine(signedIssue.hex, minerAddress);
    log('issued on a six-zero txid', { asset, txid: signedIssue.txid });

    // 1. Attach: named output after the change, hunted, the ZELD (carried and new) on the change.
    const attach = await huntAsWallet(await composeAttach({ sourceAddress: owner.address, asset, quantity: 10, sat_per_vbyte: 2 }), owner, 6);
    expect(attach.result.zeld_hunt?.status).toBe('found');
    expect(attach.result.zeld_protection?.carried_forward).toEqual([`${signedIssue.txid}:1`]);
    const attachTx = parseRawTransactionLocally(attach.result.rawtransaction)!;
    expect(attachTx.outputs.map(o => o.type)).toEqual(['op_return', 'address', 'address']);
    expect(attachTx.outputs[2]?.value).toBe(546);
    const signedAttach = await signAsWallet(attach, owner);
    await broadcastAndMine(signedAttach.hex, minerAddress);
    const attachParsed = await parsedTransaction(signedAttach.txid);
    expect(attachParsed.unpacked_data?.message_type).toBe('attach');
    const attachedUtxo = `${signedAttach.txid}:2`;
    expect((await balancesOf(asset)).some(b => b.utxo === attachedUtxo && b.quantity === 10)).toBe(true);
    log('attached to the output after the change', { txid: signedAttach.txid, utxo: attachedUtxo });

    // 2. Move the attached output to the miner: it carries no ZELD, so nothing objects.
    const move = await huntAsWallet(await composeFromUtxo('movetoutxo', attachedUtxo, owner.address, { destination: minerAddress }), owner, 6);
    expect(move.result.zeld_hunt?.status).toBe('skipped');
    const signedMove = await signAsWallet(move, owner);
    await broadcastAndMine(signedMove.hex, minerAddress);
    expect((await balancesOf(asset)).some(b => b.utxo?.startsWith(signedMove.txid) && b.quantity === 10)).toBe(true);
    log('moved to the buyer', { txid: signedMove.txid });

    // 3. A second attach, then a detach of its clean output: the 546 sats cover the fee, so the
    //    detach has no change and nothing to hunt onto, and needs nothing more.
    const attach2 = await huntAsWallet(await composeAttach({ sourceAddress: owner.address, asset, quantity: 5, sat_per_vbyte: 2 }), owner, 6);
    const signedAttach2 = await signAsWallet(attach2, owner);
    await broadcastAndMine(signedAttach2.hex, minerAddress);
    const detach = await huntAsWallet(await composeFromUtxo('detach', `${signedAttach2.txid}:2`, owner.address, {}), owner, 6);
    expect(detach.result.zeld_hunt?.status).toBe('skipped');
    expect(detach.result.zeld_protection).toBeUndefined();
    expect(parseRawTransactionLocally(detach.result.rawtransaction)!.outputs.map(o => o.type)).toEqual(['op_return']);
    const signedDetach = await signAsWallet(detach, owner);
    await broadcastAndMine(signedDetach.hex, minerAddress);
    expect((await parsedTransaction(signedDetach.txid)).unpacked_data?.message_type).toBe('detach');
    expect((await balancesOf(asset)).some(b => b.address === owner.address && b.utxo === null && b.quantity === 990)).toBe(true);
    log('detached the clean output', { txid: signedDetach.txid });

    // 4. An attach in Counterparty's default layout, hunted, puts the ZELD on the attached output
    //    (what another wallet would do). Detaching it gets a small output of the owner's own for
    //    the ZELD, which is also where the hunt lands.
    const legacyAttach = await huntAsWallet(await compose(owner.address, 'attach', { asset, quantity: '3' }), owner, 6);
    expect(legacyAttach.result.zeld_hunt?.status).toBe('found');
    const signedLegacy = await signAsWallet(legacyAttach, owner);
    await broadcastAndMine(signedLegacy.hex, minerAddress);
    expect((await balancesOf(asset)).some(b => b.utxo === `${signedLegacy.txid}:0` && b.quantity === 3)).toBe(true);
    const kept = await huntAsWallet(await composeFromUtxo('detach', `${signedLegacy.txid}:0`, owner.address, {}), owner, 6);
    expect(kept.result.zeld_protection?.carried_forward).toEqual([`${signedLegacy.txid}:0`]);
    expect(kept.result.zeld_hunt?.status).toBe('found');
    const keptTx = parseRawTransactionLocally(kept.result.rawtransaction)!;
    expect(keptTx.outputs[1]?.value).toBe(330);
    const signedKept = await signAsWallet(kept, owner);
    await broadcastAndMine(signedKept.hex, minerAddress);
    expect((await parsedTransaction(signedKept.txid)).unpacked_data?.message_type).toBe('detach');
    expect((await balancesOf(asset)).some(b => b.address === owner.address && b.utxo === null && b.quantity === 990)).toBe(true);
    log('detached a ZELD-bearing output onto a small output of its own', { txid: signedKept.txid });
  }, 3_600_000);
});
