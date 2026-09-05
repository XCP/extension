import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BundleReviewCard } from './bundle-review-card';

describe('BundleReviewCard', () => {
  it('shows final seller proceeds without repeating summary amounts in the disclosure', () => {
    render(<BundleReviewCard review={{
      status: 'proved', family: 'accept_exact_offer_with_cpfp', title: 'Accept offer',
      facts: [
        { kind: 'amount', label: 'Network fees', value: '1,500 sats' },
        { kind: 'amount', label: 'Added child fee', value: '1,000 sats' },
      ],
      notices: [], blockers: [],
      bundleSummary: {
        outcome: { kind: 'amount', label: 'You receive', value: '249,046 sats', emphasis: 'primary' },
        action: 'Sell 1 RAREPEPE',
        amounts: [
          { label: 'Network fees', value: '1,500 sats', description: 'Deducted from your proceeds' },
        ],
      },
    }} />);
    expect(screen.getByText('You receive')).toBeInTheDocument();
    expect(screen.getByText('249,046 sats')).toBeInTheDocument();
    expect(screen.getByText('Deducted from your proceeds')).toBeVisible();
    // The disclosure adds facts; it does not repeat an amount already shown above it.
    fireEvent.click(screen.getByRole('button', { name: 'Payout and fee details' }));
    expect(screen.getAllByText('Network fees')).toHaveLength(1);
    expect(screen.getByText('Added child fee')).toBeInTheDocument();
    expect(screen.queryByText('Returned to wallet')).not.toBeInTheDocument();
    expect(screen.queryByText('Change')).not.toBeInTheDocument();
  });
});
