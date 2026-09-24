/**
 * When an empty ledger answer for an outpoint may be trusted.
 *
 * Real transactions throughout (ARC4-encrypted OP_RETURN included), laid out the way the
 * marketplace builds them (`packages/market/src/attach.ts`, `offer-funding.ts`): an attach pays
 * its asset UTXO at output 0, carries the encrypted attach message, and returns change last; a
 * fan-out or offer funding has no Counterparty data and pays equal slots from output 0.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Script, Transaction } from '@scure/btc-signer';
import { describe, expect, it, vi } from 'vitest';
import type { UtxoBalance } from '@/core/counterparty/api';
import {
  type AttachmentEvidenceSource,
  classifyOutputExposure,
  createPendingEvidenceContext,
  MAX_PENDING_DEPTH,
  type ParentTransaction,
  resolveEmptyLedgerOutpoint,
} from '@/core/counterparty/pendingAttachments';
import { arc4 } from '@/core/counterparty/unpack/binary';

const WALLET = hexToBytes(`0014${'11'.repeat(20)}`);
const OTHER = hexToBytes(`0014${'22'.repeat(20)}`);

/** CNTRPRTY + one-byte type + UTF-8 body, encrypted with input 0's txid as Core reads it. */
function counterpartyOpReturn(key: string, type: number, body: string): Uint8Array {
  const data = new Uint8Array([
    ...hexToBytes('434e545250525459'), type, ...new TextEncoder().encode(body),
  ]);
  return Script.encode(['RETURN', arc4(hexToBytes(key), data)]);
}

interface Built { id: string; hex: string }

function build(
  inputs: Array<{ txid: string; vout: number }>,
  outputs: Array<Uint8Array | ((key: string) => Uint8Array)>,
): Built {
  const tx = new Transaction({ allowUnknownOutputs: true, disableScriptCheck: true });
  for (const input of inputs) tx.addInput({ txid: input.txid, index: input.vout });
  for (const output of outputs) {
    const script = typeof output === 'function' ? output(inputs[0]!.txid) : output;
    tx.addOutput({ script, amount: script[0] === 0x6a ? 0n : 10_000n });
  }
  return { id: tx.id, hex: bytesToHex(tx.toBytes(true, false)) };
}

const coin = (seed: number) => ({ txid: seed.toString(16).padStart(2, '0').repeat(32), vout: 0 });

/** An attach laid out as the marketplace composes it: asset output 0, message, change. */
const attach = (funding: { txid: string; vout: number }, body = 'RAREPEPE|1|') => build(
  [funding],
  [WALLET, key => counterpartyOpReturn(key, 101, body), WALLET],
);

const RAREPEPE: UtxoBalance = {
  asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1',
} as UtxoBalance;

/** A simulated node and ledger. Every unknown transaction is simply unknown. */
function source(options: {
  parents?: Record<string, ParentTransaction>;
  balances?: Record<string, UtxoBalance[]>;
  freshBalances?: Record<string, UtxoBalance[]>;
  heights?: { backendHeight: number; counterpartyHeight: number } | Error;
} = {}): AttachmentEvidenceSource & { calls: { parent: string[] } } {
  const calls = { parent: [] as string[] };
  return {
    calls,
    balances: vi.fn(async (utxo: string, fresh: boolean) =>
      (fresh ? options.freshBalances?.[utxo] : undefined) ?? options.balances?.[utxo] ?? []),
    parent: vi.fn(async (txid: string) => {
      calls.parent.push(txid);
      return options.parents?.[txid] ?? null;
    }),
    ledgerHeights: vi.fn(async () => {
      if (options.heights instanceof Error) throw options.heights;
      return options.heights ?? { backendHeight: 900_000, counterpartyHeight: 900_000 };
    }),
  };
}

const mempool = (tx: Built): ParentTransaction => ({ rawTxHex: tx.hex, confirmed: false });
const buried = (tx: Built, confirmations = 3): ParentTransaction =>
  ({ rawTxHex: tx.hex, confirmed: true, confirmations });

async function resolve(src: AttachmentEvidenceSource, outpoint: { txid: string; vout: number }) {
  return resolveEmptyLedgerOutpoint(createPendingEvidenceContext(src), outpoint.txid, outpoint.vout);
}

