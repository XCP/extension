import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BundleReviewCard } from './bundle-review-card';

describe('BundleReviewCard', () => {
  it('shows final seller proceeds and preserves who pays the platform fee', () => {
    render(<BundleReviewCard review={{
      status: 'proved', family: 'accept_exact_offer_with_cpfp', title: 'Accept offer',
      facts: [], notices: [], blockers: [],
      bundleSummary: {
        outcome: { kind: 'amount', label: 'You receive', value: '249,046 sats', emphasis: 'primary' },
        action: 'Sell 1 RAREPEPE',
        amounts: [
          { label: 'Platform fee', value: '6,250 sats', description: 'Paid by the buyer' },
          { label: 'Network fees', value: '1,500 sats' },
        ],
      },
    }} />);
    expect(screen.getByText('You receive')).toBeInTheDocument();
    expect(screen.getByText('249,046 sats')).toBeInTheDocument();
    expect(screen.getByText('Paid by the buyer')).toBeVisible();
    expect(screen.queryByText('Returned to wallet')).not.toBeInTheDocument();
    expect(screen.queryByText('Change')).not.toBeInTheDocument();
  });
});
