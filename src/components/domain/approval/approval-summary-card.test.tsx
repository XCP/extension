import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { MarketplaceApprovalReview } from '@/core/counterparty/marketplaceIntent';
import { ApprovalSummaryCard } from './approval-summary-card';
import type { MoneyMovement } from './money-movement';

const movement = (over: Partial<MoneyMovement> = {}): MoneyMovement => ({
  spent: 100000, backToYou: 5000, atRisk: 0, external: [{ address: 'bc1qexternaldest', value: 90000 }], fee: 5000, net: -95000, incomplete: false, ...over,
});

const base = { movement: movement(), hasHighFee: false, protocolFeeXcp: null } as const;

describe('ApprovalSummaryCard', () => {
  const review = (over: Partial<MarketplaceApprovalReview> = {}): MarketplaceApprovalReview => ({
    status: 'proved', family: 'accept_exact_offer', title: 'Accept offer',
    facts: [], notices: [], blockers: [],
    paymentSummary: [
      { kind: 'amount', label: 'You receive', value: '250,046 sats', emphasis: 'primary' },
      { kind: 'amount', label: 'Network fee', value: '500 sats', description: 'Deducted from seller proceeds' },
    ],
    ...over,
  });

  it('shows seller proceeds, not change or the buyer-paid external output', () => {
    render(<ApprovalSummaryCard {...base} txAction={{ label: 'Accept offer', description: '1 RAREPEPE' }} marketplaceReview={review()} />);
    expect(screen.getByText('You receive')).toBeInTheDocument();
    expect(screen.getByText('250,046 sats')).toBeInTheDocument();
    expect(screen.getByText('Deducted from seller proceeds')).toBeInTheDocument();
    expect(screen.queryByText('Returned to wallet')).not.toBeInTheDocument();
    expect(screen.queryByText('Change')).not.toBeInTheDocument();
    expect(screen.queryByTitle('bc1qexternaldest')).not.toBeInTheDocument();
  });

  it('shows the buyer conditional cost, not a generic send', () => {
    render(<ApprovalSummaryCard {...base} txAction={{ label: 'Offer to buy', description: '1 RAREPEPE' }} marketplaceReview={review({
      status: 'caution', family: 'authorize_exact_offer',
      paymentSummary: [
        { kind: 'amount', label: 'You pay if accepted', value: '256,250 sats', emphasis: 'primary' },
        { kind: 'amount', label: 'Platform fee', value: '6,250 sats', description: 'Paid by the buyer' },
      ],
    })} />);
    expect(screen.getByText('You pay if accepted')).toBeInTheDocument();
    expect(screen.getByText('256,250 sats')).toBeInTheDocument();
    expect(screen.getByText('Paid by the buyer')).toBeInTheDocument();
    expect(screen.queryByText('You send')).not.toBeInTheDocument();
    expect(screen.queryByText('Returned to wallet')).not.toBeInTheDocument();
  });

  it('keeps an attached purchase output separate from actual change', () => {
    render(<ApprovalSummaryCard {...base} txAction={{ label: 'Buy collectibles', description: '1 collectible' }} marketplaceReview={review({
      family: 'buy_listings', paymentSummary: [
        { kind: 'amount', label: 'You pay', value: '106,000 sats', emphasis: 'primary' },
        { kind: 'amount', label: 'Sats kept with your asset', value: '330 sats' },
        { kind: 'amount', label: 'Change', value: '293,670 sats' },
      ],
    })} />);
    expect(screen.getByText('Sats kept with your asset')).toBeInTheDocument();
    expect(screen.getByText('330 sats')).toBeInTheDocument();
    expect(screen.getByText('Change')).toBeInTheDocument();
    expect(screen.getByText('293,670 sats')).toBeInTheDocument();
    expect(screen.queryByText('Returned to wallet')).not.toBeInTheDocument();
  });

  it('shows a conditional listing payout even though this PSBT is not funded', () => {
    render(<ApprovalSummaryCard {...base} hideMovement txAction={{ label: 'List for sale', description: '1 RAREPEPE' }} marketplaceReview={review({
      family: 'create_listing', paymentSummary: [
        { kind: 'amount', label: 'Your payout if sold', value: '250,546 sats', emphasis: 'primary' },
      ],
    })} />);
    expect(screen.getByText('Your payout if sold')).toBeInTheDocument();
    expect(screen.getByText('250,546 sats')).toBeInTheDocument();
    expect(screen.queryByText('Network fee')).not.toBeInTheDocument();
  });

  it.each(['blocked', 'retry'] as const)('does not trust payment labels from a %s review', (status) => {
    render(<ApprovalSummaryCard {...base} txAction={null} marketplaceReview={review({ status })} />);
    expect(screen.queryByText('250,046 sats')).not.toBeInTheDocument();
    expect(screen.getByText('You send')).toBeInTheDocument();
    expect(screen.getByTitle('bc1qexternaldest')).toBeInTheDocument();
  });

  it('does not drop a high-fee warning when replacing generic movement', () => {
    render(<ApprovalSummaryCard {...base} hasHighFee txAction={null} marketplaceReview={review()} />);
    expect(screen.getByText(/unusually high network fee/i)).toBeInTheDocument();
  });

  it('puts the verified checkout total before supporting payment rows', () => {
    render(<ApprovalSummaryCard {...base}
      txAction={{ label: 'Buy collectibles', description: '2 collectibles' }} principal
      primaryFacts={[{ kind: 'amount', label: 'You pay', value: '306,000 sats', emphasis: 'primary' }]}
    />);
    const total = screen.getByText('306,000 sats');
    expect(total.compareDocumentPosition(screen.getByText('Network fee')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('2 collectibles')).toBeInTheDocument();
    expect(screen.getByTitle('bc1qexternaldest')).toBeInTheDocument();
  });
  it('leads with the Counterparty action and shows money-movement beneath (no BTC headline)', () => {
    render(<ApprovalSummaryCard {...base} txAction={{ label: 'Send', description: '5 PEPECASH' }} />);
    expect(screen.getByText('Send')).toBeInTheDocument();
    expect(screen.getByText('5 PEPECASH')).toBeInTheDocument();
    // composition A: no "You send" BTC headline when an action leads
    expect(screen.queryByText('You send')).not.toBeInTheDocument();
    // ...but the BTC movement is still visible in the rows
    expect(screen.getByText('Network fee')).toBeInTheDocument();
  });

  it('leads with the money-movement headline when there is no action', () => {
    render(<ApprovalSummaryCard {...base} txAction={null} />);
    expect(screen.getByText('You send')).toBeInTheDocument();
    expect(screen.getByText(/0\.00095000/)).toBeInTheDocument();
  });

  it('shows the amber high-fee treatment', () => {
    render(<ApprovalSummaryCard {...base} txAction={null} hasHighFee />);
    expect(screen.getByText(/unusually high/i)).toBeInTheDocument();
  });

  it('shows a protocol (XCP) fee when present', () => {
    render(<ApprovalSummaryCard {...base} txAction={null} protocolFeeXcp={50000000} />);
    expect(screen.getByText('Protocol Fee:')).toBeInTheDocument();
    expect(screen.getByText(/0\.50000000 XCP/)).toBeInTheDocument();
  });

  it.each(['9999999999999999', 9_999_999_999_999_999n])('preserves every base unit of a large protocol fee: %s', (fee) => {
    render(<ApprovalSummaryCard {...base} txAction={null} protocolFeeXcp={fee} />);
    expect(screen.getByText('99,999,999.99999999 XCP')).toBeInTheDocument();
    expect(screen.queryByText('100,000,000.00000000 XCP')).not.toBeInTheDocument();
  });

  it('preserves all eight decimals even at the uint64 boundary', () => {
    render(<ApprovalSummaryCard {...base} txAction={null} protocolFeeXcp={18_446_744_073_709_551_615n} />);
    expect(screen.getByText('184,467,440,737.09551615 XCP')).toBeInTheDocument();
  });

  it.each([Number.MAX_SAFE_INTEGER + 1, -1, 1.5, '1.5', 'not-a-fee', false, {}])(
    'does not fabricate a fee from an inexact or malformed value: %j', (fee) => {
      render(<ApprovalSummaryCard {...base} txAction={null} protocolFeeXcp={fee} />);
      expect(screen.getByText('Protocol Fee:')).toBeInTheDocument();
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
      expect(screen.queryByText(/ XCP$/)).not.toBeInTheDocument();
    },
  );

  it.each([undefined, null, 0, 0n, '0', '000'])('omits an absent or zero protocol fee: %s', (fee) => {
    render(<ApprovalSummaryCard {...base} txAction={null} protocolFeeXcp={fee} />);
    expect(screen.queryByText('Protocol Fee:')).not.toBeInTheDocument();
  });
});
