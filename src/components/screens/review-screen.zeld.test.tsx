import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { ZeldHuntMetadata } from '@/core/zeld/types';
import { ReviewScreen } from './review-screen';

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { fiat: 'usd' }, updateSettings: vi.fn(), isLoading: false }),
}));

vi.mock('@/hooks/useMarketPrices', () => ({
  useMarketPrices: () => ({ btc: 50000, xcp: 10, loading: false, error: null, currency: 'usd' }),
}));

vi.mock('@/contexts/composer-context-object', () => ({
  useComposerOptional: () => null,
}));

function renderWithHunt(zeld_hunt?: ZeldHuntMetadata) {
  return render(
    <ReviewScreen
      apiResponse={{
        result: {
          params: { source: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' },
          btc_fee: 1_000,
          ...(zeld_hunt ? { zeld_hunt } : {}),
        },
      }}
      onSign={vi.fn()}
      onBack={vi.fn()}
      error={null}
      isSigning={false}
    />
  );
}

describe('ReviewScreen ZELD hunt field', () => {
  it('says nothing when no hunt ran', () => {
    renderWithHunt();
    expect(screen.queryByText(/ZELD hunt/)).not.toBeInTheDocument();
  });

  it('shows the found txid with its leading zeros set apart', () => {
    renderWithHunt({
      status: 'found',
      target_zeros: 6,
      seconds: 15,
      elapsed_ms: 3_250,
      attempts: 18_400_000,
      nonce: 0x8000_1234,
      txid: '000000ab' + 'c'.repeat(56),
      zero_count: 6,
    });
    expect(screen.getByText('ZELD hunt:')).toBeInTheDocument();
    expect(screen.getByText(/Found a txid with 6 leading zeros in 3\.3s/)).toBeInTheDocument();
    expect(screen.getByText(/18\.4M hashes/)).toBeInTheDocument();
    expect(screen.getByText('000000')).toHaveClass('font-bold');
    expect(screen.getByText(/Earns ZELD on your change output/)).toBeInTheDocument();
  });

  it('explains a hunt that ran out of time', () => {
    renderWithHunt({ status: 'not_found', target_zeros: 6, seconds: 10, elapsed_ms: 10_000, attempts: 42_000 });
    expect(screen.getByText(/No txid with 6 leading zeros within 10s/)).toBeInTheDocument();
    expect(screen.getByText(/42K hashes/)).toBeInTheDocument();
    expect(screen.getByText(/Sending as composed/)).toBeInTheDocument();
  });

  it('gives the reason a hunt was skipped', () => {
    renderWithHunt({
      status: 'skipped',
      target_zeros: 6,
      seconds: 10,
      elapsed_ms: 0,
      attempts: 0,
      reason: 'Only Native SegWit and Taproot addresses can hunt.',
    });
    expect(screen.getByText(/Skipped\. Only Native SegWit and Taproot addresses can hunt\./)).toBeInTheDocument();
  });
});
