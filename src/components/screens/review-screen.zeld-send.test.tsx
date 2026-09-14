import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ReviewScreen } from './review-screen';

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { fiat: 'usd' }, updateSettings: vi.fn(), isLoading: false }),
}));
vi.mock('@/hooks/useMarketPrices', () => ({
  useMarketPrices: () => ({ btc: 50000, xcp: 10, loading: false, error: null, currency: 'usd' }),
}));
vi.mock('@/contexts/composer-context-object', () => ({ useComposerOptional: () => null }));

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

describe('ReviewScreen ZELD guard and send', () => {
  it('describes a ZELD send with the remainder staying on change', () => {
    renderWith({
      zeld_send: { amount_base_units: '100000000000', remainder_base_units: '335200000000', spent_outpoints: ['a:1'], change_vout: 0, recipient_vout: 1 },
    });
    expect(screen.getByText('ZELD:')).toBeInTheDocument();
    expect(screen.getByText(/Sends 1,000\.00000000 ZELD/)).toBeInTheDocument();
    expect(screen.getByText(/3,352\.00000000/)).toBeInTheDocument();
  });

  it('says which outputs the guard kept out and why', () => {
    renderWith({ zeld_protection: { excluded: ['a:1', 'b:0'], carried_forward: [], api_unavailable: false } });
    expect(screen.getByText(/Kept 2 outputs holding ZELD out of this transaction/)).toBeInTheDocument();
  });

  it('says when ZELD rolls forward to change', () => {
    renderWith({ zeld_protection: { excluded: [], carried_forward: ['a:1'], api_unavailable: false } });
    expect(screen.getByText(/Spends 1 output holding ZELD; the ZELD moves to your change output/)).toBeInTheDocument();
  });

  it('warns when only the txid heuristic could be applied', () => {
    renderWith({ zeld_protection: { excluded: [], carried_forward: [], api_unavailable: true } });
    expect(screen.getByText(/indexer could not be reached/)).toBeInTheDocument();
  });
});
