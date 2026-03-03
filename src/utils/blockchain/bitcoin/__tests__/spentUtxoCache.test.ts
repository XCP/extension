import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  recordSpentUtxos,
  isUtxoRecentlySpent,
  clearSpentUtxoCache,
  getSpentUtxoCacheSize,
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
