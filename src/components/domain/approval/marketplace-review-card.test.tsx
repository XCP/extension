import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarketplaceReviewCard } from './marketplace-review-card';

describe('MarketplaceReviewCard', () => {
  it('explains a proved flexible listing without a generic drain warning', () => {
    render(<MarketplaceReviewCard review={{
      status: 'caution',
      family: 'create_listing',
      title: 'List 1 RAREPEPE for 0.00250000 BTC',
      facts: [
        { label: 'Seller receives', value: '250,546 sats' },
        { label: 'Delivery', value: 'Detached to the eventual buyer' },
      ],
      notices: [{
        severity: 'warning',
        message: 'The buyer may add funding inputs and choose the detach destination.',
      }],
      blockers: [],
    }} />);

    expect(screen.getByText('List 1 RAREPEPE for 0.00250000 BTC')).toBeInTheDocument();
    expect(screen.queryByText('Terms verified — review authorization')).not.toBeInTheDocument();
    expect(screen.getByText('250,546 sats')).toBeInTheDocument();
    expect(screen.getByText(/buyer may add funding inputs/i)).toBeInTheDocument();
  });

  it('shows an exact checkout as proved rather than as a scary generic detach', () => {
    render(<MarketplaceReviewCard review={{
      status: 'proved',
      family: 'buy_listings',
      title: 'Buy 2 collectibles for 0.00306000 BTC',
      facts: [
        { label: 'You pay', value: '306,000 sats' },
        { label: 'Delivery', value: 'Detached to bc1qbuyer' },
      ],
      notices: [{
        severity: 'info',
        message: 'SIGHASH_ALL fixes every input, seller payment, fee, change output, and destination.',
      }],
      blockers: [],
    }} />);

    expect(screen.queryByText('Marketplace terms verified')).not.toBeInTheDocument();
    expect(screen.getByText('306,000 sats')).toBeInTheDocument();
    expect(screen.queryByText(/SIGHASH_ALL fixes every input/i)).not.toBeInTheDocument();
  });

  it('separates a variable XCP attach quote from wallet-proved Bitcoin terms', () => {
    render(<MarketplaceReviewCard review={{
      status: 'caution',
      family: 'attach_for_listing',
      title: 'Attach 1 raw unit of RAREPEPE',
      facts: [
        { label: 'Network fee', value: '1,000 sats' },
        { label: 'Quoted XCP fee', value: '0.25 XCP' },
      ],
      notices: [{
        severity: 'warning',
        message: 'Counterparty recomputes it at the block that confirms this transaction.',
      }],
      blockers: [],
    }} />);

    expect(screen.getByText('0.25 XCP')).toBeInTheDocument();
    expect(screen.queryByText(/Terms verified/i)).not.toBeInTheDocument();
    expect(screen.getByText(/recomputes it at the block/i)).toBeInTheDocument();
  });

  it('distinguishes a retryable incomplete lookup from a proved mismatch', () => {
    render(<MarketplaceReviewCard review={{
      status: 'retry',
      family: 'buy_listings',
      title: 'Attached-asset lookup is temporarily unavailable',
      facts: [],
      notices: [{ severity: 'warning', message: 'Retry after the indexer responds.' }],
      blockers: ['Asset status is required before signing.'],
    }} />);

    expect(screen.getByText('Verification incomplete — retry')).toBeInTheDocument();
    expect(screen.queryByText('Marketplace terms did not verify')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Why signing is unavailable' }));
    expect(screen.getByText(/Signing stays unavailable until verification succeeds/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing looks wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry verification' })).not.toBeInTheDocument();
  });

  it('keeps a proved mismatch visually distinct from a retry', () => {
    render(<MarketplaceReviewCard review={{
      status: 'blocked',
      family: 'buy_listings',
      title: 'Seller payment does not match the signed listing',
      facts: [],
      notices: [],
      blockers: ['Seller payment differs.'],
    }} />);

    expect(screen.getByText('Marketplace terms did not verify')).toBeInTheDocument();
    expect(screen.getByTestId('approval-notice-reason')).toHaveTextContent('Seller payment differs.');
    fireEvent.click(screen.getByRole('button', { name: 'Why signing is unavailable' }));
    expect(screen.getByText(/Signing is blocked/i)).toBeInTheDocument();
  });

  it('offers recovery independently of authorization and disables a pending retry', () => {
    const onRetry = vi.fn();
    const review = { status: 'retry' as const, family: 'create_listing' as const,
      title: 'List 1 RAREPEPE', facts: [], notices: [], blockers: ['Asset lookup unavailable'] };
    const { rerender } = render(<MarketplaceReviewCard review={review} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry verification' }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<MarketplaceReviewCard review={review} onRetry={onRetry} retrying />);
    expect(screen.getByRole('button', { name: 'Verifying…' })).toBeDisabled();
    rerender(<MarketplaceReviewCard review={review} onRetry={onRetry} retryError="Ledger still unavailable" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Ledger still unavailable');
    expect(screen.queryByRole('button', { name: /^(sign|authorize)( |$)/i })).not.toBeInTheDocument();
  });
});
