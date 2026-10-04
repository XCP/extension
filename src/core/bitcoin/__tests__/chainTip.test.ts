import { beforeEach, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import { fetchChainFinalityContext } from '../chainTip';

vi.mock('@/core/api/client', () => ({ apiClient: { get: vi.fn() } }));
const hash = 'a'.repeat(64);
const block = { id: hash, height: 900_000, mediantime: 1_800_000_000, timestamp: 1_800_000_500 };
const get = vi.mocked(apiClient.get);
beforeEach(() => { get.mockReset(); });

it('reads height and median time from the exact tip block, not its timestamp', async () => {
  get.mockResolvedValueOnce({ data: hash } as never).mockResolvedValueOnce({ data: block } as never);
  expect(await fetchChainFinalityContext()).toEqual({ height: 900_000, medianTimePast: 1_800_000_000 });
  expect(get.mock.calls.map(call => call[0])).toEqual([
    'https://mempool.space/api/blocks/tip/hash', `https://mempool.space/api/block/${hash}`,
  ]);
});

it.each([
  { ...block, id: 'b'.repeat(64) }, { ...block, height: -1 },
  { ...block, height: 1.5 }, { ...block, mediantime: undefined },
])('falls back when a source returns invalid or mismatched chain data', async bad => {
  get.mockResolvedValueOnce({ data: hash } as never).mockResolvedValueOnce({ data: bad } as never)
    .mockResolvedValueOnce({ data: hash } as never).mockResolvedValueOnce({ data: block } as never);
  expect(await fetchChainFinalityContext()).toEqual({ height: block.height, medianTimePast: block.mediantime });
  expect(get.mock.calls[2]?.[0]).toBe('https://blockstream.info/api/blocks/tip/hash');
});

it('fails closed when both sources fail instead of substituting wall-clock time', async () => {
  get.mockRejectedValue(new Error('offline'));
  await expect(fetchChainFinalityContext()).rejects.toThrow('chain tip could not be checked');
  expect(get).toHaveBeenCalledTimes(2);
});
