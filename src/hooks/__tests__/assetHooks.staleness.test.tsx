import { act, render, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderProvider, useHeader } from '@/contexts/header-context';
import type { AssetInfo } from '@/core/counterparty/api';
import { asBaseUnits, asDisplayUnits } from '@/core/numeric';
import { useAssetBalance } from '../useAssetBalance';
import { useAssetDetails } from '../useAssetDetails';
import { useAssetInfo } from '../useAssetInfo';
import { fetchAssetDetailsAndBalance } from '../utils/fetchAssetData';

/**
 * The asset hooks must only ever answer for the address and asset they are asked about now.
 *
 * The header cache is real here (HeaderProvider): the defect was a balance cached for one address
 * being trusted, unrevalidated, for another.
 */

vi.mock('../utils/fetchAssetData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/fetchAssetData')>()),
  fetchAssetDetailsAndBalance: vi.fn(),
}));
vi.mock('@/core/bitcoin/balance', () => ({ fetchBTCBalance: vi.fn() }));
vi.mock('@/hooks/usePendingStatus', () => ({
  usePendingDeltas: () => ({ byAsset: new Map(), byUtxo: new Map() }),
}));

const wallet = vi.hoisted(() => ({
  current: { activeAddress: { address: 'bc1qaaaa' }, activeWallet: { id: 'wallet-1' } } as {
    activeAddress: { address: string } | null;
    activeWallet: { id: string } | null;
  },
}));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => wallet.current }));

const ADDRESS_A = 'bc1qaaaa';
const ADDRESS_B = 'bc1qbbbb';

const info = (asset: string, extra: Partial<AssetInfo> = {}): AssetInfo => ({
  asset,
  asset_longname: null,
  description: '',
  divisible: true,
  locked: false,
  supply: asBaseUnits('100000000'),
  supply_normalized: asDisplayUnits('1'),
  issuer: '',
  ...extra,
});

/** Answer by address: A holds 100 XCP, B holds 5. */
let balances: Record<string, string> = {};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('useAssetBalance and the shared balance cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.current = { activeAddress: { address: ADDRESS_A }, activeWallet: { id: 'wallet-1' } };
    balances = { [ADDRESS_A]: '100.00000000', [ADDRESS_B]: '5.00000000' };
    vi.mocked(fetchAssetDetailsAndBalance).mockImplementation(async (asset, address) => ({
      isDivisible: true,
      assetInfo: info(asset),
      availableBalance: balances[address]!,
    }));
  });

  /** Mount, unmount and remount a form reading one asset, under one provider whose cache persists. */
  function harness() {
    const seen: Array<string | null> = [];
    function Probe() {
      const { balance } = useAssetBalance('XCP');
      seen.push(balance);
      return null;
    }
    const tree = (mounted: boolean, key: string) => (
      <HeaderProvider>{mounted ? <Probe key={key} /> : null}</HeaderProvider>
    );
    const view = render(tree(true, 'first'));
    return {
      seen,
      unmount: () => view.rerender(tree(false, 'none')),
      remount: () => { seen.length = 0; view.rerender(tree(true, 'second')); },
    };
  }

  it("never shows the previous address's cached balance after an address switch", async () => {
    const form = harness();
    await waitFor(() => expect(form.seen.at(-1)).toBe('100.00000000'));
    form.unmount();

    wallet.current = { activeAddress: { address: ADDRESS_B }, activeWallet: { id: 'wallet-1' } };
    form.remount();

    await waitFor(() => expect(form.seen.at(-1)).toBe('5.00000000'));
    expect(form.seen).not.toContain('100.00000000');
    expect(fetchAssetDetailsAndBalance).toHaveBeenLastCalledWith('XCP', ADDRESS_B);
  });

  it('shows the same address its cached balance at once, then revalidates it', async () => {
    const form = harness();
    await waitFor(() => expect(form.seen.at(-1)).toBe('100.00000000'));
    form.unmount();

    balances[ADDRESS_A] = '120.00000000';
    const calls = vi.mocked(fetchAssetDetailsAndBalance).mock.calls.length;
    form.remount();

    // First paint is the cached figure, not a spinner.
    expect(form.seen[0]).toBe('100.00000000');
    await waitFor(() => expect(form.seen.at(-1)).toBe('120.00000000'));
    expect(vi.mocked(fetchAssetDetailsAndBalance).mock.calls.length).toBe(calls + 1);
  });

  it('does not show the old address balance on the render right after a switch', async () => {
    const { result, rerender } = renderHook(() => useAssetBalance('XCP'), {
      wrapper: ({ children }: { children: ReactNode }) => <HeaderProvider>{children}</HeaderProvider>,
    });
    await waitFor(() => expect(result.current.balance).toBe('100.00000000'));

    const pending = deferred<{ isDivisible: boolean; assetInfo: AssetInfo; availableBalance: string }>();
    vi.mocked(fetchAssetDetailsAndBalance).mockReturnValueOnce(pending.promise);
    wallet.current = { activeAddress: { address: ADDRESS_B }, activeWallet: { id: 'wallet-1' } };
    rerender();

    expect(result.current.balance).toBeNull();
    expect(result.current.isLoading).toBe(true);
    await act(async () => { pending.resolve({ isDivisible: true, assetInfo: info('XCP'), availableBalance: '5.00000000' }); });
    expect(result.current.balance).toBe('5.00000000');
  });

  it('ignores a late answer for the address it has already left', async () => {
    const lateA = deferred<{ isDivisible: boolean; assetInfo: AssetInfo; availableBalance: string }>();
    vi.mocked(fetchAssetDetailsAndBalance).mockReturnValueOnce(lateA.promise);
    const { result, rerender } = renderHook(() => useAssetBalance('XCP'), {
      wrapper: ({ children }: { children: ReactNode }) => <HeaderProvider>{children}</HeaderProvider>,
    });

    wallet.current = { activeAddress: { address: ADDRESS_B }, activeWallet: { id: 'wallet-1' } };
    rerender();
    await waitFor(() => expect(result.current.balance).toBe('5.00000000'));

    await act(async () => { lateA.resolve({ isDivisible: true, assetInfo: info('XCP'), availableBalance: '100.00000000' }); });
    expect(result.current.balance).toBe('5.00000000');
  });

  it('settles under StrictMode, where effects run twice on mount', async () => {
    const { result } = renderHook(() => useAssetBalance('XCP'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StrictMode><HeaderProvider>{children}</HeaderProvider></StrictMode>
      ),
    });

    await waitFor(() => expect(result.current.balance).toBe('100.00000000'));
    expect(result.current.isLoading).toBe(false);
  });

  it('reads again after the app clears the balance cache (a broadcast)', async () => {
    const { result } = renderHook(() => ({ balance: useAssetBalance('XCP'), header: useHeader() }), {
      wrapper: ({ children }: { children: ReactNode }) => <HeaderProvider>{children}</HeaderProvider>,
    });
    await waitFor(() => expect(result.current.balance.balance).toBe('100.00000000'));
    const calls = vi.mocked(fetchAssetDetailsAndBalance).mock.calls.length;

    balances[ADDRESS_A] = '40.00000000';
    act(() => { result.current.header.clearBalances(); });

    await waitFor(() => expect(result.current.balance.balance).toBe('40.00000000'));
    expect(vi.mocked(fetchAssetDetailsAndBalance).mock.calls.length).toBe(calls + 1);
  });

  it('refetches for a wallet switch that lands on the same address string', async () => {
    const { result, rerender } = renderHook(() => useAssetBalance('XCP'), {
      wrapper: ({ children }: { children: ReactNode }) => <HeaderProvider>{children}</HeaderProvider>,
    });
    await waitFor(() => expect(result.current.balance).toBe('100.00000000'));
    const calls = vi.mocked(fetchAssetDetailsAndBalance).mock.calls.length;

    wallet.current = { activeAddress: { address: ADDRESS_A }, activeWallet: { id: 'wallet-2' } };
    rerender();

    // Same address, so the cached figure is still that address's and stays on screen meanwhile.
    expect(result.current.balance).toBe('100.00000000');
    await waitFor(() => expect(vi.mocked(fetchAssetDetailsAndBalance).mock.calls.length).toBe(calls + 1));
  });
});

