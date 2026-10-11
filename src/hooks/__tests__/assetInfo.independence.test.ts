import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { type AssetInfo, fetchAssetDetails, fetchTokenBalance } from '@/core/counterparty/api';
import { asBaseUnits, asDisplayUnits } from '@/core/numeric';
import { useAssetInfo } from '../useAssetInfo';

const wallet = vi.hoisted(() => ({ activeAddress: null as { address: string } | null }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => wallet }));
vi.mock('@/core/counterparty/api', () => ({ fetchAssetDetails: vi.fn(), fetchTokenBalance: vi.fn() }));
vi.mock('@/core/bitcoin/balance', () => ({ fetchBTCBalance: vi.fn() }));

const info: AssetInfo = { asset: 'XCP', asset_longname: null, description: 'Counterparty',
  issuer: '', divisible: true, locked: false, supply: asBaseUnits('100'), supply_normalized: asDisplayUnits('0.000001') };

beforeEach(() => {
  vi.resetAllMocks();
  wallet.activeAddress = null;
  vi.mocked(fetchAssetDetails).mockResolvedValue(info);
});

it.each(['BTC', 'XCP'])('loads %s metadata without an active wallet address', async asset => {
  const { result } = renderHook(() => useAssetInfo(asset));
  await waitFor(() => expect(result.current.data?.asset).toBe(asset));
  expect(result.current.error).toBeNull();
  expect(fetchTokenBalance).not.toHaveBeenCalled();
});

it.each(['unavailable', 'pending'])('does not depend on an %s address balance', async state => {
  wallet.activeAddress = { address: 'A' };
  vi.mocked(fetchTokenBalance).mockImplementation(() => state === 'pending'
    ? new Promise(() => {}) : Promise.reject(new Error('Balance API offline')));
  const { result } = renderHook(() => useAssetInfo('XCP'));
  await waitFor(() => expect(result.current.data).toEqual(info));
  expect(result.current.isLoading).toBe(false);
  expect(result.current.error).toBeNull();
  expect(fetchTokenBalance).not.toHaveBeenCalled();
});

it('keeps one in-flight metadata read through address switches', async () => {
  let resolve!: (value: AssetInfo) => void;
  vi.mocked(fetchAssetDetails).mockReturnValue(new Promise(done => { resolve = done; }));
  vi.mocked(fetchTokenBalance).mockResolvedValue({ asset: 'XCP', quantity_normalized: asDisplayUnits('1') });
  wallet.activeAddress = { address: 'A' };
  const { result, rerender } = renderHook(() => useAssetInfo('XCP'));
  wallet.activeAddress = { address: 'B' };
  rerender();
  expect(fetchAssetDetails).toHaveBeenCalledTimes(1);
  await act(async () => resolve(info));
  expect(result.current.data).toEqual(info);
});
