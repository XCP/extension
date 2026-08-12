import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as btc from '@/core/bitcoin/balance';
import * as api from '@/core/counterparty/api';
import { invalidateAddressBalances } from '../invalidate';

vi.mock('@/core/bitcoin/balance');
vi.mock('@/core/counterparty/api');

const ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

describe('invalidateAddressBalances', () => {
  beforeEach(() => vi.clearAllMocks());

  // The whole point. Clearing one cache and not the other produces a refresh that redraws and
  // shows the same stale number, which is worse than no refresh button.
  it('clears both the Counterparty and the BTC cache', () => {
    invalidateAddressBalances(ADDRESS);

    expect(api.clearApiCacheMatching).toHaveBeenCalledWith(ADDRESS);
    expect(btc.clearBalanceCache).toHaveBeenCalledWith(ADDRESS);
  });

  it('scopes both to the address rather than wiping everything', () => {
    invalidateAddressBalances(ADDRESS);

    expect(api.clearApiCacheMatching).toHaveBeenCalledTimes(1);
    expect(btc.clearBalanceCache).toHaveBeenCalledTimes(1);
    expect(vi.mocked(btc.clearBalanceCache).mock.calls[0]![0]).toBe(ADDRESS);
  });

  it('does nothing without an address, rather than clearing every address', () => {
    invalidateAddressBalances('');

    expect(api.clearApiCacheMatching).not.toHaveBeenCalled();
    // clearBalanceCache() with no argument wipes the cache for every address.
    expect(btc.clearBalanceCache).not.toHaveBeenCalled();
  });
});
