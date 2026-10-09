import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearUtxoCache, fetchUTXOs } from '@/core/bitcoin/utxo';
import { clearZeldCaches, fetchZeldBalance, fetchZeldRewards, type ZeldAddressBalance } from '@/core/zeld/api';
import { useZeldBalance } from './useZeldBalance';

vi.mock('@/core/bitcoin/utxo', () => ({ fetchUTXOs: vi.fn(), clearUtxoCache: vi.fn() }));
vi.mock('@/core/zeld/api', () => ({ fetchZeldBalance: vi.fn(), fetchZeldRewards: vi.fn(), clearZeldCaches: vi.fn() }));

describe('useZeldBalance', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchUTXOs).mockResolvedValue([]);
    vi.mocked(fetchZeldRewards).mockResolvedValue([]);
  });

  it('shows a loaded balance while rewards and BTC values are still pending', async () => {
    vi.mocked(fetchZeldBalance).mockResolvedValue({ baseUnits: 409600000000n, utxos: [] });
    vi.mocked(fetchZeldRewards).mockReturnValue(new Promise(() => {}));
    vi.mocked(fetchUTXOs).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useZeldBalance('address'));
    await waitFor(() => expect(result.current.balance?.baseUnits).toBe(409600000000n));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.reservedSats).toBeNull();
  });

  it('makes retry discard both address caches', async () => {
    vi.mocked(fetchZeldBalance).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ baseUnits: 10n, utxos: [] });
    const { result } = renderHook(() => useZeldBalance('address'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.balance?.baseUnits).toBe(10n));
    expect(clearZeldCaches).toHaveBeenCalledWith('address');
    expect(clearUtxoCache).toHaveBeenCalledWith('address');
    expect(result.current.error).toBeNull();
  });

  it('ignores an older address response that finishes after the active address', async () => {
    let resolveOld!: (value: ZeldAddressBalance) => void;
    vi.mocked(fetchZeldBalance).mockImplementation(async address => address === 'old'
      ? new Promise(resolve => { resolveOld = resolve; }) : { baseUnits: 20n, utxos: [] });
    const { result, rerender } = renderHook(({ address }) => useZeldBalance(address), { initialProps: { address: 'old' } });
    await waitFor(() => expect(resolveOld).toBeDefined());
    rerender({ address: 'new' });
    await waitFor(() => expect(result.current.balance?.baseUnits).toBe(20n));
    await act(async () => resolveOld({ baseUnits: 10n, utxos: [] }));
    expect(result.current.balance?.baseUnits).toBe(20n);
  });
});
