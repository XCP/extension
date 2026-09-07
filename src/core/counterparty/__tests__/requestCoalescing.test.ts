import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import {
  clearApiCache,
  clearApiCacheMatching,
  fetchMempoolLedgerEvents,
  fetchTokenBalances,
} from '../api';

/**
 * One question asked many times at once should be one request.
 *
 * The response cache can only collapse a repeat after the first answer is
 * back. It does nothing for the case that actually produces a 429 storm: a
 * screen mounting and asking the same thing several times in the same tick.
 * Every one of those misses the empty cache and every one goes to the node.
 *
 * That is the shape of the refusals that started this work — roughly seventy
 * 429s for a single `/v2/addresses/mempool` URL, one address, one event
 * filter. Not many questions, one question many times.
 */

vi.mock('@/core/api/client');
vi.mock('@/core/counterparty/capabilities', () => ({
  requireCounterpartyFeature: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/core/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/settings')>()),
  getActiveSettings: vi.fn().mockReturnValue({
    counterpartyApiBase: 'https://api.counterparty.io',
  }),
}));

const mockedApiClient = vi.mocked(apiClient, true);

/** A response that does not resolve until the test says so. */
function deferred<T>() {
  let settle!: (value: T) => void;
  let fail!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

/** Let every settled promise run its continuations. cpApiGet awaits the API
 *  base before it reaches the client, so one tick is not enough. */
const flush = async () => {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
};

const page = (result: unknown[]) => ({
  data: { result, result_count: result.length },
  status: 200,
});

beforeEach(() => {
  vi.clearAllMocks();
  clearApiCache();
});

describe('collapsing identical reads that are in flight together', () => {
  it('asks the node once when a screen asks the same question ten times', async () => {
    const gate = deferred<ReturnType<typeof page>>();
    mockedApiClient.get.mockReturnValue(gate.promise as never);

    const callers = Array.from({ length: 10 }, () =>
      fetchMempoolLedgerEvents(['1AddressAAAAAAAAAAAAAAAAAAAAAAAAAA']),
    );
    // Let every caller reach the client before anything resolves.
    await flush();

    expect(mockedApiClient.get).toHaveBeenCalledTimes(1);

    gate.settle(page([{ tx_hash: 'a', event: 'CREDIT' }]));
    const results = await Promise.all(callers);

    // Every caller gets the answer, not just the one that happened to be first.
    expect(results).toHaveLength(10);
    for (const r of results) expect(r.result).toHaveLength(1);
  });

  it('keeps different questions apart', async () => {
    mockedApiClient.get.mockResolvedValue(page([]) as never);

    await Promise.all([
      fetchMempoolLedgerEvents(['1AddressAAAAAAAAAAAAAAAAAAAAAAAAAA']),
      fetchMempoolLedgerEvents(['1AddressBBBBBBBBBBBBBBBBBBBBBBBBBB']),
    ]);

    expect(mockedApiClient.get).toHaveBeenCalledTimes(2);
  });

  it('shares work rather than storing it: a failure is not remembered', async () => {
    const first = deferred<ReturnType<typeof page>>();
    mockedApiClient.get.mockReturnValueOnce(first.promise as never);
    mockedApiClient.get.mockResolvedValue(page([]) as never);

    const failing = fetchMempoolLedgerEvents(['1AddressAAAAAAAAAAAAAAAAAAAAAAAAAA']);
    // Registered before the rejection so it is never an unhandled one.
    const rejects = expect(failing).rejects.toThrow();
    await flush();
    first.fail(new Error('socket closed'));
    await rejects;

    // The next caller asks again rather than inheriting the failure.
    await fetchMempoolLedgerEvents(['1AddressAAAAAAAAAAAAAAAAAAAAAAAAAA']);
    expect(mockedApiClient.get).toHaveBeenCalledTimes(2);
  });

  it('collapses a skipCache read into the request already on its way', async () => {
    // Skipping the cache means "not a stored answer from a minute ago", not
    // "open a second socket beside the identical request already in the air".
    const gate = deferred<ReturnType<typeof page>>();
    mockedApiClient.get.mockReturnValue(gate.promise as never);

    const callers = [
      fetchTokenBalances('1AddressAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      fetchTokenBalances('1AddressAAAAAAAAAAAAAAAAAAAAAAAAAA'),
    ];
    await flush();

    expect(mockedApiClient.get).toHaveBeenCalledTimes(1);
    gate.settle(page([]));
    await Promise.all(callers);
  });
});

describe('invalidation reaches requests that are still in the air', () => {
  it.each(['all', 'matching'] as const)('keeps the post-mutation cached balance when an invalidated response finishes last (%s)', async scope => {
    const address = '1AddressAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const before = deferred<ReturnType<typeof page>>();
    const current = [{ asset: 'XCP', quantity: 2, quantity_normalized: '0.00000002' }];
    mockedApiClient.get.mockReturnValueOnce(before.promise as never);
    mockedApiClient.get.mockResolvedValue(page(current) as never);

    const oldRead = fetchTokenBalances(address);
    await flush();
    if (scope === 'all') clearApiCache();
    else clearApiCacheMatching(address);

    await expect(fetchTokenBalances(address)).resolves.toEqual(current);
    before.settle(page([{ asset: 'XCP', quantity: 1, quantity_normalized: '0.00000001' }]));
    await expect(oldRead).resolves.toMatchObject([{ quantity: 1 }]);

    await expect(fetchTokenBalances(address)).resolves.toEqual(current);
    expect(mockedApiClient.get).toHaveBeenCalledTimes(2);
  });

  it('does not hand a post-mutation caller an answer that predates the mutation', async () => {
    const before = deferred<ReturnType<typeof page>>();
    mockedApiClient.get.mockReturnValueOnce(before.promise as never);
    mockedApiClient.get.mockResolvedValue(page([{ tx_hash: 'after', event: 'CREDIT' }]) as never);

    const inFlight = fetchMempoolLedgerEvents(['1AddressAAAAAAAAAAAAAAAAAAAAAAAAAA']);
    await flush();
    expect(mockedApiClient.get).toHaveBeenCalledTimes(1);

    // A send broadcasts here. The read already on its way was sent before it,
    // so its answer cannot contain it.
    clearApiCache();

    const afterMutation = fetchMempoolLedgerEvents(['1AddressAAAAAAAAAAAAAAAAAAAAAAAAAA']);
    await flush();
    expect(mockedApiClient.get).toHaveBeenCalledTimes(2);

    before.settle(page([]));
    // The original caller still gets its own answer; nothing was cancelled.
    await expect(inFlight).resolves.toBeDefined();
    await expect(afterMutation).resolves.toBeDefined();
  });

  it('narrows to the address being invalidated', async () => {
    mockedApiClient.get.mockResolvedValue(page([]) as never);
    const A = '1AddressAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const B = '1AddressBBBBBBBBBBBBBBBBBBBBBBBBBB';

    await fetchMempoolLedgerEvents([A]);
    await fetchMempoolLedgerEvents([B]);
    expect(mockedApiClient.get).toHaveBeenCalledTimes(2);

    // Both answers are stored, so neither is asked again.
    await fetchMempoolLedgerEvents([A]);
    await fetchMempoolLedgerEvents([B]);
    expect(mockedApiClient.get).toHaveBeenCalledTimes(2);

    clearApiCacheMatching(A);

    // Only A was invalidated, so only A goes back to the node.
    await fetchMempoolLedgerEvents([A]);
    await fetchMempoolLedgerEvents([B]);
    expect(mockedApiClient.get).toHaveBeenCalledTimes(3);
  });
});
