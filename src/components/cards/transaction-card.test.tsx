import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransactionCard } from './transaction-card';
import type { Transaction } from '@/utils/blockchain/counterparty/api';

// Mock the format utilities
vi.mock('@/utils/format', () => ({
  formatTimeAgo: (timestamp: number) => `${Math.floor((Date.now() - timestamp * 1000) / 60000)} minutes ago`,
  formatDate: (timestamp: number) => new Date(timestamp * 1000).toISOString()
}));

describe('TransactionCard', () => {
  const mockTransaction: Transaction = {
    tx_hash: 'abc123def456789012345678901234567890123456789012345678901234567890',
    block_index: 840000,
    block_time: 1700000000,
    source: 'bc1qsourceaddress123456789',
    destination: 'bc1qdestinationaddress123456',
    data: {},
    supported: true,
    confirmed: true,
    unpacked_data: {
      message_type: 'send',
      message_type_id: 0,
      message_data: {}
    }
  };

  const mockPendingTransaction: Transaction = {
    ...mockTransaction,
    confirmed: false
  };

  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders confirmed transaction correctly', () => {
    render(
      <TransactionCard
        transaction={mockTransaction}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('SEND')).toBeInTheDocument();
    expect(screen.getByText(/TX:/)).toBeInTheDocument();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    expect(screen.queryByText('(0 confirmations)')).not.toBeInTheDocument();
  });

  it('renders pending transaction with correct styling', () => {
    render(
      <TransactionCard
        transaction={mockPendingTransaction}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Mempool')).toBeInTheDocument();
    expect(screen.getByText('(0 confirmations)')).toBeInTheDocument();
    
    const card = screen.getByRole('button');
    expect(card).toHaveClass('opacity-75');
  });

  it('formats message type correctly', () => {
    const txWithComplexType: Transaction = {
      ...mockTransaction,
      unpacked_data: {
        message_type: 'order_match',
        message_type_id: 1
      }
    };

    render(
      <TransactionCard
        transaction={txWithComplexType}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('ORDER MATCH')).toBeInTheDocument();
  });

  it('truncates transaction hash by default', () => {
    render(
      <TransactionCard
        transaction={mockTransaction}
        onClick={mockOnClick}
      />
    );

    const hashElement = screen.getByText(/TX:/);
    expect(hashElement.textContent).toContain('abc123de...34567890');
    expect(hashElement.textContent).not.toContain(mockTransaction.tx_hash);
  });

  it('shows full transaction hash when showFullHash is true', () => {
    render(
      <TransactionCard
        transaction={mockTransaction}
        onClick={mockOnClick}
        showFullHash={true}
      />
    );

    expect(screen.getByText(/TX:/).textContent).toContain(mockTransaction.tx_hash);
  });

  it('calls onClick when clicked', () => {
    render(
      <TransactionCard
        transaction={mockTransaction}
        onClick={mockOnClick}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Enter key is pressed', () => {
    render(
      <TransactionCard
        transaction={mockTransaction}
        onClick={mockOnClick}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Space key is pressed', () => {
    render(
      <TransactionCard
        transaction={mockTransaction}
        onClick={mockOnClick}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: ' ' });
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick for other keys', () => {
    render(
      <TransactionCard
        transaction={mockTransaction}
        onClick={mockOnClick}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Tab' });
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('renders as article when onClick is not provided', () => {
    render(
      <TransactionCard
        transaction={mockTransaction}
      />
    );

    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not have cursor-pointer class when onClick is not provided', () => {
    const { container } = render(
      <TransactionCard
        transaction={mockTransaction}
      />
    );

    const card = container.firstChild as HTMLElement;
    expect(card).not.toHaveClass('cursor-pointer');
    expect(card).not.toHaveClass('hover:shadow-lg');
  });

  it('applies custom className', () => {
    const { container } = render(
      <TransactionCard
        transaction={mockTransaction}
        onClick={mockOnClick}
        className="custom-class"
      />
    );

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('custom-class');
  });

  it('uses custom aria-label', () => {
    render(
      <TransactionCard
        transaction={mockTransaction}
        onClick={mockOnClick}
        ariaLabel="Custom transaction label"
      />
    );

    expect(screen.getByLabelText('Custom transaction label')).toBeInTheDocument();
  });

  it('shows source and destination when available', () => {
    render(
      <TransactionCard
        transaction={mockTransaction}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('From:')).toBeInTheDocument();
    expect(screen.getByText(/bc1qsour.../)).toBeInTheDocument();
    expect(screen.getByText('To:')).toBeInTheDocument();
    expect(screen.getByText(/bc1qdest.../)).toBeInTheDocument();
  });

  it('does not show destination when same as source', () => {
    const txSameAddress: Transaction = {
      ...mockTransaction,
      destination: mockTransaction.source
    };

    render(
      <TransactionCard
        transaction={txSameAddress}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('From:')).toBeInTheDocument();
    expect(screen.queryByText('To:')).not.toBeInTheDocument();
  });

  it('has proper date title attribute for confirmed transactions', () => {
    render(
      <TransactionCard
        transaction={mockTransaction}
        onClick={mockOnClick}
      />
    );

    const timeElement = screen.getByText(/minutes ago/);
    expect(timeElement).toHaveAttribute('title');
    expect(timeElement.getAttribute('title')).toContain('2023');
  });

  it('has proper title attribute for pending transactions', () => {
    render(
      <TransactionCard
        transaction={mockPendingTransaction}
        onClick={mockOnClick}
      />
    );

    const timeElement = screen.getByText('Mempool');
    expect(timeElement).toHaveAttribute('title', 'Unconfirmed');
  });
});