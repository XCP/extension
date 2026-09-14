import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { zeldReviewLine } from '@/components/domain/zeld/zeld-field';
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

function renderWith(result: Record<string, unknown>) {
  return render(
    <ReviewScreen
      apiResponse={{ result: { params: { source: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' }, btc_fee: 1_000, ...result } }}
      onSign={vi.fn()}
      onBack={vi.fn()}
      error={null}
      isSigning={false}
    />
  );
}

const found = {
  status: 'found' as const, target_zeros: 6, seconds: 20, elapsed_ms: 3_250, attempts: 18_400_000,
  nonce: 1, txid: '000000ab' + 'c'.repeat(56), zero_count: 6,
};

describe('ReviewScreen ZELD line', () => {
  it('says nothing when no hunt ran', () => {
    renderWith({});
    expect(screen.queryByText('ZELD:')).not.toBeInTheDocument();
  });

  it('is one short line when a rare txid was found', () => {
    renderWith({ zeld_hunt: found });
    expect(screen.getByText('ZELD:')).toBeInTheDocument();
    expect(screen.getByText('Rare txid found: 6 zeros in 3.3s')).toBeInTheDocument();
  });

  it('is one short line when time ran out', () => {
    renderWith({ zeld_hunt: { status: 'not_found', target_zeros: 6, seconds: 20, elapsed_ms: 20_000, attempts: 42_000 } });
    expect(screen.getByText('No rare txid in 20s; sending as usual')).toBeInTheDocument();
  });

  it('stays silent for a skipped hunt, rolled-forward ZELD, change order and indexer outages', () => {
    renderWith({
      zeld_hunt: { status: 'skipped', target_zeros: 6, seconds: 20, elapsed_ms: 0, attempts: 0, reason: 'legacy' },
      zeld_protection: { excluded: [], carried_forward: ['a:1'], api_unavailable: true, change_first: true },
    });
    expect(screen.queryByText('ZELD:')).not.toBeInTheDocument();
  });

  it('mentions outputs the guard kept out of a payment', () => {
    expect(zeldReviewLine({ protection: { excluded: ['a:1', 'b:0'], carried_forward: [], api_unavailable: false } }))
      .toBe('Kept 2 outputs holding ZELD out of this payment');
    expect(zeldReviewLine({ protection: { excluded: ['a:1'], carried_forward: [], api_unavailable: false }, hunt: found }))
      .toBe('Kept 1 output holding ZELD out of this payment');
  });

  it('describes a send and a park in one line each', () => {
    const base = { spent_outpoints: ['a:1'], change_vout: 0, recipient_vout: 1 };
    expect(zeldReviewLine({ send: { ...base, amount_base_units: '100000000000', remainder_base_units: '335200000000' } }))
      .toBe('Sending 1,000 ZELD; 3,352 stays with you');
    expect(zeldReviewLine({ send: { ...base, amount_base_units: '435200000000', remainder_base_units: '0', park: true } }))
      .toBe('Moving 4,352 ZELD to a small output of your own');
  });
});
