/** Chain context for BIP113 finality. Only requested for an enforced absolute locktime. */
import { apiClient } from '@/core/api/client';
import type { ChainFinalityContext } from '@/core/bitcoin/relayPolicy';

const SOURCES = ['https://mempool.space/api', 'https://blockstream.info/api'];
const REQUEST = { retries: 0, timeout: 5_000, cache: 'no-store', reportStatus: false } as const;

export async function fetchChainFinalityContext(): Promise<ChainFinalityContext> {
  for (const base of SOURCES) {
    try {
      const { data: hash } = await apiClient.get<string>(`${base}/blocks/tip/hash`, REQUEST);
      if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) continue;
      const { data: block } = await apiClient.get<{ id: string; height: number; mediantime: number }>(
        `${base}/block/${hash}`, REQUEST,
      );
      if (block?.id !== hash || !Number.isSafeInteger(block.height) || block.height < 0
        || !Number.isSafeInteger(block.mediantime) || block.mediantime <= 0) continue;
      return { height: block.height, medianTimePast: block.mediantime };
    } catch {
      // An unavailable or malformed source is not evidence that a timelock has expired.
    }
  }
  throw new Error('The Bitcoin chain tip could not be checked. Try again.');
}
