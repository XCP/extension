import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSpentUtxoCache,
  getPendingChangeUtxos,
  getSpentUtxoCacheSize,
  isUtxoRecentlySpent,
  recordPendingChange,
  recordSpentInputsFromRawTx,
  recordSpentUtxos,
} from '../spentUtxoCache';

describe('spentUtxoCache', () => {
  beforeEach(() => {
    clearSpentUtxoCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return true for a recently recorded UTXO', () => {
    recordSpentUtxos([{ txid: 'abc123', vout: 0 }]);
    expect(isUtxoRecentlySpent('abc123', 0)).toBe(true);
  });

  it('should return false for an unknown UTXO', () => {
    expect(isUtxoRecentlySpent('unknown', 0)).toBe(false);
  });

  it('should return false after TTL expires', () => {
    recordSpentUtxos([{ txid: 'abc123', vout: 0 }]);
    expect(isUtxoRecentlySpent('abc123', 0)).toBe(true);

    // Advance past the 60s TTL
    vi.advanceTimersByTime(61_000);

    expect(isUtxoRecentlySpent('abc123', 0)).toBe(false);
  });

  it('should lazily remove expired entries on read', () => {
    recordSpentUtxos([{ txid: 'abc123', vout: 0 }]);
    expect(getSpentUtxoCacheSize()).toBe(1);

    vi.advanceTimersByTime(61_000);
    // Read triggers lazy cleanup
    isUtxoRecentlySpent('abc123', 0);
    expect(getSpentUtxoCacheSize()).toBe(0);
  });

  it('should clear all entries', () => {
    recordSpentUtxos([
      { txid: 'tx1', vout: 0 },
      { txid: 'tx2', vout: 1 },
    ]);
    expect(getSpentUtxoCacheSize()).toBe(2);

    clearSpentUtxoCache();
    expect(getSpentUtxoCacheSize()).toBe(0);
    expect(isUtxoRecentlySpent('tx1', 0)).toBe(false);
  });

  it('should track multiple UTXOs independently', () => {
    recordSpentUtxos([
      { txid: 'tx1', vout: 0 },
      { txid: 'tx1', vout: 1 },
      { txid: 'tx2', vout: 0 },
    ]);

    expect(isUtxoRecentlySpent('tx1', 0)).toBe(true);
    expect(isUtxoRecentlySpent('tx1', 1)).toBe(true);
    expect(isUtxoRecentlySpent('tx2', 0)).toBe(true);
    expect(isUtxoRecentlySpent('tx2', 1)).toBe(false);
  });

  it('should distinguish same txid with different vout', () => {
    recordSpentUtxos([{ txid: 'abc', vout: 0 }]);

    expect(isUtxoRecentlySpent('abc', 0)).toBe(true);
    expect(isUtxoRecentlySpent('abc', 1)).toBe(false);
  });

  it('should handle recording empty inputs array', () => {
    recordSpentUtxos([]);
    expect(getSpentUtxoCacheSize()).toBe(0);
  });
});

describe('recordSpentInputsFromRawTx', () => {
  beforeEach(() => clearSpentUtxoCache());

  // The popup-side half of the split-brain fix: the context that composes must be able to record
  // from the one thing it holds at broadcast time, the signed hex.
  it('records every input of a parseable transaction', () => {
    const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
    tx.addInput({ txid: hexToBytes('11'.repeat(32)), index: 0 });
    tx.addInput({ txid: hexToBytes('22'.repeat(32)), index: 3 });
    tx.addOutput({ script: new Uint8Array([0x6a, 0x01, 0x00]), amount: 0n });
    recordSpentInputsFromRawTx(bytesToHex(tx.unsignedTx));

    expect(isUtxoRecentlySpent('11'.repeat(32), 0)).toBe(true);
    expect(isUtxoRecentlySpent('22'.repeat(32), 3)).toBe(true);
    expect(isUtxoRecentlySpent('33'.repeat(32), 0)).toBe(false);
  });

  // Guessing inputs from bytes we cannot read would exclude UTXOs that are still spendable.
  it('records nothing for unparseable hex', () => {
    recordSpentInputsFromRawTx('not-a-transaction');
    recordSpentInputsFromRawTx('deadbeef');

    expect(getSpentUtxoCacheSize()).toBe(0);
  });
});

// The symmetric twin: what a broadcast gave back, not what it took away. Which outputs are safe
// to register is decided in core/counterparty/pendingChange; this registry just remembers.
describe('pendingChange registry', () => {
  beforeEach(() => {
    clearSpentUtxoCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns registered change for its address only', () => {
    recordPendingChange([
      { txid: 'tx1', vout: 1, address: 'addr-a', value: 4000 },
      { txid: 'tx2', vout: 0, address: 'addr-b', value: 3000 },
    ]);

    expect(getPendingChangeUtxos('addr-a')).toEqual([{ txid: 'tx1', vout: 1, value: 4000 }]);
    expect(getPendingChangeUtxos('addr-b')).toEqual([{ txid: 'tx2', vout: 0, value: 3000 }]);
    expect(getPendingChangeUtxos('addr-c')).toEqual([]);
  });

  // By expiry the mempool lists the change for real, so the virtual copy must bow out.
  it('drops entries after the TTL', () => {
    recordPendingChange([{ txid: 'tx1', vout: 1, address: 'addr-a', value: 4000 }]);
    expect(getPendingChangeUtxos('addr-a')).toHaveLength(1);

    vi.advanceTimersByTime(61_000);

    expect(getPendingChangeUtxos('addr-a')).toEqual([]);
  });

  it('clears with the rest of the cache', () => {
    recordPendingChange([{ txid: 'tx1', vout: 1, address: 'addr-a', value: 4000 }]);

    clearSpentUtxoCache();

    expect(getPendingChangeUtxos('addr-a')).toEqual([]);
  });
});
