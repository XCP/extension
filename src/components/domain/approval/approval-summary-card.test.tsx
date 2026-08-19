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
});
