import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ApprovalSummaryCard } from './approval-summary-card';

const base = {
  txAction: null,
  isSwapListing: false,
  swapFeeBreakdown: null,
  fee: 5000,
  hasHighFee: false,
  totalValue: 100000000,
  listingPrice: 0,
  protocolFeeXcp: null,
} as const;

describe('ApprovalSummaryCard', () => {
  it('shows a Counterparty action headline when txAction is set', () => {
    render(<ApprovalSummaryCard {...base} txAction={{ label: 'Send', description: '5 PEPECASH' }} />);
    expect(screen.getByText('Send')).toBeInTheDocument();
    expect(screen.getByText('5 PEPECASH')).toBeInTheDocument();
  });

  it('shows the swap-listing headline for an ANYONECANPAY signer', () => {
    render(<ApprovalSummaryCard {...base} isSwapListing listingPrice={50000000} />);
    expect(screen.getByText('Atomic Swap Listing')).toBeInTheDocument();
    expect(screen.getByText(/Listing price/)).toBeInTheDocument();
    expect(screen.getByText(/0\.50000000/)).toBeInTheDocument();
  });

  it('shows the swap-purchase headline + fee breakdown', () => {
    render(
      <ApprovalSummaryCard
        {...base}
        swapFeeBreakdown={{ sellerPayment: 100000000, platformFee: 5000000, platformAddress: 'bc1qfee', networkFee: 3000 }}
      />
    );
    expect(screen.getByText('Atomic Swap Purchase')).toBeInTheDocument();
    expect(screen.getByText('Payment to seller')).toBeInTheDocument();
    expect(screen.getByText('Platform fee:')).toBeInTheDocument();
    expect(screen.getByText(/5\.0%/)).toBeInTheDocument(); // 5,000,000 / 100,000,000
  });

  it('falls back to Total Value for a plain BTC transaction', () => {
    render(<ApprovalSummaryCard {...base} totalValue={200000000} />);
    expect(screen.getByText('Total Value')).toBeInTheDocument();
    expect(screen.getByText(/2\.00000000/)).toBeInTheDocument();
  });

  it('shows the amber high-fee caption only when fees are high', () => {
    const { rerender } = render(<ApprovalSummaryCard {...base} />);
    expect(screen.queryByText(/unusually high/i)).not.toBeInTheDocument();
    rerender(<ApprovalSummaryCard {...base} hasHighFee />);
    expect(screen.getByText(/unusually high/i)).toBeInTheDocument();
  });

  it('shows a protocol (XCP) fee when present', () => {
    render(<ApprovalSummaryCard {...base} protocolFeeXcp={50000000} />);
    expect(screen.getByText('Protocol Fee:')).toBeInTheDocument();
    expect(screen.getByText(/0\.50000000 XCP/)).toBeInTheDocument();
  });
});
