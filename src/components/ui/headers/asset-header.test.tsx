import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AssetHeader } from './asset-header';
import type { AssetInfo } from '@/utils/blockchain/counterparty/api';

// Mock dependencies
const mockSetAssetHeader = vi.fn();
const mockSubheadings = {
  assets: {} as Record<string, AssetInfo>
};

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    subheadings: mockSubheadings,
    setAssetHeader: mockSetAssetHeader
  })
}));

vi.mock('@/components/domain/asset/asset-icon', () => ({
  AssetIcon: ({ asset, size, className }: any) => (
    <div data-testid="asset-icon" className={className}>
      {asset} Icon ({size})
    </div>
  )
}));

vi.mock('@/utils/format', () => ({
  formatAmount: vi.fn(({ value, minimumFractionDigits, maximumFractionDigits, useGrouping }) => {
    if (minimumFractionDigits === 8) {
      return value.toFixed(8);
    }
    return value.toLocaleString();
  })
}));

vi.mock('@/utils/numeric', () => ({
  fromSatoshis: vi.fn((value, options) => {
    const numValue = typeof value === 'string' ? parseInt(value) : value;
    const result = numValue / 100000000;
    return options?.asNumber ? result : result.toString();
  })
}));

describe('AssetHeader', () => {
  const mockAssetInfo: AssetInfo = {
    asset: 'PEPECASH',
    asset_longname: null,
    description: 'Rare Pepe Cash',
    issuer: 'bc1qxyz789',
    divisible: true,
    locked: true,
    supply: '1000000000000',
    supply_normalized: '10000.00000000'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock subheadings
    Object.keys(mockSubheadings.assets).forEach(key => {
      delete mockSubheadings.assets[key];
    });
  });

  it('should render asset information', () => {
    render(<AssetHeader assetInfo={mockAssetInfo} />);
    
    expect(screen.getByText('PEPECASH')).toBeInTheDocument();
    expect(screen.getByText(/Supply:/)).toBeInTheDocument();
  });

  it('should display asset name when no longname', () => {
    render(<AssetHeader assetInfo={mockAssetInfo} />);
    
    expect(screen.getByText('PEPECASH')).toBeInTheDocument();
  });

  it('should display asset longname when available', () => {
    const assetWithLongname = {
      ...mockAssetInfo,
      asset_longname: 'A12345678901234567890'
    };
    
    render(<AssetHeader assetInfo={assetWithLongname} />);
    
    expect(screen.getByText('A12345678901234567890')).toBeInTheDocument();
  });

  it('should render asset icon with correct URL', () => {
    render(<AssetHeader assetInfo={mockAssetInfo} />);
    
    const icon = screen.getByTestId('asset-icon');
    expect(icon).toHaveTextContent('PEPECASH Icon (lg)');
  });

  it('should apply custom className', () => {
    render(<AssetHeader assetInfo={mockAssetInfo} className="custom-class" />);
    
    const container = screen.getByTestId('asset-icon').closest('.flex');
    expect(container).toHaveClass('custom-class');
  });

  it('should format supply for divisible assets', () => {
    render(<AssetHeader assetInfo={mockAssetInfo} />);
    
    // Divisible assets divide supply by 10^8
    // 1000000000000 / 100000000 = 10000
    expect(screen.getByText(/10000\.00000000/)).toBeInTheDocument();
  });

  it('should format supply for indivisible assets', () => {
    const indivisibleAsset = {
      ...mockAssetInfo,
      divisible: false,
      supply: '1000'
    };
    
    render(<AssetHeader assetInfo={indivisibleAsset} />);
    
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
  });

  it('should handle zero supply', () => {
    const zeroSupplyAsset = {
      ...mockAssetInfo,
      supply: 0
    };
    
    render(<AssetHeader assetInfo={zeroSupplyAsset} />);
    
    expect(screen.getByText(/0\.00000000/)).toBeInTheDocument();
  });

  it('should handle undefined supply', () => {
    const noSupplyAsset = {
      ...mockAssetInfo,
      supply: undefined
    };
    
    render(<AssetHeader assetInfo={noSupplyAsset} />);
    
    // Should default to 0
    expect(screen.getByText(/0\.00000000/)).toBeInTheDocument();
  });

  it('should handle string supply', () => {
    const stringSupplyAsset = {
      ...mockAssetInfo,
      supply: '5000000'
    };
    
    render(<AssetHeader assetInfo={stringSupplyAsset} />);
    
    // Divisible assets divide supply by 10^8
    // 5000000 / 100000000 = 0.05
    expect(screen.getByText(/0\.05000000/)).toBeInTheDocument();
  });

  it('should update cache when asset info changes', () => {
    const { rerender } = render(<AssetHeader assetInfo={mockAssetInfo} />);
    
    expect(mockSetAssetHeader).toHaveBeenCalledWith('PEPECASH', mockAssetInfo);
    
    const updatedAssetInfo = {
      ...mockAssetInfo,
      supply: '2000000000000'
    };
    
    rerender(<AssetHeader assetInfo={updatedAssetInfo} />);
    
    expect(mockSetAssetHeader).toHaveBeenCalledWith('PEPECASH', updatedAssetInfo);
  });

  it('should use cached data when available', () => {
    const cachedData: AssetInfo = {
      ...mockAssetInfo,
      supply: '999999999'
    };
    
    mockSubheadings.assets['PEPECASH'] = cachedData;
    
    render(<AssetHeader assetInfo={mockAssetInfo} />);
    
    // Should display cached supply instead of prop supply
    // Divisible assets divide supply by 10^8
    // 999999999 / 100000000 = 9.99999999
    expect(screen.getByText(/9\.99999999/)).toBeInTheDocument();
  });

  it('should not update cache when data is unchanged', () => {
    mockSubheadings.assets['PEPECASH'] = mockAssetInfo;
    
    render(<AssetHeader assetInfo={mockAssetInfo} />);
    
    expect(mockSetAssetHeader).not.toHaveBeenCalled();
  });

  it('should apply correct CSS classes', () => {
    render(<AssetHeader assetInfo={mockAssetInfo} />);
    
    const container = screen.getByTestId('asset-icon').closest('.flex');
    expect(container).toHaveClass('flex');
    expect(container).toHaveClass('items-center');
    
    // Check that the AssetIcon mock has the mr-4 class
    const icon = screen.getByTestId('asset-icon');
    expect(icon).toHaveTextContent('PEPECASH Icon (lg)');
    expect(icon).toHaveClass('mr-4');
  });

  it('should apply correct typography classes', () => {
    render(<AssetHeader assetInfo={mockAssetInfo} />);
    
    const heading = screen.getByRole('heading', { name: 'PEPECASH' });
    expect(heading).toHaveClass('text-xl');
    expect(heading).toHaveClass('font-bold');
    expect(heading).toHaveClass('break-all');
    
    const supply = screen.getByText(/Supply:/);
    expect(supply).toHaveClass('text-gray-600');
    expect(supply).toHaveClass('text-sm');
  });

  it('should handle very long asset names', () => {
    const longNameAsset = {
      ...mockAssetInfo,
      asset: 'VERYLONGASSETNAMETHATSHOULDBREAK'
    };
    
    render(<AssetHeader assetInfo={longNameAsset} />);
    
    const heading = screen.getByText('VERYLONGASSETNAMETHATSHOULDBREAK');
    expect(heading).toHaveClass('break-all');
  });

  it('should handle assets without optional fields', () => {
    const minimalAsset: AssetInfo = {
      asset: 'BTC',
      asset_longname: null,
      divisible: false,
      locked: false,
      supply_normalized: '0'
    };
    
    render(<AssetHeader assetInfo={minimalAsset} />);
    
    // Use getByRole to get the heading specifically
    expect(screen.getByRole('heading', { name: 'BTC' })).toBeInTheDocument();
    expect(screen.getByText(/Supply: 0/)).toBeInTheDocument();
  });

  it('should render with all optional fields', () => {
    const fullAsset: AssetInfo = {
      asset: 'TESTASSET',
      asset_longname: 'A.TESTASSET',
      description: 'Test Asset Description',
      issuer: 'bc1qissuer123',
      divisible: true,
      locked: true,
      supply: 21000000,
      supply_normalized: '0.21'
    };
    
    render(<AssetHeader assetInfo={fullAsset} />);
    
    expect(screen.getByText('A.TESTASSET')).toBeInTheDocument();
    // Divisible assets divide supply by 10^8
    // 21000000 / 100000000 = 0.21
    expect(screen.getByText(/0\.21000000/)).toBeInTheDocument();
  });

  it('should update when switching between assets', () => {
    const { rerender } = render(<AssetHeader assetInfo={mockAssetInfo} />);
    
    expect(screen.getByTestId('asset-icon')).toHaveTextContent('PEPECASH Icon (lg)');
    
    const differentAsset: AssetInfo = {
      asset: 'XCP',
      asset_longname: null,
      divisible: true,
      locked: true,
      supply: '2600000000000000',
      supply_normalized: '26000000'
    };
    
    rerender(<AssetHeader assetInfo={differentAsset} />);
    
    expect(screen.getByTestId('asset-icon')).toHaveTextContent('XCP Icon (lg)');
    expect(mockSetAssetHeader).toHaveBeenCalledWith('XCP', differentAsset);
  });

  it('should handle numeric supply conversion', () => {
    const numericSupplyAsset = {
      ...mockAssetInfo,
      supply: 123456.789
    };
    
    render(<AssetHeader assetInfo={numericSupplyAsset} />);
    
    // Divisible assets divide supply by 10^8
    // 123456.789 / 100000000 = 0.00123457 (rounded)
    expect(screen.getByText(/0\.00123457/)).toBeInTheDocument();
  });

  it('should handle large supply numbers', () => {
    const largeSupplyAsset = {
      ...mockAssetInfo,
      supply: '9999999999999999999999'
    };
    
    render(<AssetHeader assetInfo={largeSupplyAsset} />);
    
    // Large numbers may be displayed in scientific notation (1e+22)
    const supplyText = screen.getByText(/Supply:/);
    expect(supplyText.textContent).toContain('Supply:');
    // The actual format depends on the formatAmount implementation
    expect(supplyText).toBeInTheDocument();
  });

  it('should compare cached data correctly with JSON.stringify', () => {
    const initialAsset: AssetInfo = {
      asset: 'TEST',
      asset_longname: null,
      divisible: true,
      locked: false,
      supply: 1000,
      supply_normalized: '0.00001'
    };
    
    mockSubheadings.assets['TEST'] = { ...initialAsset };
    
    const { rerender } = render(<AssetHeader assetInfo={initialAsset} />);
    
    // Should not call setAssetHeader since cached data matches
    expect(mockSetAssetHeader).not.toHaveBeenCalled();
    
    // Change a property
    const updatedAsset = { ...initialAsset, locked: true };
    
    rerender(<AssetHeader assetInfo={updatedAsset} />);
    
    // Should call setAssetHeader since cached data differs
    expect(mockSetAssetHeader).toHaveBeenCalledWith('TEST', updatedAsset);
  });

  it('should handle cache miss correctly', () => {
    // Ensure cache is empty for this asset
    delete mockSubheadings.assets['NEWASSET'];
    
    const newAsset: AssetInfo = {
      asset: 'NEWASSET',
      asset_longname: null,
      divisible: false,
      locked: false,
      supply: 500,
      supply_normalized: '500'
    };
    
    render(<AssetHeader assetInfo={newAsset} />);
    
    // Should set cache for new asset
    expect(mockSetAssetHeader).toHaveBeenCalledWith('NEWASSET', newAsset);
    
    // Should display the provided data
    expect(screen.getByText('NEWASSET')).toBeInTheDocument();
  });

  it('should handle empty asset name gracefully', () => {
    const emptyNameAsset = {
      ...mockAssetInfo,
      asset: '',
      asset_longname: ''
    };
    
    render(<AssetHeader assetInfo={emptyNameAsset} />);
    
    // Should still render without errors
    const icon = screen.getByTestId('asset-icon');
    expect(icon).toHaveTextContent('Icon (lg)');
  });
});