describe('classifyOutputExposure', () => {
  it('exposes an attach\'s default destination (first non-OP_RETURN output), not its change', () => {
    const tx = attach(coin(1));
    expect(classifyOutputExposure(tx.hex)).toMatchObject({
      txid: tx.id, everyOutput: false, attachOutputs: [0], implicitOutput: 0, outputCount: 3,
    });
  });

  it('follows an explicit attach destination vout', () => {
    const tx = attach(coin(1), 'RAREPEPE|1|2');
    expect(classifyOutputExposure(tx.hex)).toMatchObject({ attachOutputs: [2], implicitOutput: 0 });
  });

  it('skips a leading OP_RETURN when finding Core\'s first output', () => {
    const tx = build([coin(1)], [key => counterpartyOpReturn(key, 101, 'RAREPEPE|1|'), OTHER, WALLET]);
    expect(classifyOutputExposure(tx.hex)).toMatchObject({ attachOutputs: [1], implicitOutput: 1 });
  });

  it('exposes nothing for an explicit detach, which credits an address instead', () => {
    const tx = build([coin(1)], [WALLET, key => counterpartyOpReturn(key, 102, '0')]);
    expect(classifyOutputExposure(tx.hex)).toMatchObject({ attachOutputs: [], implicitOutput: null });
  });

  it('exposes only the implicit move for a transaction without Counterparty data', () => {
    const tx = build([coin(1)], [WALLET, WALLET, WALLET]);
    expect(classifyOutputExposure(tx.hex)).toMatchObject({
      everyOutput: false, attachOutputs: [], implicitOutput: 0,
    });
  });

  it('exposes every output for a payload it cannot read as a message', () => {
    // Encrypted CNTRPRTY prefix with a garbage attach body: prefix decrypts, unpack fails.
    const tx = build([coin(1)], [WALLET, key => counterpartyOpReturn(key, 101, 'no pipes here'), WALLET]);
    expect(classifyOutputExposure(tx.hex)?.everyOutput).toBe(true);
  });

  it('exposes every output for a legacy UTXO move and a taproot-reveal marker', () => {
    const move = build([coin(1)], [WALLET, key => counterpartyOpReturn(key, 100, `${'aa'.repeat(32)}:0|x|RAREPEPE|1`)]);
    expect(classifyOutputExposure(move.hex)?.everyOutput).toBe(true);
    const reveal = build([coin(1)], [WALLET, Script.encode(['RETURN', hexToBytes('434e545250525459')])]);
    expect(classifyOutputExposure(reveal.hex)?.everyOutput).toBe(true);
  });

  it('refuses bytes that are not a transaction', () => {
    expect(classifyOutputExposure('00')).toBeNull();
  });
});

