import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import { clearApiCache } from '@/core/counterparty/api';
import { resolveDispensersAt } from '@/core/counterparty/dispenseOutcome';
import { ReviewDispense } from '../review';

vi.mock('@/core/api/client');
vi.mock('@/core/settings', async importOriginal => ({
  ...(await importOriginal<typeof import('@/core/settings')>()),
  getActiveSettings: () => ({ counterpartyApiBase: 'https://api.counterparty.io:4000' }),
}));
vi.mock('@/hooks/useMarketPrices', () => ({ useMarketPrices: () => ({ btc: null, xcp: null }) }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: { fiat: 'USD' } }) }));
vi.mock('@/contexts/composer-context-object', () => ({ useComposerOptional: () => null }));

const rows = Array.from({ length: 237 }, (_, i) => ({
  tx_hash: i.toString(16).padStart(64, '0'), source: '1dispenser', asset: `PAGETEST${i}`,
  status: 0, satoshirate: 1000, give_quantity: 1, give_quantity_normalized: '1',
  give_remaining: 10, give_remaining_normalized: '10', oracle_address: null,
}));
const renderReview = () => render(<ReviewDispense
  apiResponse={{ result: { name: 'dispense', btc_fee: 200,
    params: { address: '1buyer', dispenser: '1dispenser', quantity: 1000 } } }}
  onSign={vi.fn()} onBack={vi.fn()} error={null} isSigning={false}
/>);

describe('complete dispense purchase review', () => {
  beforeEach(() => { clearApiCache(); vi.mocked(apiClient.get).mockReset(); });

  it('waits for every API page and displays all 237 payouts in the real review screen', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let releaseMempool!: () => void;
    const pendingMempool = new Promise<void>(resolve => { releaseMempool = resolve; });
    const offsets: number[] = [];
    vi.mocked(apiClient.get).mockImplementation(async (url, options) => {
      if (!url.endsWith('/dispensers')) {
        await pendingMempool;
        return { data: { result: [] } } as any;
      }
      expect(options?.params?.status).toBe('open,closing');
      const offset = Number(options?.params?.offset ?? 0);
      offsets.push(offset);
      if (offset === 100) await pending;
      return { data: { result: rows.slice(offset, offset + 100), result_count: rows.length } } as any;
    });
    renderReview();
    const sign = screen.getByRole('button', { name: 'Sign and broadcast transaction' });
    await waitFor(() => expect(offsets).toEqual([0, 100]));
    expect(sign).toBeDisabled();
    expect(screen.queryByText('You Receive:')).not.toBeInTheDocument();
    await act(async () => { release(); });
    await waitFor(() => expect(sign).toBeEnabled());
    expect(offsets).toEqual([0, 100, 200]);
    expect(screen.getByText('237')).toBeInTheDocument();
    const received = screen.getByText('You Receive:').parentElement!;
    for (const row of rows) expect(received).toHaveTextContent(`1 ${row.asset}`);
    // The provider approval uses this entry point; it must receive the same complete inventory.
    expect(await resolveDispensersAt('1dispenser', 1000)).toHaveLength(237);
    await act(async () => { releaseMempool(); });
  });

  it('keeps signing disabled and explains a failed second page', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { result: rows.slice(0, 100), result_count: 237 } } as any)
      .mockRejectedValueOnce(new Error('Second page unavailable'));
    renderReview();
    await screen.findByText('Unable to load all dispensers. Go back and try again before purchasing.');
    expect(screen.getByRole('button', { name: 'Sign and broadcast transaction' })).toBeDisabled();
    expect(screen.queryByText('You Receive:')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go back to edit transaction' })).toBeEnabled();
  });
});
