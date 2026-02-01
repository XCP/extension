import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectUtxosForTransaction } from '../utxo-selection';
import * as bitcoinUtxo from '@/utils/blockchain/bitcoin/utxo';
import * as counterpartyApi from '../api';

// Mock dependencies
vi.mock('@/utils/blockchain/bitcoin/utxo');
vi.mock('../api');

const mockedFetchUTXOs = vi.mocked(bitcoinUtxo.fetchUTXOs);
const mockedFetchTokenBalances = vi.mocked(counterpartyApi.fetchTokenBalances);
const mockedFormatInputsSet = vi.mocked(bitcoinUtxo.formatInputsSet);

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
      { asset: 'MYASSET', quantity_normalized: '100', utxo: 'tx2:0' },
    ]);

    const result = await selectUtxosForTransaction(mockAddress);

    expect(result.utxos).toHaveLength(2);
    expect(result.utxos.map(u => u.txid)).toEqual(['tx1', 'tx3']);
    expect(result.totalValue).toBe(70000);
    expect(result.excludedWithAssets).toBe(1);
    expect(result.excludedValue).toBe(30000); // tx2:0 was excluded
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

    expect(result.utxos[0].value).toBe(50000);
    expect(result.utxos[1].value).toBe(30000);
    expect(result.utxos[2].value).toBe(10000);
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
      { asset: 'MYASSET', quantity_normalized: '100', utxo: 'tx1:0' },
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

  it('should handle multiple assets attached to same UTXO', async () => {
    const mockUtxos = [
      createMockUtxo('tx1', 0, 50000),
      createMockUtxo('tx2', 0, 30000), // Has multiple attached assets
    ];

    mockedFetchUTXOs.mockResolvedValue(mockUtxos);
    mockedFetchTokenBalances.mockResolvedValue([
      { asset: 'ASSET1', quantity_normalized: '100', utxo: 'tx2:0' },
      { asset: 'ASSET2', quantity_normalized: '50', utxo: 'tx2:0' },
    ]);

    const result = await selectUtxosForTransaction(mockAddress);

    expect(result.utxos).toHaveLength(1);
    expect(result.excludedWithAssets).toBe(1); // Counted once, not twice
  });
});