describe('resolveEmptyLedgerOutpoint', () => {
  // The finding: a hostile site asks for a plain spend of the output a still-unconfirmed attach
  // just bound an asset to. The ledger reads it as empty; that must not read as clean.
  it('reports an unconfirmed attach\'s asset output as pending', async () => {
    const tx = attach(coin(1));
    const src = source({ parents: { [tx.id]: mempool(tx) } });
    expect(await resolve(src, { txid: tx.id, vout: 0 })).toEqual({ kind: 'pending', parentTxid: tx.id });
  });

  it('keeps an unconfirmed attach\'s change clean, so preparation chains continue', async () => {
    const first = attach(coin(1));
    const second = attach({ txid: first.id, vout: 2 });
    const src = source({ parents: { [first.id]: mempool(first), [second.id]: mempool(second) } });
    expect(await resolve(src, { txid: first.id, vout: 2 })).toEqual({ kind: 'clean' });
    expect(await resolve(src, { txid: second.id, vout: 2 })).toEqual({ kind: 'clean' });
    // Deciding that needed neither the ledger height nor any ancestor.
    expect(src.ledgerHeights).not.toHaveBeenCalled();
    expect(src.balances).not.toHaveBeenCalled();
  });

  it('reports an explicit attach destination pending wherever it points', async () => {
    const tx = build([coin(1)], [WALLET, key => counterpartyOpReturn(key, 101, 'RAREPEPE|1|2'), OTHER]);
    const src = source({ parents: { [tx.id]: mempool(tx) } });
    expect(await resolve(src, { txid: tx.id, vout: 2 })).toEqual({ kind: 'pending', parentTxid: tx.id });
  });

  it('keeps every output of an unconfirmed detach clean', async () => {
    const tx = build([coin(1)], [WALLET, key => counterpartyOpReturn(key, 102, '0'), WALLET]);
    const src = source({ parents: { [tx.id]: mempool(tx) } });
    expect(await resolve(src, { txid: tx.id, vout: 0 })).toEqual({ kind: 'clean' });
    expect(await resolve(src, { txid: tx.id, vout: 2 })).toEqual({ kind: 'clean' });
  });

  describe('plain-BTC parents (fan-out, offer funding)', () => {
    const root = build([coin(7)], [WALLET]);
    const fanout = build([{ txid: root.id, vout: 0 }], [WALLET, WALLET, WALLET]);

    it('keeps every slot of an unconfirmed fan-out funded by clean coins clean', async () => {
      const src = source({ parents: { [fanout.id]: mempool(fanout), [root.id]: buried(root) } });
      for (const vout of [0, 1, 2]) {
        expect(await resolve(src, { txid: fanout.id, vout })).toEqual({ kind: 'clean' });
      }
    });

    it('only examines the funding for the first slot, which Core would move assets to', async () => {
      const src = source({ parents: { [fanout.id]: mempool(fanout) } });
      expect(await resolve(src, { txid: fanout.id, vout: 1 })).toEqual({ kind: 'clean' });
      expect(src.calls.parent).toEqual([fanout.id]);
    });

    it('reports the first output pending when the parent spends an attached UTXO', async () => {
      const attached = coin(8);
      const mover = build([attached, { txid: root.id, vout: 0 }], [OTHER, WALLET]);
      const src = source({
        parents: { [mover.id]: mempool(mover) },
        balances: { [`${attached.txid}:0`]: [RAREPEPE] },
      });
      expect(await resolve(src, { txid: mover.id, vout: 0 })).toEqual({ kind: 'pending', parentTxid: mover.id });
      expect(await resolve(src, { txid: mover.id, vout: 1 })).toEqual({ kind: 'clean' });
    });

    it('follows a move of a still-pending attachment up the chain', async () => {
      const pendingAttach = attach(coin(1));
      const mover = build([{ txid: pendingAttach.id, vout: 0 }], [OTHER]);
      const src = source({ parents: { [pendingAttach.id]: mempool(pendingAttach), [mover.id]: mempool(mover) } });
      expect(await resolve(src, { txid: mover.id, vout: 0 })).toEqual({ kind: 'pending', parentTxid: mover.id });
    });

    it('does not follow an unconfirmed chain forever', async () => {
      let tip = build([coin(1)], [WALLET]);
      const parents: Record<string, ParentTransaction> = { [tip.id]: mempool(tip) };
      for (let step = 0; step <= MAX_PENDING_DEPTH + 1; step++) {
        tip = build([{ txid: tip.id, vout: 0 }], [WALLET]);
        parents[tip.id] = mempool(tip);
      }
      expect(await resolve(source({ parents }), { txid: tip.id, vout: 0 })).toEqual({ kind: 'unknown' });
    });

    it('reports unknown when a funding input\'s lookup fails', async () => {
      const src = source({ parents: { [fanout.id]: mempool(fanout) } });
      vi.mocked(src.balances).mockRejectedValueOnce(new Error('rate limited'));
      expect(await resolve(src, { txid: fanout.id, vout: 0 })).toEqual({ kind: 'unknown' });
    });
  });

  describe('confirmed parents', () => {
    const tx = attach(coin(1));

    it('re-reads the ledger once it has parsed the block, rather than trusting the first read', async () => {
      const src = source({
        parents: { [tx.id]: buried(tx, 1) },
        freshBalances: { [`${tx.id}:0`]: [RAREPEPE] },
      });
      expect(await resolve(src, { txid: tx.id, vout: 0 })).toEqual({ kind: 'assets', balances: [RAREPEPE] });
      expect(src.balances).toHaveBeenCalledWith(`${tx.id}:0`, true);
    });

    it('accepts a parsed, still-empty attach output as clean (the attach did not take)', async () => {
      const src = source({ parents: { [tx.id]: buried(tx, 1) } });
      expect(await resolve(src, { txid: tx.id, vout: 0 })).toEqual({ kind: 'clean' });
    });

    it('reports pending while the ledger lags the block that confirmed it', async () => {
      const src = source({
        parents: { [tx.id]: buried(tx, 1) },
        heights: { backendHeight: 900_001, counterpartyHeight: 900_000 },
      });
      expect(await resolve(src, { txid: tx.id, vout: 0 })).toEqual({ kind: 'pending', parentTxid: tx.id });
    });

    it('compares an explorer-reported block height directly', async () => {
      const at = (blockHeight: number) => source({ parents: { [tx.id]: { rawTxHex: tx.hex, confirmed: true, blockHeight } } });
      expect(await resolve(at(900_000), { txid: tx.id, vout: 0 })).toEqual({ kind: 'clean' });
      expect(await resolve(at(900_001), { txid: tx.id, vout: 0 })).toEqual({ kind: 'pending', parentTxid: tx.id });
    });

    it('reports unknown when the ledger height cannot be read', async () => {
      const src = source({ parents: { [tx.id]: buried(tx) }, heights: new Error('down') });
      expect(await resolve(src, { txid: tx.id, vout: 0 })).toEqual({ kind: 'unknown' });
    });
  });

  it('reports unknown for an outpoint whose transaction nobody knows', async () => {
    expect(await resolve(source(), coin(3))).toEqual({ kind: 'unknown' });
  });

  it('reports unknown for bytes that do not hash to the outpoint\'s txid', async () => {
    const real = attach(coin(1));
    const decoy = build([coin(2)], [WALLET, WALLET]);
    const src = source({ parents: { [real.id]: mempool(decoy) } });
    expect(await resolve(src, { txid: real.id, vout: 1 })).toEqual({ kind: 'unknown' });
  });

  it('reports unknown for an output the transaction does not have', async () => {
    const tx = attach(coin(1));
    expect(await resolve(source({ parents: { [tx.id]: mempool(tx) } }), { txid: tx.id, vout: 7 }))
      .toEqual({ kind: 'unknown' });
  });

  it('fetches a parent shared by several inputs once', async () => {
    const tx = attach(coin(1));
    const src = source({ parents: { [tx.id]: mempool(tx) } });
    const context = createPendingEvidenceContext(src);
    await Promise.all([
      resolveEmptyLedgerOutpoint(context, tx.id, 0),
      resolveEmptyLedgerOutpoint(context, tx.id, 2),
    ]);
    expect(src.parent).toHaveBeenCalledTimes(1);
  });
});
