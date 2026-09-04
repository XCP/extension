import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as alkanesInputAssets from '@/core/alkanes/inputAssets';
import {
  clearSpentUtxoCache,
  recordPendingChange,
  recordSpentUtxos,
} from '@/core/bitcoin/spentUtxoCache';
import * as bitcoinUtxo from '@/core/bitcoin/utxo';
import * as counterpartyApi from '@/core/counterparty/api';
import { asDisplayUnits } from '@/core/numeric';
import { DEFAULT_SETTINGS, getActiveSettings } from '@/core/settings';
import { selectUtxosForTransaction } from '../utxoSelection';

// Mock dependencies
vi.mock('@/core/bitcoin/utxo');
vi.mock('@/core/alkanes/inputAssets');
vi.mock('@/core/counterparty/api');
vi.mock('@/core/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/settings')>();
  return { ...actual, getActiveSettings: vi.fn().mockReturnValue(actual.DEFAULT_SETTINGS) };
});

const mockedFetchUTXOs = vi.mocked(bitcoinUtxo.fetchUTXOs);
const mockedFetchTokenBalances = vi.mocked(counterpartyApi.fetchTokenBalances);
const mockedFormatInputsSet = vi.mocked(bitcoinUtxo.formatInputsSet);
const mockedFetchInputsAlkanes = vi.mocked(alkanesInputAssets.fetchInputsAlkanes);
const mockedGetSettings = vi.mocked(getActiveSettings);

// Test data
const mockAddress = 'bc1qtest123address';

const createMockUtxo = (txid: string, vout: number, value: number, confirmed = true) => ({
  txid,
  vout,
  value,
  status: {
    confirmed,
    block_height: confirmed ? 800000 : 0,
    block_hash: confirmed ? 'blockhash123' : '',
    block_time: confirmed ? 1700000000 : 0,
  },
});

