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

vi.mock('@/contexts/composer-context-object', () => ({
  useComposerOptional: () => null,
}));

function renderWith(result: Record<string, unknown>) {
  return render(
    <ReviewScreen
      apiResponse={{ result: { params: { source: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' }, btc_fee: 306, ...result } }}
      onSign={vi.fn()}
      onBack={vi.fn()}
      error={null}
      isSigning={false}
    />
  );
}

describe('ReviewScreen for a Taproot-encoded transaction', () => {
  it('says in one line that it is a commit and a reveal, with the fee of both', () => {
    renderWith({ signed_reveal_rawtransaction: '02', reveal_fee: 330 });
    expect(screen.getByText('Sent as two transactions, commit then reveal. Total fee 0.00000636 BTC')).toBeInTheDocument();
  });

  it('says nothing for an ordinary transaction', () => {
    renderWith({});
    expect(screen.queryByText(/commit then reveal/)).not.toBeInTheDocument();
  });

  it('says nothing about a reveal fee the composer context did not verify', () => {
    renderWith({ signed_reveal_rawtransaction: '02' });
    expect(screen.queryByText(/commit then reveal/)).not.toBeInTheDocument();
  });
});
