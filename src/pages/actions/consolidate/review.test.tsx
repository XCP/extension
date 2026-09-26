import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { ConsolidationData } from '@/core/bitcoin/consolidationApi';
import { ConsolidationReview } from './review';

const api = vi.hoisted(() => ({
  fetchTokenBalances: vi.fn(),
  fetchOwnedAssets: vi.fn(),
}));
vi.mock('@/core/counterparty/api', () => api);

const SOURCE = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const P2TR = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';

function batch(feeAddress: string): ConsolidationData {
  return {
    address: SOURCE,
    summary: {
      total_utxos: 10, total_btc: 0.01, batches_required: 1, current_batch: 1, batch_utxos: 10, max_batch_utxos: 420,
    },
    fee_config: { fee_address: feeAddress, fee_percent: 10, exemption_threshold: 0 },
    utxos: [],
    mempool_status: { pending_consolidations: 0, pending_utxo_count: 0, can_broadcast_more: true },
  } as unknown as ConsolidationData;
}

function renderReview(destination: string, feeAddress: string, ownedAddresses: string[] = [SOURCE]) {
  const onSign = vi.fn();
  const data = batch(feeAddress);
  render(
    <ConsolidationReview
      apiResponse={{ params: { source: SOURCE, destination, feeRateSatPerVByte: 1 }, consolidationData: data, allBatches: [data] }}
      onSign={onSign}
      onBack={vi.fn()}
      error={null}
      setError={vi.fn()}
      ownedAddresses={ownedAddresses}
    />,
  );
  return onSign;
}

/** Signing waits for the holdings answer, so click only once the button is enabled. */
async function signWhenReady(name: string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe('ConsolidationReview script-address caution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchTokenBalances.mockResolvedValue([{ asset: 'XCP' }]);
    api.fetchOwnedAssets.mockResolvedValue([]);
  });

  it('asks for the review step when the recovered BTC goes to a script address', async () => {
    const onSign = renderReview(P2TR, SOURCE);
    await signWhenReady('Review');
    expect(onSign).not.toHaveBeenCalled();
    expect(screen.getAllByText('Payment to a Script Address').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and sign' }));
    expect(onSign).toHaveBeenCalledTimes(1);
  });

  it('changes nothing for an address holding no assets', async () => {
    api.fetchTokenBalances.mockResolvedValue([]);
    const onSign = renderReview(P2TR, SOURCE);
    await signWhenReady('Sign & Broadcast Transaction');
    expect(onSign).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Payment to a Script Address')).not.toBeInTheDocument();
  });

  it('does not caution recovering to the wallet\'s own addresses', async () => {
    const onSign = renderReview(SOURCE, SOURCE);
    await signWhenReady('Sign & Broadcast Transaction');
    expect(onSign).toHaveBeenCalledTimes(1);
    expect(api.fetchTokenBalances).not.toHaveBeenCalled();
  });
});
