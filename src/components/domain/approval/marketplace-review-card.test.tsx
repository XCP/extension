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

    expect(screen.getByText('Marketplace terms verified')).toBeInTheDocument();
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
});
