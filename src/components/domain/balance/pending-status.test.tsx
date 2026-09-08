import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMempoolLedgerEvents } from '@/core/counterparty/api';
import { usePendingStatus } from '@/hooks/usePendingStatus';
import { configureLocale } from '@/i18n';
import { PendingStatus } from './pending-status';

vi.mock('@/core/counterparty/api', () => ({
  fetchMempoolLedgerEvents: vi.fn(),
  fetchMempoolStatusEvents: vi.fn(),
}));

const ADDRESS = 'bc1qowner';
const UTXO = `${'a'.repeat(64)}:0`;
const ledgerEvents = [
  { tx_hash: 'send', event: 'DEBIT', params: { address: ADDRESS, asset: 'XCP', quantity: '100000001', quantity_normalized: '1.00000001', action: 'send' } },
  { tx_hash: 'send-fee', event: 'DEBIT', params: { address: ADDRESS, asset: 'XCP', quantity: '1', quantity_normalized: '0.00000001', action: 'mpma send' } },
  { tx_hash: 'mixed-send', event: 'DEBIT', params: { address: ADDRESS, asset: 'MIXED', quantity: '1', action: 'send' } },
  { tx_hash: 'mixed-dividend', event: 'DEBIT', params: { address: ADDRESS, asset: 'MIXED', quantity: '1', action: 'dividend' } },
  { tx_hash: 'future', event: 'DEBIT', params: { address: ADDRESS, asset: 'UNKNOWN', quantity: '1', action: 'future action' } },
  { tx_hash: 'utxo', event: 'CREDIT', params: { utxo: UTXO, utxo_address: ADDRESS, asset: 'BONPARTY', quantity: '1', quantity_normalized: '1', calling_function: 'utxo move' } },
];

type StatusMaps = ReturnType<typeof usePendingStatus>;

function Rows({ refreshNonce = 0, onMaps }: { refreshNonce?: number; onMaps: (maps: StatusMaps) => void }) {
  const maps = usePendingStatus(ADDRESS, refreshNonce);
  onMaps(maps);
  return <>
    {[...maps.byAsset, ...maps.byUtxo].map(([key, label]) => (
      <div data-testid={key} key={key}><PendingStatus label={label} /></div>
    ))}
  </>;
}

describe('PendingStatus presentation', () => {
  beforeEach(() => {
    configureLocale({ language: 'en', numberLocale: 'en-US' });
    vi.clearAllMocks();
    vi.mocked(fetchMempoolLedgerEvents).mockResolvedValue({ result: ledgerEvents, result_count: ledgerEvents.length });
  });

  afterEach(() => {
    cleanup();
    configureLocale({ language: 'en', numberLocale: 'en-US' });
  });

  it('changes mounted balance and UTXO labels without fetching again or replacing memoized facts', async () => {
    const onMaps = vi.fn();
    const { rerender } = render(<Rows onMaps={onMaps} />);
    await waitFor(() => { expect(screen.getByTestId('XCP')).toHaveTextContent('Sending'); });
    const stableMaps = onMaps.mock.lastCall?.[0] as StatusMaps;
    expect([...stableMaps.byAsset]).toEqual([['XCP', 'Sending'], ['MIXED', 'Pending'], ['UNKNOWN', 'Pending']]);
    expect(stableMaps.byUtxo.get(UTXO)).toBe('Moving');
    const rawEvents = structuredClone(ledgerEvents);

    for (const [language, sending, moving, pending] of [
      ['ja', '送信中', '移動中', '承認待ち'],
      ['zh-CN', '发送中', '转移中', '待确认'],
      ['zh-TW', '傳送中', '移轉中', '待確認'],
      ['zh-HK', '發送中', '轉移中', '待確認'],
      ['en', 'Sending', 'Moving', 'Pending'],
    ] as const) {
      act(() => { configureLocale({ language, numberLocale: 'de-DE' }); });
      expect(screen.getByTestId('XCP')).toHaveTextContent(sending);
      expect(screen.getByTestId(UTXO)).toHaveTextContent(moving);
      expect(screen.getByTestId('MIXED')).toHaveTextContent(pending);
      expect(screen.getByTestId('UNKNOWN')).toHaveTextContent(pending);
      expect(onMaps.mock.lastCall?.[0]).toBe(stableMaps);
      expect(fetchMempoolLedgerEvents).toHaveBeenCalledExactlyOnceWith([ADDRESS]);
      expect(ledgerEvents).toEqual(rawEvents);
    }

    // Explicit refresh still performs the existing single read; locale changes do not consume it.
    rerender(<Rows refreshNonce={1} onMaps={onMaps} />);
    await waitFor(() => { expect(fetchMempoolLedgerEvents).toHaveBeenCalledTimes(2); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['正在關閉（節點狀態）', 'Future operation', 'toString', '__proto__'])(
    'retains caller-provided display text %s',
    (label) => {
      const { container } = render(<PendingStatus label={label} />);
      act(() => { configureLocale({ language: 'ja' }); });
      expect(container.textContent).toBe(label);
      expect(fetchMempoolLedgerEvents).not.toHaveBeenCalled();
    },
  );

  it('keeps optional annotation failures silent and does not retry on language changes', async () => {
    vi.mocked(fetchMempoolLedgerEvents).mockRejectedValueOnce(new Error('node has no mempool ledger'));
    const onMaps = vi.fn();
    const { container } = render(<Rows onMaps={onMaps} />);
    await waitFor(() => { expect(fetchMempoolLedgerEvents).toHaveBeenCalledTimes(1); });
    await act(async () => { await Promise.resolve(); });
    act(() => { configureLocale({ language: 'zh-TW' }); });
    expect(container.textContent).toBe('');
    expect(fetchMempoolLedgerEvents).toHaveBeenCalledTimes(1);
  });
});
