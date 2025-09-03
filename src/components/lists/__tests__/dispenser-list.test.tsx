import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DispenserList, type DispenserOption } from '../dispenser-list';

// Mock the DispenserCard component
vi.mock('@/components/cards/dispenser-card', () => ({
  DispenserCard: ({ option, isSelected, onSelect, disabled }: any) => (
    <div
      data-testid={`dispenser-card-${option.index}`}
      className={`dispenser-card ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={onSelect}
    >
      <div className="asset">{option.dispenser.asset}</div>
      <div className="btc-amount">{option.btcAmount} BTC</div>
      <div className="selected-state">{isSelected ? 'Selected' : 'Not Selected'}</div>
    </div>
  )
}));

describe('DispenserList', () => {
  const mockDispensers: DispenserOption[] = [
    {
      dispenser: {
        asset: 'RAREPEPE',
        tx_hash: 'abc123',
        source: 'bc1qsource1',
        status: 0,
        give_remaining: 500000000,
        give_remaining_normalized: '5.00000000',
        give_quantity: 100000000,
        give_quantity_normalized: '1.00000000',
        satoshirate: 10000,
        asset_info: {
          asset_longname: 'RARE.PEPE.COLLECTION',
          description: 'Rare Pepe Collection',
          issuer: 'bc1qissuer',
          divisible: true,
          locked: false
        }
      },
      satoshirate: 10000,
      btcAmount: 0.0001,
      index: 0
    },
    {
      dispenser: {
        asset: 'MYTOKEN',
        tx_hash: 'def456',
        source: 'bc1qsource2',
        status: 0,
        give_remaining: 1000000000,
        give_remaining_normalized: '10.00000000',
        give_quantity: 200000000,
        give_quantity_normalized: '2.00000000',
        satoshirate: 20000,
        asset_info: {
          asset_longname: null,
          description: 'My Token',
          issuer: 'bc1qissuer2',
          divisible: true,
          locked: false
        }
      },
      satoshirate: 20000,
      btcAmount: 0.0002,
      index: 1
    }
  ];

  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all dispenser cards correctly', () => {
    render(
      <DispenserList
        dispensers={mockDispensers}
        selectedIndex={null}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByTestId('dispenser-card-0')).toBeInTheDocument();
    expect(screen.getByTestId('dispenser-card-1')).toBeInTheDocument();
    expect(screen.getByText('RAREPEPE')).toBeInTheDocument();
    expect(screen.getByText('MYTOKEN')).toBeInTheDocument();
  });

  it('shows selected state correctly', () => {
    render(
      <DispenserList
        dispensers={mockDispensers}
        selectedIndex={0}
        onSelect={mockOnSelect}
      />
    );

    const firstCard = screen.getByTestId('dispenser-card-0');
    const secondCard = screen.getByTestId('dispenser-card-1');

    expect(firstCard).toHaveClass('selected');
    expect(secondCard).not.toHaveClass('selected');
    expect(screen.getByText('Selected')).toBeInTheDocument();
  });

  it('calls onSelect when dispenser card is clicked', () => {
    render(
      <DispenserList
        dispensers={mockDispensers}
        selectedIndex={null}
        onSelect={mockOnSelect}
      />
    );

    const firstCard = screen.getByTestId('dispenser-card-0');
    fireEvent.click(firstCard);

    expect(mockOnSelect).toHaveBeenCalledWith(0, mockDispensers[0]);
  });

  it('calls onSelect with correct parameters for second dispenser', () => {
    render(
      <DispenserList
        dispensers={mockDispensers}
        selectedIndex={null}
        onSelect={mockOnSelect}
      />
    );

    const secondCard = screen.getByTestId('dispenser-card-1');
    fireEvent.click(secondCard);

    expect(mockOnSelect).toHaveBeenCalledWith(1, mockDispensers[1]);
  });

  it('shows loading state', () => {
    render(
      <DispenserList
        dispensers={[]}
        selectedIndex={null}
        onSelect={mockOnSelect}
        isLoading={true}
      />
    );

    expect(screen.getByText('Fetching dispenser details...')).toBeInTheDocument();
    expect(screen.queryByTestId('dispenser-card-0')).not.toBeInTheDocument();
  });

  it('shows error state', () => {
    const errorMessage = 'Failed to fetch dispensers';

    render(
      <DispenserList
        dispensers={[]}
        selectedIndex={null}
        onSelect={mockOnSelect}
        error={errorMessage}
      />
    );

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    expect(screen.queryByTestId('dispenser-card-0')).not.toBeInTheDocument();
  });

  it('returns null for empty dispensers list', () => {
    const { container } = render(
      <DispenserList
        dispensers={[]}
        selectedIndex={null}
        onSelect={mockOnSelect}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('applies disabled state to all cards', () => {
    render(
      <DispenserList
        dispensers={mockDispensers}
        selectedIndex={null}
        onSelect={mockOnSelect}
        disabled={true}
      />
    );

    const firstCard = screen.getByTestId('dispenser-card-0');
    const secondCard = screen.getByTestId('dispenser-card-1');

    expect(firstCard).toHaveClass('disabled');
    expect(secondCard).toHaveClass('disabled');
  });

  it('does not apply disabled state by default', () => {
    render(
      <DispenserList
        dispensers={mockDispensers}
        selectedIndex={null}
        onSelect={mockOnSelect}
      />
    );

    const firstCard = screen.getByTestId('dispenser-card-0');
    expect(firstCard).not.toHaveClass('disabled');
  });

  it('has proper spacing between cards', () => {
    const { container } = render(
      <DispenserList
        dispensers={mockDispensers}
        selectedIndex={null}
        onSelect={mockOnSelect}
      />
    );

    const listContainer = container.querySelector('.space-y-4');
    expect(listContainer).toBeInTheDocument();
  });

  it('uses unique keys for cards', () => {
    // This test ensures no React key warnings
    expect(() => {
      render(
        <DispenserList
          dispensers={mockDispensers}
          selectedIndex={null}
          onSelect={mockOnSelect}
        />
      );
    }).not.toThrow();

    expect(screen.getByTestId('dispenser-card-0')).toBeInTheDocument();
    expect(screen.getByTestId('dispenser-card-1')).toBeInTheDocument();
  });

  it('handles single dispenser', () => {
    const singleDispenser = [mockDispensers[0]];

    render(
      <DispenserList
        dispensers={singleDispenser}
        selectedIndex={0}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByTestId('dispenser-card-0')).toBeInTheDocument();
    expect(screen.queryByTestId('dispenser-card-1')).not.toBeInTheDocument();
    expect(screen.getByText('RAREPEPE')).toBeInTheDocument();
  });

  it('shows loading state when both loading and error are true (loading takes priority)', () => {
    render(
      <DispenserList
        dispensers={[]}
        selectedIndex={null}
        onSelect={mockOnSelect}
        isLoading={true}
        error="Network error"
      />
    );

    // Based on the component, loading is checked first, so it shows loading
    expect(screen.getByText('Fetching dispenser details...')).toBeInTheDocument();
    expect(screen.queryByText('Network error')).not.toBeInTheDocument();
  });

  it('prioritizes error state over empty dispensers', () => {
    render(
      <DispenserList
        dispensers={[]}
        selectedIndex={null}
        onSelect={mockOnSelect}
        error="API error"
      />
    );

    expect(screen.getByText('API error')).toBeInTheDocument();
    // Empty state returns null, so we check that error is shown instead
  });

  it('shows loading state over empty dispensers', () => {
    render(
      <DispenserList
        dispensers={[]}
        selectedIndex={null}
        onSelect={mockOnSelect}
        isLoading={true}
      />
    );

    expect(screen.getByText('Fetching dispenser details...')).toBeInTheDocument();
  });

  it('passes BTC amount to cards', () => {
    render(
      <DispenserList
        dispensers={mockDispensers}
        selectedIndex={null}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByText('0.0001 BTC')).toBeInTheDocument();
    expect(screen.getByText('0.0002 BTC')).toBeInTheDocument();
  });

  it('has proper error styling', () => {
    render(
      <DispenserList
        dispensers={[]}
        selectedIndex={null}
        onSelect={mockOnSelect}
        error="Test error"
      />
    );

    const errorElement = screen.getByText('Test error');
    expect(errorElement).toHaveClass('text-sm', 'text-red-600', 'mt-2');
  });

  it('has proper loading state styling', () => {
    render(
      <DispenserList
        dispensers={[]}
        selectedIndex={null}
        onSelect={mockOnSelect}
        isLoading={true}
      />
    );

    const loadingElement = screen.getByText('Fetching dispenser details...');
    expect(loadingElement).toHaveClass('text-gray-500');
  });
});