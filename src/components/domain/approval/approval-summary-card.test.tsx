import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ApprovalSummaryCard } from './approval-summary-card';
import type { MoneyMovement } from './money-movement';

const movement = (over: Partial<MoneyMovement> = {}): MoneyMovement => ({
  spent: 100000, backToYou: 5000, atRisk: 0, external: [{ address: 'bc1qexternaldest', value: 90000 }], fee: 5000, net: -95000, incomplete: false, ...over,
});

const base = { movement: movement(), hasHighFee: false, protocolFeeXcp: null } as const;

describe('ApprovalSummaryCard', () => {
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
