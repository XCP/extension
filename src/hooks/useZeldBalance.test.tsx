import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fetchZeldBalance, type ZeldAddressBalance } from '@/core/zeld/api';
import { useZeldBalance } from './useZeldBalance';

vi.mock('@/core/bitcoin/utxo', () => ({ fetchUTXOs: vi.fn(async () => []) }));
vi.mock('@/core/zeld/api', () => ({ fetchZeldBalance: vi.fn(), fetchZeldRewards: vi.fn(async () => []) }));

describe('useZeldBalance', () => {
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
