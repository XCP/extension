import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { ScriptPaymentRisk } from '@/core/bitcoin/scriptPaymentRisk';
import { ReviewScreen } from './review-screen';

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { fiat: 'usd' }, updateSettings: vi.fn(), isLoading: false }),
}));

vi.mock('@/hooks/useMarketPrices', () => ({
  useMarketPrices: () => ({ btc: null, xcp: null, loading: false, error: null, currency: 'usd' }),
}));

const SOURCE = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const P2TR = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';

const composer = vi.hoisted(() => ({
  risk: null as ScriptPaymentRisk | null,
  acknowledge: vi.fn(),
}));
vi.mock('@/contexts/composer-context-object', () => ({
  useComposerOptional: () => ({
    state: { decodedMessage: null, scriptPaymentRisk: composer.risk },
    activeWallet: { type: 'mnemonic' },
    acknowledgeScriptPaymentRisk: composer.acknowledge,
  }),
}));

const apiResponse = { result: { params: { source: SOURCE, destination: P2TR }, btc_fee: 400 } };

function renderReview() {
  const onSign = vi.fn();
  render(<ReviewScreen apiResponse={apiResponse} onSign={onSign} onBack={vi.fn()} error={null} isSigning={false} />);
  return onSign;
}

describe('ReviewScreen script-address caution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    composer.risk = null;
  });

  it('signs directly when there is nothing to caution', () => {
    const onSign = renderReview();
    expect(screen.queryByText('Payment to a Script Address')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign and broadcast transaction' }));
    expect(onSign).toHaveBeenCalledTimes(1);
  });

  it('states the caution and requires the acknowledgement step before signing', () => {
    composer.risk = { totalSats: 5_000, addresses: [P2TR], source: SOURCE };
    const onSign = renderReview();

    expect(screen.getByText('Payment to a Script Address')).toBeInTheDocument();
    expect(screen.getByText(
      `0.00005000 BTC goes to ${P2TR}, a script address. Paying a script address can let its owner move your Counterparty assets from ${SOURCE}. Only continue if you trust the recipient.`,
    )).toBeInTheDocument();

    // The main button opens the review step; it does not sign.
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onSign).not.toHaveBeenCalled();
    expect(composer.acknowledge).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Review before signing' })).toBeInTheDocument();

    // Backing out signs nothing.
    fireEvent.click(screen.getAllByRole('button', { name: 'Back' }).at(-1)!);
    expect(onSign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and sign' }));
    expect(composer.acknowledge).toHaveBeenCalledTimes(1);
    expect(onSign).toHaveBeenCalledTimes(1);
    expect(composer.acknowledge.mock.invocationCallOrder[0]!).toBeLessThan(onSign.mock.invocationCallOrder[0]!);
  });
});
