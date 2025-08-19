import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BalanceHeader } from '../balance-header';

// Mock dependencies
const mockSetBalanceHeader = vi.fn();

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    setBalanceHeader: mockSetBalanceHeader
  })
}));

vi.mock('@/utils/format', () => ({
  formatAmount: vi.fn(({ value, minimumFractionDigits, maximumFractionDigits, useGrouping }) => {
    if (minimumFractionDigits === 8) {
      return value.toFixed(8);
    }
    return value.toLocaleString();
  })
}));

describe('BalanceHeader', () => {
  const mockBalance = {
    asset: 'PEPECASH',
    asset_info: {
      asset_longname: null,
      description: 'Rare Pepe Cash',
      issuer: 'bc1qxyz789',
      divisible: true,
      locked: true,
      supply: '1000000000000'
    },
    quantity_normalized: '500000000'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render balance information', () => {
    render(<BalanceHeader balance={mockBalance} />);
    
    expect(screen.getByText('PEPECASH')).toBeInTheDocument();
    expect(screen.getByText(/Available:/)).toBeInTheDocument();
  });

  it('should display asset name when no longname', () => {
    render(<BalanceHeader balance={mockBalance} />);
    
    expect(screen.getByText('PEPECASH')).toBeInTheDocument();
  });

  it('should display asset longname when available', () => {
    const balanceWithLongname = {
      ...mockBalance,
      asset_info: {
        ...mockBalance.asset_info,
        asset_longname: 'A12345678901234567890'
      }
    };
    
    render(<BalanceHeader balance={balanceWithLongname} />);
    
    expect(screen.getByText('A12345678901234567890')).toBeInTheDocument();
  });

  it('should render asset icon with correct URL', () => {
    render(<BalanceHeader balance={mockBalance} />);
    
    const img = screen.getByAltText('PEPECASH');
    expect(img).toHaveAttribute('src', 'https://app.xcp.io/img/icon/PEPECASH');
  });

  it('should apply custom className', () => {
    render(<BalanceHeader balance={mockBalance} className="custom-class" />);
    
    const container = screen.getByAltText('PEPECASH').closest('.flex');
    expect(container).toHaveClass('custom-class');
  });

  it('should format balance for divisible assets', () => {
    render(<BalanceHeader balance={mockBalance} />);
    
    expect(screen.getByText(/500000000\.00000000/)).toBeInTheDocument();
  });

  it('should format balance for indivisible assets', () => {
    const indivisibleBalance = {
      ...mockBalance,
      asset_info: {
        ...mockBalance.asset_info,
        divisible: false
      },
      quantity_normalized: '1000'
    };
    
    render(<BalanceHeader balance={indivisibleBalance} />);
    
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
  });

  it('should handle zero balance', () => {
    const zeroBalance = {
      ...mockBalance,
      quantity_normalized: '0'
    };
    
    render(<BalanceHeader balance={zeroBalance} />);
    
    expect(screen.getByText(/0\.00000000/)).toBeInTheDocument();
  });

  it('should handle undefined quantity_normalized', () => {
    const noQuantityBalance = {
      ...mockBalance,
      quantity_normalized: undefined
    };
    
    render(<BalanceHeader balance={noQuantityBalance} />);
    
    expect(screen.getByText(/Available: 0/)).toBeInTheDocument();
  });

  it('should update cache when balance changes', () => {
    const { rerender } = render(<BalanceHeader balance={mockBalance} />);
    
    expect(mockSetBalanceHeader).toHaveBeenCalledWith('PEPECASH', mockBalance);
    
    const updatedBalance = {
      ...mockBalance,
      quantity_normalized: '600000000'
    };
    
    rerender(<BalanceHeader balance={updatedBalance} />);
    
    expect(mockSetBalanceHeader).toHaveBeenCalledWith('PEPECASH', updatedBalance);
  });

  it('should apply correct CSS classes', () => {
    render(<BalanceHeader balance={mockBalance} />);
    
    const container = screen.getByAltText('PEPECASH').closest('.flex');
    expect(container).toHaveClass('flex');
    expect(container).toHaveClass('items-center');
    
    const img = screen.getByAltText('PEPECASH');
    expect(img).toHaveClass('w-12');
    expect(img).toHaveClass('h-12');
    expect(img).toHaveClass('mr-4');
  });

  it('should apply correct typography classes', () => {
    render(<BalanceHeader balance={mockBalance} />);
    
    const heading = screen.getByText('PEPECASH');
    expect(heading).toHaveClass('font-bold');
    expect(heading).toHaveClass('break-all');
    
    const available = screen.getByText(/Available:/);
    expect(available).toHaveClass('text-sm');
    expect(available).toHaveClass('text-gray-600');
  });

  it('should apply text-xl for short asset names', () => {
    const shortNameBalance = {
      ...mockBalance,
      asset: 'XCP'
    };
    
    render(<BalanceHeader balance={shortNameBalance} />);
    
    const heading = screen.getByText('XCP');
    expect(heading).toHaveClass('text-xl');
  });

  it('should apply text-lg for medium asset names', () => {
    const mediumNameBalance = {
      ...mockBalance,
      asset: 'BITCOINPEPECASH'
    };
    
    render(<BalanceHeader balance={mediumNameBalance} />);
    
    const heading = screen.getByText('BITCOINPEPECASH');
    expect(heading).toHaveClass('text-lg');
  });

  it('should apply text-base for long asset names', () => {
    const longNameBalance = {
      ...mockBalance,
      asset: 'VERYLONGASSETNAME123'
    };
    
    render(<BalanceHeader balance={longNameBalance} />);
    
    const heading = screen.getByText('VERYLONGASSETNAME123');
    expect(heading).toHaveClass('text-base');
  });

  it('should apply text-sm for very long asset names', () => {
    const veryLongNameBalance = {
      ...mockBalance,
      asset: 'EXTREMELYLONGASSETNAMETHATISVERYLONG'
    };
    
    render(<BalanceHeader balance={veryLongNameBalance} />);
    
    const heading = screen.getByText('EXTREMELYLONGASSETNAMETHATISVERYLONG');
    expect(heading).toHaveClass('text-sm');
  });

  it('should apply text-lg for A-assets without longname', () => {
    const aAssetBalance = {
      ...mockBalance,
      asset: 'A12345678901234567890',
      asset_info: {
        ...mockBalance.asset_info,
        asset_longname: null
      }
    };
    
    render(<BalanceHeader balance={aAssetBalance} />);
    
    const heading = screen.getByText('A12345678901234567890');
    expect(heading).toHaveClass('text-lg');
  });

  it('should handle balance without asset_info', () => {
    const minimalBalance = {
      asset: 'BTC',
      quantity_normalized: '100000000'
    };
    
    render(<BalanceHeader balance={minimalBalance} />);
    
    expect(screen.getByText('BTC')).toBeInTheDocument();
    // Without asset_info, divisibility defaults to undefined, so formatAmount uses default
    expect(screen.getByText(/Available:/)).toBeInTheDocument();
  });

  it('should handle balance with partial asset_info', () => {
    const partialInfoBalance = {
      asset: 'TEST',
      asset_info: {
        asset_longname: null,
        divisible: true
      },
      quantity_normalized: '1000'
    };
    
    render(<BalanceHeader balance={partialInfoBalance} />);
    
    expect(screen.getByText('TEST')).toBeInTheDocument();
    expect(screen.getByText(/1000\.00000000/)).toBeInTheDocument();
  });

  it('should update when switching between balances', () => {
    const { rerender } = render(<BalanceHeader balance={mockBalance} />);
    
    expect(screen.getByAltText('PEPECASH')).toBeInTheDocument();
    
    const differentBalance = {
      asset: 'XCP',
      asset_info: {
        asset_longname: null,
        divisible: true
      },
      quantity_normalized: '2600000000000000'
    };
    
    rerender(<BalanceHeader balance={differentBalance} />);
    
    expect(screen.getByAltText('XCP')).toBeInTheDocument();
    expect(mockSetBalanceHeader).toHaveBeenCalledWith('XCP', differentBalance);
  });

  it('should handle numeric quantity_normalized', () => {
    const numericQuantityBalance = {
      ...mockBalance,
      quantity_normalized: '123456.789'
    };
    
    render(<BalanceHeader balance={numericQuantityBalance} />);
    
    expect(screen.getByText(/123456\.78900000/)).toBeInTheDocument();
  });

  it('should handle empty strings gracefully', () => {
    const emptyStringBalance = {
      ...mockBalance,
      quantity_normalized: ''
    };
    
    render(<BalanceHeader balance={emptyStringBalance} />);
    
    // Empty string results in "0" being displayed (no decimal places)
    expect(screen.getByText(/Available: 0/)).toBeInTheDocument();
  });

  it('should use props data as source of truth', () => {
    const initialBalance = {
      ...mockBalance,
      quantity_normalized: '100'
    };
    
    const { rerender } = render(<BalanceHeader balance={initialBalance} />);
    
    expect(screen.getByText(/100\.00000000/)).toBeInTheDocument();
    
    const updatedBalance = {
      ...mockBalance,
      quantity_normalized: '200'
    };
    
    rerender(<BalanceHeader balance={updatedBalance} />);
    
    expect(screen.getByText(/200\.00000000/)).toBeInTheDocument();
  });

  it('should handle very long longnames correctly', () => {
    const veryLongLongnameBalance = {
      ...mockBalance,
      asset_info: {
        ...mockBalance.asset_info,
        asset_longname: 'A.VERY.LONG.SUBASSET.NAME.THAT.IS.EXTREMELY.LONG'
      }
    };
    
    render(<BalanceHeader balance={veryLongLongnameBalance} />);
    
    const heading = screen.getByText('A.VERY.LONG.SUBASSET.NAME.THAT.IS.EXTREMELY.LONG');
    expect(heading).toHaveClass('text-sm'); // Should use smallest size for very long names
  });

  it('should handle edge case with exactly 12 character name', () => {
    const twelveCharBalance = {
      ...mockBalance,
      asset: '123456789012'
    };
    
    render(<BalanceHeader balance={twelveCharBalance} />);
    
    const heading = screen.getByText('123456789012');
    expect(heading).toHaveClass('text-xl'); // 12 chars or less gets text-xl
  });

  it('should handle edge case with exactly 18 character name', () => {
    const eighteenCharBalance = {
      ...mockBalance,
      asset: '123456789012345678'
    };
    
    render(<BalanceHeader balance={eighteenCharBalance} />);
    
    const heading = screen.getByText('123456789012345678');
    expect(heading).toHaveClass('text-lg'); // 13-18 chars gets text-lg
  });

  it('should handle edge case with exactly 21 character name', () => {
    const twentyOneCharBalance = {
      ...mockBalance,
      asset: '123456789012345678901'
    };
    
    render(<BalanceHeader balance={twentyOneCharBalance} />);
    
    const heading = screen.getByText('123456789012345678901');
    expect(heading).toHaveClass('text-base'); // 19-21 chars gets text-base
  });

  it('should handle empty asset name gracefully', () => {
    const emptyNameBalance = {
      ...mockBalance,
      asset: ''
    };
    
    render(<BalanceHeader balance={emptyNameBalance} />);
    
    // Should still render without errors
    const img = screen.getByAltText('');
    expect(img).toHaveAttribute('src', 'https://app.xcp.io/img/icon/');
  });

  it('should always call setBalanceHeader on mount and updates', () => {
    const { rerender } = render(<BalanceHeader balance={mockBalance} />);
    
    expect(mockSetBalanceHeader).toHaveBeenCalledTimes(1);
    expect(mockSetBalanceHeader).toHaveBeenCalledWith('PEPECASH', mockBalance);
    
    // Re-render with different balance
    const updatedBalance = {
      ...mockBalance,
      quantity_normalized: '999999'
    };
    rerender(<BalanceHeader balance={updatedBalance} />);
    
    // Should be called again with updated balance
    expect(mockSetBalanceHeader).toHaveBeenCalledTimes(2);
    expect(mockSetBalanceHeader).toHaveBeenLastCalledWith('PEPECASH', updatedBalance);
  });
});