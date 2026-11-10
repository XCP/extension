import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUtxoSpendStatus } from '@/core/bitcoin/outspend';
import { clearSpentUtxoCache, recordSpentUtxos } from '@/core/bitcoin/spentUtxoCache';
import { useUtxoSpendStatus } from '../useUtxoSpendStatus';

vi.mock('@/core/bitcoin/outspend', () => ({ fetchUtxoSpendStatus: vi.fn() }));
const TXID = 'ab'.repeat(32);
const point = `${TXID}:0`;
afterEach(() => { clearSpentUtxoCache(); vi.resetAllMocks(); });

describe('UTXO spend display', () => {
  it('deduplicates reads and clears a pending marker when refresh shows the spend dropped', async () => {
    vi.mocked(fetchUtxoSpendStatus).mockResolvedValue('pending');
    const { result, rerender } = renderHook(({ nonce }) => useUtxoSpendStatus([point, point], nonce), { initialProps: { nonce: 0 } });
    await waitFor(() => expect(result.current.get(point)).toBe('pending'));
    expect(fetchUtxoSpendStatus).toHaveBeenCalledTimes(1);
    vi.mocked(fetchUtxoSpendStatus).mockResolvedValue('unspent');
    rerender({ nonce: 1 });
    await waitFor(() => expect(result.current.has(point)).toBe(false));
    expect(fetchUtxoSpendStatus).toHaveBeenCalledTimes(2);
  });
  it('marks a locally broadcast spend even when the indexer cannot answer', async () => {
    recordSpentUtxos([{ txid: TXID, vout: 0 }]);
    vi.mocked(fetchUtxoSpendStatus).mockResolvedValue('unknown');
    const { result } = renderHook(() => useUtxoSpendStatus([point]));
    await waitFor(() => expect(result.current.get(point)).toBe('pending'));
  });
  it('does not label an unavailable read as spent or leak a previous output into another list', async () => {
    vi.mocked(fetchUtxoSpendStatus).mockResolvedValue('spent');
    const { result, rerender } = renderHook(({ points }) => useUtxoSpendStatus(points), { initialProps: { points: [point] } });
    await waitFor(() => expect(result.current.get(point)).toBe('spent'));
    vi.mocked(fetchUtxoSpendStatus).mockResolvedValue('unknown');
    await act(async () => rerender({ points: [`${TXID}:1`] }));
    expect(result.current.size).toBe(0);
  });
});
