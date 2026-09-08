import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/core/counterparty/api';
import { asBaseUnits, asDisplayUnits } from '@/core/numeric';
import AssetDispensersPage from '../[asset]';

const mocks = vi.hoisted(() => ({
  asset: 'XCP', inView: false, setHeaderProps: vi.fn(), navigate: vi.fn(),
  settings: { fiat: 'usd', priceUnit: 'sats' }, updateSettings: vi.fn(),
  copy: vi.fn(), isCopied: () => false, ref: vi.fn(),
}));
vi.mock('@/core/counterparty/api');
vi.mock('react-router', () => ({ useNavigate: () => mocks.navigate, useParams: () => ({ asset: mocks.asset }) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: mocks.setHeaderProps }) }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => mocks }));
vi.mock('@/hooks/useMarketPrices', () => ({ useMarketPrices: () => ({ btc: null }) }));
vi.mock('@/hooks/useInView', () => ({ useInView: () => ({ ref: mocks.ref, inView: mocks.inView }) }));
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyToClipboard: () => mocks }));
vi.mock('@/components/domain/asset/asset-header', () => ({
  AssetHeader: ({ assetInfo }: { assetInfo: api.AssetInfo }) => <div>{assetInfo.asset} metadata</div>,
}));
vi.mock('@/components/domain/dispenser/asset-dispenser-card', () => ({
  AssetDispenserCard: ({ dispenser, formattedPrice }: { dispenser: api.DispenserDetails; formattedPrice: string }) =>
    <div data-testid="listing">{dispenser.tx_hash}: {formattedPrice}</div>,
}));
vi.mock('@/components/ui/cards/asset-dispense-card', () => ({
  AssetDispenseCard: ({ dispense }: { dispense: api.Dispense }) => <div data-testid="dispense">{dispense.tx_hash}</div>,
}));

function dispenser(tx_hash: string, oracle_address: string | null = null): api.DispenserDetails {
  return {
    tx_hash, oracle_address, source: '1F6zwfr9VePPFJYFfQt9FWmMmJ1iVn1ziJ', asset: 'XCP', status: 0,
    give_quantity: asBaseUnits(100_000_000), give_quantity_normalized: asDisplayUnits('1'),
    give_remaining: asBaseUnits(200_000_000), give_remaining_normalized: asDisplayUnits('2'),
    satoshirate: asBaseUnits(oracle_address ? 888 : 8880),
    satoshirate_normalized: asDisplayUnits('0.00008880'),
    escrow_quantity: asBaseUnits(200_000_000), escrow_quantity_normalized: asDisplayUnits('2'),
    block_index: 800000, block_time: 1700000000, price: asBaseUnits(8880), satoshi_price: 8880,
  };
}
const response = (result: api.DispenserDetails[], result_count = result.length) => ({ result, result_count });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function complete<T>(request: ReturnType<typeof deferred<T>>, value: T) {
  await act(async () => { request.resolve(value); await request.promise; });
}

function firstPage() {
  return Array.from({ length: 20 }, (_, index) => dispenser(`row-${index}`));
}

function historyPage(ids: string[], result_count = ids.length): api.PaginatedResponse<api.Dispense> {
  return {
    result_count,
    result: ids.map((tx_hash) => ({
      tx_hash, tx_index: 1, block_index: 800000, block_time: 1700000000,
      source: 'source', destination: 'destination', asset: 'XCP',
      dispense_quantity: 100000000, dispense_quantity_normalized: asDisplayUnits('1'),
      dispenser_tx_hash: 'dispenser', btc_amount: 8880, btc_amount_normalized: asDisplayUnits('0.00008880'),
    })),
  };
}

function refreshPage() {
  const header = mocks.setHeaderProps.mock.calls.findLast(([value]) => value?.rightButton)?.[0];
  expect(header?.rightButton.disabled).toBe(false);
  act(() => { header.rightButton.onClick(); });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.asset = 'XCP';
  mocks.inView = false;
  vi.mocked(api.fetchAssetDetails).mockResolvedValue(null);
  vi.mocked(api.fetchAssetDispenses).mockResolvedValue({ result: [], result_count: 0 });
});
afterEach(cleanup);

