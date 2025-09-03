import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DispenserCard, type DispenserOption } from '../dispenser-card';

// Mock the format and numeric utils
vi.mock('@/utils/format', () => ({
  formatAmount: ({ value, maximumFractionDigits = 8, minimumFractionDigits = 0 }: { 
    value: number; 
    maximumFractionDigits?: number; 
    minimumFractionDigits?: number; 
  }) => {
    return value.toFixed(maximumFractionDigits);
  }
}));

vi.mock('@/utils/numeric', () => ({
  divide: (a: string, b: string) => parseFloat((parseFloat(a) / parseFloat(b)).toString()),
  roundDown: (value: number) => Math.floor(value),
  toNumber: (value: number) => value
}));

describe('DispenserCard', () => {
  const mockDispenser: DispenserOption = {
    dispenser: {
      asset: 'RAREPEPE',
      tx_hash: 'abc123def456',
      source: 'bc1qsource123',
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
  };

  const mockDispenserWithoutLongname: DispenserOption = {
    ...mockDispenser,
    dispenser: {
      ...mockDispenser.dispenser,
      asset: 'MYTOKEN',
      asset_info: {
        ...mockDispenser.dispenser.asset_info!,
        asset_longname: null
      }
    }
  };

  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dispenser information correctly', () => {
    render(
      <DispenserCard
        option={mockDispenser}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByText('RARE.PEPE.COLLECTION')).toBeInTheDocument();
    expect(screen.getByText('0.00010000 BTC')).toBeInTheDocument();
    expect(screen.getByText('1.00000000 Per Dispense')).toBeInTheDocument();
    expect(screen.getByText('5 Remaining')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('shows asset name when longname is not available', () => {
    render(
      <DispenserCard
        option={mockDispenserWithoutLongname}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByText('MYTOKEN')).toBeInTheDocument();
  });

  it('displays correct asset icon', () => {
    render(
      <DispenserCard
        option={mockDispenser}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    const img = screen.getByAltText('RAREPEPE') as HTMLImageElement;
    expect(img.src).toBe('https://app.xcp.io/img/icon/RAREPEPE');
  });

  it('applies selected styles when selected', () => {
    const { container } = render(
      <DispenserCard
        option={mockDispenser}
        isSelected={true}
        onSelect={mockOnSelect}
      />
    );

    const label = container.querySelector('label');
    expect(label).toHaveClass('ring-2', 'ring-blue-500');
  });

  it('does not apply selected styles when not selected', () => {
    const { container } = render(
      <DispenserCard
        option={mockDispenser}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    const label = container.querySelector('label');
    expect(label).not.toHaveClass('ring-2', 'ring-blue-500');
  });

  it('calls onSelect when clicked', () => {
    render(
      <DispenserCard
        option={mockDispenser}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    const label = screen.getByRole('radio').closest('label') as HTMLLabelElement;
    fireEvent.click(label);
    expect(mockOnSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect when radio input changes', () => {
    render(
      <DispenserCard
        option={mockDispenser}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    const radio = screen.getByRole('radio');
    fireEvent.click(radio);
    expect(mockOnSelect).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    const { container } = render(
      <DispenserCard
        option={mockDispenser}
        isSelected={false}
        onSelect={mockOnSelect}
        disabled={true}
      />
    );

    const radio = screen.getByRole('radio');
    expect(radio).toBeDisabled();

    const label = container.querySelector('label');
    expect(label).toHaveClass('opacity-50', 'cursor-not-allowed');
  });

  it('is not disabled when disabled prop is false', () => {
    render(
      <DispenserCard
        option={mockDispenser}
        isSelected={false}
        onSelect={mockOnSelect}
        disabled={false}
      />
    );

    const radio = screen.getByRole('radio');
    expect(radio).not.toBeDisabled();
  });

  it('has proper radio input attributes', () => {
    render(
      <DispenserCard
        option={mockDispenser}
        isSelected={true}
        onSelect={mockOnSelect}
      />
    );

    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('id', 'dispenser-0');
    expect(radio).toHaveAttribute('name', 'selectedDispenserIndex');
    expect(radio).toHaveAttribute('value', '0');
    expect(radio).toBeChecked();
  });

  it('calculates remaining dispenses correctly', () => {
    const customDispenser: DispenserOption = {
      ...mockDispenser,
      dispenser: {
        ...mockDispenser.dispenser,
        give_remaining_normalized: '10.00000000',
        give_quantity_normalized: '2.00000000'
      }
    };

    render(
      <DispenserCard
        option={customDispenser}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByText('5 Remaining')).toBeInTheDocument();
  });

  it('has proper accessibility label', () => {
    render(
      <DispenserCard
        option={mockDispenser}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    // The label should be associated with the radio input via htmlFor/id
    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('id', 'dispenser-0');
    
    const label = screen.getByText('RARE.PEPE.COLLECTION').closest('label') as HTMLLabelElement;
    expect(label).toHaveAttribute('for', 'dispenser-0');
  });

  it('shows correct status indicator', () => {
    render(
      <DispenserCard
        option={mockDispenser}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    const status = screen.getByText('Open');
    expect(status).toHaveClass('text-green-600');
  });
});