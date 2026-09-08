import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/core/counterparty/api';
import { asBaseUnits, asDisplayUnits } from '@/core/numeric';
import AssetDispensersPage from '../[asset]';

const mocks = vi.hoisted(() => ({
  inView: false, setHeaderProps: vi.fn(), navigate: vi.fn(),
  settings: { fiat: 'usd', priceUnit: 'sats' }, updateSettings: vi.fn(),
  copy: vi.fn(), isCopied: () => false, ref: vi.fn(),
}));
vi.mock('@/core/counterparty/api');
vi.mock('react-router', () => ({ useNavigate: () => mocks.navigate, useParams: () => ({ asset: 'XCP' }) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: mocks.setHeaderProps }) }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => mocks }));
vi.mock('@/hooks/useMarketPrices', () => ({ useMarketPrices: () => ({ btc: null }) }));
vi.mock('@/hooks/useInView', () => ({ useInView: () => ({ ref: mocks.ref, inView: mocks.inView }) }));
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyToClipboard: () => mocks }));
vi.mock('@/components/domain/dispenser/asset-dispenser-card', () => ({
  AssetDispenserCard: ({ dispenser, formattedPrice }: { dispenser: api.DispenserDetails; formattedPrice: string }) =>
    <div data-testid="listing">{dispenser.tx_hash}: {formattedPrice}</div>,
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
const response = (result: api.DispenserDetails[]) => ({ result, result_count: result.length });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inView = false;
  vi.mocked(api.fetchAssetDetails).mockResolvedValue(null);
  vi.mocked(api.fetchAssetDispenses).mockResolvedValue({ result: [], result_count: 0 });
});

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
      .mockResolvedValueOnce(response(Array.from({ length: 20 }, (_, i) => dispenser(`oracle-${i}`, 'feed'))))
      .mockResolvedValueOnce(response([dispenser('another-oracle', 'feed'), dispenser('fixed')]));
    const { rerender } = render(<AssetDispensersPage />);
    await screen.findByText('No open XCP dispensers found');
    mocks.inView = true;
    rerender(<AssetDispensersPage />);
    await waitFor(() => expect(screen.getAllByTestId('listing')).toHaveLength(1));
    expect(screen.getByTestId('listing')).toHaveTextContent('fixed: 8,880 sats');
    expect(api.fetchAssetDispensers).toHaveBeenLastCalledWith('XCP', { limit: 20, offset: 20, status: 'open' });
  });
});