describe('selectUtxosForTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSettings.mockReturnValue(DEFAULT_SETTINGS);
    mockedFetchInputsAlkanes.mockResolvedValue([]);
    clearSpentUtxoCache();
    // Default mock for formatInputsSet
    mockedFormatInputsSet.mockImplementation((utxos) =>
      utxos.map(u => `${u.txid}:${u.vout}`).join(',')
    );
  });

  it('should select UTXOs without attached assets', async () => {
    const mockUtxos = [
      createMockUtxo('tx1', 0, 50000),
      createMockUtxo('tx2', 0, 30000),
      createMockUtxo('tx3', 1, 20000),
    ];

    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([]); // No UTXO balances

    const result = await selectUtxosForTransaction(mockAddress);

    expect(result.utxos).toHaveLength(3);
    expect(result.totalValue).toBe(100000);
    expect(result.excludedWithAssets).toBe(0);
    expect(mockedFetchUTXOs).toHaveBeenCalledWith(mockAddress);
    expect(mockedFetchTokenBalances).toHaveBeenCalledWith(mockAddress, {
      type: 'utxo',
      limit: 1000,
      verbose: false,
    });
  });

  it('should filter out UTXOs with attached Counterparty assets', async () => {
    const mockUtxos = [
      createMockUtxo('tx1', 0, 50000),
      createMockUtxo('tx2', 0, 30000), // Has attached asset
      createMockUtxo('tx3', 1, 20000),
    ];

    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([
      { asset: 'MYASSET', quantity_normalized: asDisplayUnits('100'), utxo: 'tx2:0' },
    ]);

    const result = await selectUtxosForTransaction(mockAddress);

    expect(result.utxos).toHaveLength(2);
    expect(result.utxos.map(u => u.txid)).toEqual(['tx1', 'tx3']);
    expect(result.totalValue).toBe(70000);
    expect(result.excludedWithAssets).toBe(1);
    expect(result.excludedValue).toBe(30000); // tx2:0 was excluded
  });

  it('filters Alkanes-bearing UTXOs when experimental protection is active', async () => {
    const mockUtxos = [
      createMockUtxo('a'.repeat(64), 0, 50000),
      createMockUtxo('b'.repeat(64), 1, 30000),
    ];
    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([]);
    mockedGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS, protectAlkanesUtxos: true });
    mockedFetchInputsAlkanes.mockResolvedValue([{
      inputIndex: 1,
      utxo: `${'b'.repeat(64)}:1`,
      balances: [{ id: '2:0', value: '25' }],
    }]);

    const result = await selectUtxosForTransaction(mockAddress);

    expect(result.utxos.map(utxo => utxo.txid)).toEqual(['a'.repeat(64)]);
    expect(result.excludedWithAssets).toBe(1);
  });

  it('separates a pure DIESEL UTXO only for an explicitly routing mint flow', async () => {
    const dieselTxid = 'b'.repeat(64);
    const otherAlkaneTxid = 'c'.repeat(64);
    const pendingDieselTxid = 'd'.repeat(64);
    const mockUtxos = [
      createMockUtxo('a'.repeat(64), 0, 50_000),
      createMockUtxo(dieselTxid, 1, 80_000),
      createMockUtxo(otherAlkaneTxid, 2, 90_000),
      createMockUtxo(pendingDieselTxid, 3, 100_000, false),
    ];
    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([]);
    mockedGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS, enableDieselMinting: true });
    mockedFetchInputsAlkanes.mockResolvedValue([
      {
        inputIndex: 1,
        utxo: `${dieselTxid}:1`,
        balances: [{ id: '2:0', value: '250000000' }],
      },
      {
        inputIndex: 2,
        utxo: `${otherAlkaneTxid}:2`,
        balances: [{ id: '4:7', value: '1' }],
      },
      {
        inputIndex: 3,
        utxo: `${pendingDieselTxid}:3`,
        balances: [{ id: '2:0', value: '300000000' }],
      },
    ]);

    const result = await selectUtxosForTransaction(mockAddress, {
      includeDieselUtxos: true,
      allowUnconfirmed: true,
    });

    expect(result.utxos.map((utxo) => utxo.txid)).toEqual(['a'.repeat(64)]);
    expect(result.dieselUtxos?.map((utxo) => utxo.txid)).toEqual([dieselTxid]);
    expect(result.excludedWithAssets).toBe(2);
  });

  it('also filters inputs whose Alkanes status is unknown', async () => {
    const txid = 'a'.repeat(64);
    mockedFetchUTXOs.mockResolvedValue([createMockUtxo(txid, 0, 50000)]);
    mockedFetchTokenBalances.mockResolvedValue([]);
    mockedGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS, protectAlkanesUtxos: true });
    mockedFetchInputsAlkanes.mockResolvedValue([{
      inputIndex: 0,
      utxo: `${txid}:0`,
      balances: [],
      lookupFailed: true,
    }]);

    await expect(selectUtxosForTransaction(mockAddress)).rejects.toThrow('Insufficient UTXOs');
  });

  it('should sort UTXOs by value (highest first)', async () => {
    const mockUtxos = [
      createMockUtxo('tx1', 0, 10000),
      createMockUtxo('tx2', 0, 50000),
      createMockUtxo('tx3', 1, 30000),
    ];

    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([]);

    const result = await selectUtxosForTransaction(mockAddress);

    expect(result.utxos[0]!.value).toBe(50000);
    expect(result.utxos[1]!.value).toBe(30000);
    expect(result.utxos[2]!.value).toBe(10000);
  });

  it('should limit to maxUtxos (default 20)', async () => {
    const mockUtxos = Array.from({ length: 25 }, (_, i) =>
      createMockUtxo(`tx${i}`, 0, 1000 * (25 - i))
    );

    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([]);

    const result = await selectUtxosForTransaction(mockAddress);

    expect(result.utxos).toHaveLength(20);
  });

  it('should respect custom maxUtxos option', async () => {
    const mockUtxos = Array.from({ length: 10 }, (_, i) =>
      createMockUtxo(`tx${i}`, 0, 1000)
    );

    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([]);

    const result = await selectUtxosForTransaction(mockAddress, { maxUtxos: 5 });

    expect(result.utxos).toHaveLength(5);
  });

  it('should filter out unconfirmed UTXOs by default', async () => {
    const mockUtxos = [
      createMockUtxo('tx1', 0, 50000, true),
      createMockUtxo('tx2', 0, 30000, false), // Unconfirmed
      createMockUtxo('tx3', 1, 20000, true),
    ];

    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([]);

    const result = await selectUtxosForTransaction(mockAddress);

    expect(result.utxos).toHaveLength(2);
    expect(result.utxos.every(u => u.status.confirmed)).toBe(true);
  });

  it('should include unconfirmed UTXOs when allowUnconfirmed is true', async () => {
    const mockUtxos = [
      createMockUtxo('tx1', 0, 50000, true),
      createMockUtxo('tx2', 0, 30000, false), // Unconfirmed
    ];

    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([]);

    const result = await selectUtxosForTransaction(mockAddress, {
      allowUnconfirmed: true,
    });

    expect(result.utxos).toHaveLength(2);
  });

  it('should throw error when no UTXOs available', async () => {
    mockedFetchUTXOs.mockResolvedValue([]);

    await expect(selectUtxosForTransaction(mockAddress)).rejects.toThrow(
      'No UTXOs available for this address'
    );
  });

  it('should throw error when insufficient UTXOs after filtering', async () => {
    const mockUtxos = [
      createMockUtxo('tx1', 0, 50000), // Has attached asset
    ];

    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([
      { asset: 'MYASSET', quantity_normalized: asDisplayUnits('100'), utxo: 'tx1:0' },
    ]);

    await expect(selectUtxosForTransaction(mockAddress)).rejects.toThrow(
      'Insufficient UTXOs: found 0, need at least 1'
    );
  });

  it('should respect minUtxos option', async () => {
    const mockUtxos = [
      createMockUtxo('tx1', 0, 50000),
    ];

    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([]);

    await expect(
      selectUtxosForTransaction(mockAddress, { minUtxos: 2 })
    ).rejects.toThrow('Insufficient UTXOs: found 1, need at least 2');
  });

  it('should return correct inputsSet format', async () => {
    const mockUtxos = [
      createMockUtxo('abc123', 0, 50000),
      createMockUtxo('def456', 2, 30000),
    ];

    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([]);

    const result = await selectUtxosForTransaction(mockAddress);

    expect(result.inputsSet).toBe('abc123:0,def456:2');
  });

  // Our own just-broadcast change, registered before mempool.space lists it. The scenario that
  // motivated this: an address whose only UTXO was just spent has nothing fetchable to compose
  // with, but the wallet is holding the change in its hand.
  describe('pending change', () => {
    it('selects registered change when the fetch returns nothing', async () => {
      mockedFetchUTXOs.mockResolvedValue([]);
      mockedFetchTokenBalances.mockResolvedValue([]);
      recordPendingChange([{ txid: 'change1', vout: 1, address: mockAddress, value: 4000 }]);

      const result = await selectUtxosForTransaction(mockAddress, { allowUnconfirmed: true });

      expect(result.utxos).toEqual([
        { txid: 'change1', vout: 1, value: 4000, status: expect.objectContaining({ confirmed: false }) },
      ]);
    });

    it('prefers the fetched copy once the indexer lists the same outpoint', async () => {
      mockedFetchUTXOs.mockResolvedValue([createMockUtxo('change1', 1, 4000, false)]);
      mockedFetchTokenBalances.mockResolvedValue([]);
      recordPendingChange([{ txid: 'change1', vout: 1, address: mockAddress, value: 4000 }]);

      const result = await selectUtxosForTransaction(mockAddress, { allowUnconfirmed: true });

      expect(result.utxos).toHaveLength(1);
      expect(result.utxos[0]!.status.block_height).toBe(0);
    });

    it('holds registered change to the allowUnconfirmed gate like any other UTXO', async () => {
      mockedFetchUTXOs.mockResolvedValue([]);
      mockedFetchTokenBalances.mockResolvedValue([]);
      recordPendingChange([{ txid: 'change1', vout: 1, address: mockAddress, value: 4000 }]);

      await expect(selectUtxosForTransaction(mockAddress)).rejects.toThrow(
        'Insufficient UTXOs: found 0, need at least 1'
      );
    });

    it('excludes registered change that a later broadcast already spent', async () => {
      mockedFetchUTXOs.mockResolvedValue([]);
      mockedFetchTokenBalances.mockResolvedValue([]);
      recordPendingChange([{ txid: 'change1', vout: 1, address: mockAddress, value: 4000 }]);
      recordSpentUtxos([{ txid: 'change1', vout: 1 }]);

      await expect(
        selectUtxosForTransaction(mockAddress, { allowUnconfirmed: true })
      ).rejects.toThrow('Insufficient UTXOs: found 0, need at least 1');
    });

    it('does not offer change registered for a different address', async () => {
      mockedFetchUTXOs.mockResolvedValue([]);
      mockedFetchTokenBalances.mockResolvedValue([]);
      recordPendingChange([{ txid: 'change1', vout: 1, address: 'bc1qelsewhere', value: 4000 }]);

      await expect(
        selectUtxosForTransaction(mockAddress, { allowUnconfirmed: true })
      ).rejects.toThrow('No UTXOs available for this address');
    });
  });

  it('should handle multiple assets attached to same UTXO', async () => {
    const mockUtxos = [
      createMockUtxo('tx1', 0, 50000),
      createMockUtxo('tx2', 0, 30000), // Has multiple attached assets
    ];

    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([
      { asset: 'ASSET1', quantity_normalized: asDisplayUnits('100'), utxo: 'tx2:0' },
      { asset: 'ASSET2', quantity_normalized: asDisplayUnits('50'), utxo: 'tx2:0' },
    ]);

    const result = await selectUtxosForTransaction(mockAddress);

    expect(result.utxos).toHaveLength(1);
    expect(result.excludedWithAssets).toBe(1); // Counted once, not twice
  });
});
