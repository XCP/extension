import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

    expect(screen.getByText('Terms verified — review authorization')).toBeInTheDocument();
    expect(screen.getByText('250,546 sats')).toBeInTheDocument();
    expect(screen.getByText(/buyer may add funding inputs/i)).toBeInTheDocument();
    expect(screen.getByText(/wallet independently checked the transaction bytes/i)).toBeInTheDocument();
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

    expect(screen.getByText('Marketplace terms verified')).toBeInTheDocument();
    expect(screen.getByText('306,000 sats')).toBeInTheDocument();
    expect(screen.getByText(/SIGHASH_ALL fixes every input/i)).toBeInTheDocument();
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
    expect(screen.getByText(/website supplied the label and XCP estimate/i)).toBeInTheDocument();
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

    expect(screen.getByText('Verification incomplete — retry required')).toBeInTheDocument();
    expect(screen.queryByText('Marketplace terms did not verify')).not.toBeInTheDocument();
    expect(screen.getByText(/Signing remains blocked until/i)).toBeInTheDocument();
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
    expect(screen.getByText(/Signing is blocked/i)).toBeInTheDocument();
  });
});