describe('Get XCP oracle filtering', () => {
  it('removes oracle listings before calculating floor and average prices', async () => {
    vi.mocked(api.fetchAssetDispensers).mockResolvedValue(response([dispenser('oracle', 'feed'), dispenser('fixed')]));
    render(<AssetDispensersPage />);
    await waitFor(() => expect(screen.getAllByTestId('listing')).toHaveLength(1));
    expect(screen.getByTestId('listing')).toHaveTextContent('fixed: 8,880 sats');
    expect(screen.getAllByText('8,880 sats')).toHaveLength(2); // Floor and average
    expect(screen.queryByText('888 sats')).not.toBeInTheDocument();
  });

  it('continues past a full oracle-only page without using the filtered length as the offset', async () => {
    vi.mocked(api.fetchAssetDispensers)
      .mockResolvedValueOnce(response(Array.from({ length: 20 }, (_, i) => dispenser(`oracle-${i}`, 'feed')), 22))
      .mockResolvedValueOnce(response([dispenser('another-oracle', 'feed'), dispenser('fixed')], 22));
    render(<AssetDispensersPage />);
    await waitFor(() => expect(screen.getAllByTestId('listing')).toHaveLength(1));
    expect(screen.getByTestId('listing')).toHaveTextContent('fixed: 8,880 sats');
    expect(api.fetchAssetDispensers).toHaveBeenLastCalledWith('XCP', { limit: 20, offset: 20, status: 'open' });
  });
});