describe('useAssetDetails while a new asset loads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.current = { activeAddress: { address: ADDRESS_A }, activeWallet: { id: 'wallet-1' } };
  });

  it("does not answer for the new asset with the previous asset's balance or info", async () => {
    vi.mocked(fetchAssetDetailsAndBalance).mockImplementation(async (asset) => ({
      isDivisible: asset === 'DIVISIBLE',
      assetInfo: info(asset, { divisible: asset === 'DIVISIBLE' }),
      availableBalance: asset === 'DIVISIBLE' ? '12.50000000' : '3',
    }));
    const { result, rerender } = renderHook(({ asset }) => useAssetDetails(asset), {
      initialProps: { asset: 'DIVISIBLE' },
      wrapper: ({ children }: { children: ReactNode }) => <HeaderProvider>{children}</HeaderProvider>,
    });
    await waitFor(() => expect(result.current.data?.availableBalance).toBe('12.50000000'));

    const pending = deferred<{ isDivisible: boolean; assetInfo: AssetInfo; availableBalance: string }>();
    vi.mocked(fetchAssetDetailsAndBalance).mockImplementation(() => pending.promise);
    rerender({ asset: 'WHOLE' });

    // Nothing about DIVISIBLE may be reported as WHOLE's.
    expect(result.current.data?.availableBalance).not.toBe('12.50000000');
    expect(result.current.data?.assetInfo?.asset).not.toBe('DIVISIBLE');
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.data?.availableBalance).not.toBe('12.50000000');
    expect(result.current.data?.assetInfo?.asset).not.toBe('DIVISIBLE');

    await act(async () => {
      pending.resolve({ isDivisible: false, assetInfo: info('WHOLE', { divisible: false }), availableBalance: '3' });
    });
    await waitFor(() => expect(result.current.data?.availableBalance).toBe('3'));
    expect(result.current.data?.assetInfo?.asset).toBe('WHOLE');
    expect(result.current.data?.isDivisible).toBe(false);
  });
});

describe('useAssetInfo for a subasset requested by its long name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.current = { activeAddress: { address: ADDRESS_A }, activeWallet: { id: 'wallet-1' } };
  });

  it('fetches once, although the node answers with the numeric name', async () => {
    // fetchAssetDetails spreads the node's result over the requested name, so a long-name request
    // comes back as the numeric asset.
    vi.mocked(fetchAssetDetailsAndBalance).mockImplementation(async () => ({
      isDivisible: true,
      assetInfo: info('A95428956661682177', { asset_longname: 'PARENT.child' }),
      availableBalance: '1',
    }));

    const { result } = renderHook(() => useAssetInfo('PARENT.child'));

    await waitFor(() => expect(result.current.data?.asset_longname).toBe('PARENT.child'));
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(fetchAssetDetailsAndBalance).toHaveBeenCalledTimes(1);
  });
});