describe('dispenser detail request boundaries', () => {
  it('preserves separate dispenses from one transaction across history pages', async () => {
    vi.mocked(api.fetchAssetDispensers).mockResolvedValue(response([dispenser('fixed')]));
    const initial = historyPage([...Array.from({ length: 19 }, (_, index) => `history-${index}`), 'shared-payment'], 21);
    const next = historyPage(['shared-payment'], 21);
    next.result = next.result.map((row) => ({ ...row, destination: 'second-dispenser', dispenser_tx_hash: 'second-open' }));
    vi.mocked(api.fetchAssetDispenses).mockResolvedValueOnce(initial).mockResolvedValueOnce(next);
    const { rerender } = render(<AssetDispensersPage />);
    await screen.findByTestId('listing');
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getAllByTestId('dispense')).toHaveLength(20);
    mocks.inView = true;
    rerender(<AssetDispensersPage />);
    await waitFor(() => expect(screen.getAllByTestId('dispense')).toHaveLength(21));
    expect(screen.getAllByText('shared-payment')).toHaveLength(2);
    expect(api.fetchAssetDispenses).toHaveBeenLastCalledWith('XCP', { offset: 20, limit: 20 });
    expect(api.fetchAssetDispenses).toHaveBeenCalledTimes(2);
  });

  it('does not start another offset-zero request while the visible initial page is pending', async () => {
    const initial = deferred<ReturnType<typeof response>>();
    vi.mocked(api.fetchAssetDispensers).mockReturnValueOnce(initial.promise);
    mocks.inView = true;
    const { rerender } = render(<AssetDispensersPage />);
    rerender(<AssetDispensersPage />);
    expect(api.fetchAssetDispensers).toHaveBeenCalledTimes(1);
    expect(api.fetchAssetDispensers).toHaveBeenCalledWith('XCP', { offset: 0, limit: 20, status: 'open' });
    await complete(initial, response([dispenser('first')]));
    expect(screen.getByTestId('listing')).toHaveTextContent('first');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('discards both metadata and listings from an old asset whose initial requests finish late', async () => {
    const oldList = deferred<ReturnType<typeof response>>();
    const oldInfo = deferred<api.AssetInfo | null>();
    vi.mocked(api.fetchAssetDispensers).mockReturnValueOnce(oldList.promise)
      .mockResolvedValueOnce(response([dispenser('new-asset')]));
    vi.mocked(api.fetchAssetDetails).mockReturnValueOnce(oldInfo.promise).mockResolvedValueOnce(null);
    const { rerender } = render(<AssetDispensersPage />);
    mocks.asset = 'PEPEMEMECOIN';
    rerender(<AssetDispensersPage />);
    await screen.findByText('new-asset: 8,880 sats');
    await complete(oldList, response([dispenser('stale')]));
    await complete(oldInfo, { asset: 'XCP' } as api.AssetInfo);
    expect(screen.queryByText('stale: 8,880 sats')).not.toBeInTheDocument();
    expect(screen.queryByText('XCP metadata')).not.toBeInTheDocument();
    expect(api.fetchAssetDispensers).toHaveBeenLastCalledWith('PEPEMEMECOIN', { offset: 0, limit: 20, status: 'open' });
  });

  it.each(['asset', 'refresh'] as const)('discards a late pagination response after %s changes', async (boundary) => {
    const stale = deferred<ReturnType<typeof response>>();
    const fresh = deferred<ReturnType<typeof response>>();
    vi.mocked(api.fetchAssetDispensers).mockResolvedValueOnce(response(firstPage(), 21))
      .mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
    const { rerender } = render(<AssetDispensersPage />);
    await waitFor(() => expect(screen.getAllByTestId('listing')).toHaveLength(20));
    mocks.inView = true;
    rerender(<AssetDispensersPage />);
    expect(api.fetchAssetDispensers).toHaveBeenCalledTimes(2);
    mocks.inView = false;
    rerender(<AssetDispensersPage />);
    if (boundary === 'asset') {
      mocks.asset = 'PEPEMEMECOIN';
      rerender(<AssetDispensersPage />);
    } else refreshPage();
    expect(api.fetchAssetDispensers).toHaveBeenCalledTimes(3);
    await complete(stale, response([dispenser('stale')], 21));
    expect(screen.queryByTestId('listing')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    await complete(fresh, response([dispenser('fresh')]));
    expect(screen.getByTestId('listing')).toHaveTextContent('fresh');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['initial', 'more'] as const)('shows a retryable %s error instead of an empty result or retry loop', async (phase) => {
    const failed = deferred<ReturnType<typeof response>>();
    const retry = deferred<ReturnType<typeof response>>();
    if (phase === 'more') vi.mocked(api.fetchAssetDispensers).mockResolvedValueOnce(response(firstPage(), 21));
    vi.mocked(api.fetchAssetDispensers).mockReturnValueOnce(failed.promise).mockReturnValueOnce(retry.promise);
    const { rerender } = render(<AssetDispensersPage />);
    if (phase === 'more') {
      await waitFor(() => expect(screen.getAllByTestId('listing')).toHaveLength(20));
      mocks.inView = true;
      rerender(<AssetDispensersPage />);
    }
    await act(async () => { failed.reject(new Error('Node unavailable')); await failed.promise.catch(() => {}); });
    expect(screen.getByRole('alert')).toHaveTextContent('Node unavailable');
    expect(screen.queryByText('No open XCP dispensers found')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    if (phase === 'more') expect(screen.getAllByTestId('listing')).toHaveLength(20);
    rerender(<AssetDispensersPage />);
    expect(api.fetchAssetDispensers).toHaveBeenCalledTimes(phase === 'more' ? 2 : 1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(api.fetchAssetDispensers).toHaveBeenLastCalledWith('XCP', { offset: 0, limit: 20, status: 'open' });
    await complete(retry, response([dispenser('recovered')]));
    expect(screen.getByTestId('listing')).toHaveTextContent('recovered');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retries a failed history page without reloading valid open listings', async () => {
    const failed = deferred<ReturnType<typeof historyPage>>();
    const retry = deferred<ReturnType<typeof historyPage>>();
    vi.mocked(api.fetchAssetDispensers).mockResolvedValue(response([dispenser('fixed')]));
    vi.mocked(api.fetchAssetDispenses)
      .mockResolvedValueOnce(historyPage(Array.from({ length: 20 }, (_, index) => `history-${index}`), 21))
      .mockReturnValueOnce(failed.promise).mockReturnValueOnce(retry.promise);
    const { rerender } = render(<AssetDispensersPage />);
    await screen.findByTestId('listing');
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getAllByTestId('dispense')).toHaveLength(20);
    mocks.inView = true;
    rerender(<AssetDispensersPage />);
    expect(api.fetchAssetDispenses).toHaveBeenLastCalledWith('XCP', { limit: 20, offset: 20 });
    await act(async () => { failed.reject(new Error('History unavailable')); await failed.promise.catch(() => {}); });
    expect(screen.getByRole('alert')).toHaveTextContent('History unavailable');
    expect(screen.getAllByTestId('dispense')).toHaveLength(20);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(api.fetchAssetDispenses).toHaveBeenLastCalledWith('XCP', { limit: 20, offset: 0 });
    await complete(retry, historyPage(['recovered-history']));
    expect(screen.getByTestId('dispense')).toHaveTextContent('recovered-history');
    expect(api.fetchAssetDispensers).toHaveBeenCalledTimes(1);
  });

  it('ignores an old asset history page that finishes after replacement history', async () => {
    const stale = deferred<ReturnType<typeof historyPage>>();
    vi.mocked(api.fetchAssetDispensers).mockResolvedValue(response([dispenser('fixed')]));
    vi.mocked(api.fetchAssetDispenses)
      .mockResolvedValueOnce(historyPage(Array.from({ length: 20 }, (_, index) => `history-${index}`), 21))
      .mockReturnValueOnce(stale.promise).mockResolvedValueOnce(historyPage(['fresh-history']));
    const { rerender } = render(<AssetDispensersPage />);
    await screen.findByTestId('listing');
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    mocks.inView = true;
    rerender(<AssetDispensersPage />);
    expect(api.fetchAssetDispenses).toHaveBeenCalledTimes(2);
    mocks.inView = false;
    mocks.asset = 'PEPEMEMECOIN';
    rerender(<AssetDispensersPage />);
    await screen.findByText('fresh-history');
    await complete(stale, historyPage(['stale-history'], 21));
    expect(screen.getAllByTestId('dispense')).toHaveLength(1);
    expect(screen.queryByText('stale-history')).not.toBeInTheDocument();
  });
});
