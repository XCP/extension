import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AddressHeader } from '../address-header';

// Mock dependencies
const mockSetAddressHeader = vi.fn();
const mockSubheadings = {
  addresses: {} as Record<string, { walletName?: string; formatted?: string }>
};

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    subheadings: mockSubheadings,
    setAddressHeader: mockSetAddressHeader
  })
}));

vi.mock('@/utils/format', () => ({
  formatAddress: vi.fn((address, useFullAddress) => {
    if (useFullAddress) {
      return address;
    }
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
  })
}));

// Mock the logo import
vi.mock('@/assets/logo.png', () => ({
  default: 'mocked-logo-path.png'
}));

describe('AddressHeader', () => {
  const mockAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock subheadings
    Object.keys(mockSubheadings.addresses).forEach(key => {
      delete mockSubheadings.addresses[key];
    });
  });

  it('should render address information', () => {
    render(<AddressHeader address={mockAddress} />);
    
    expect(screen.getByText(mockAddress)).toBeInTheDocument();
  });

  it('should render wallet name when provided', () => {
    render(<AddressHeader address={mockAddress} walletName="My Wallet" />);
    
    expect(screen.getByText('My Wallet')).toBeInTheDocument();
  });

  it('should not render wallet name when not provided', () => {
    render(<AddressHeader address={mockAddress} />);
    
    expect(screen.queryByText('My Wallet')).not.toBeInTheDocument();
  });

  it('should render logo with correct attributes', () => {
    render(<AddressHeader address={mockAddress} />);
    
    const logo = screen.getByAltText('XCP Wallet');
    expect(logo).toHaveAttribute('src', 'mocked-logo-path.png');
    expect(logo).toHaveClass('size-12');
    expect(logo).toHaveClass('mr-4');
    expect(logo).toHaveClass('rounded-full');
  });

  it('should apply custom className', () => {
    render(<AddressHeader address={mockAddress} className="custom-class" />);
    
    const container = screen.getByAltText('XCP Wallet').closest('.flex');
    expect(container).toHaveClass('custom-class');
  });

  it('should format address correctly', () => {
    render(<AddressHeader address={mockAddress} />);
    
    // formatAddress is mocked to return full address when useFullAddress is true
    expect(screen.getByText(mockAddress)).toBeInTheDocument();
  });

  it('should update cache when props change', () => {
    const { rerender } = render(<AddressHeader address={mockAddress} />);
    
    expect(mockSetAddressHeader).toHaveBeenCalledWith(mockAddress, undefined);
    
    rerender(<AddressHeader address={mockAddress} walletName="New Wallet" />);
    
    expect(mockSetAddressHeader).toHaveBeenCalledWith(mockAddress, 'New Wallet');
  });

  it('should use cached data when available', () => {
    mockSubheadings.addresses[mockAddress] = {
      walletName: 'Cached Wallet',
      formatted: 'bc1qxy...0wlh'
    };
    
    render(<AddressHeader address={mockAddress} />);
    
    expect(screen.getByText('Cached Wallet')).toBeInTheDocument();
    expect(screen.getByText('bc1qxy...0wlh')).toBeInTheDocument();
  });

  it('should not update cache when data is unchanged', () => {
    mockSubheadings.addresses[mockAddress] = {
      walletName: 'Same Wallet'
    };
    
    render(<AddressHeader address={mockAddress} walletName="Same Wallet" />);
    
    expect(mockSetAddressHeader).not.toHaveBeenCalled();
  });

  it('should prefer props walletName over cached when both exist', () => {
    mockSubheadings.addresses[mockAddress] = {
      walletName: 'Cached Wallet'
    };
    
    render(<AddressHeader address={mockAddress} walletName="Props Wallet" />);
    
    expect(screen.getByText('Props Wallet')).toBeInTheDocument();
  });

  it('should use cached walletName when props walletName is undefined', () => {
    mockSubheadings.addresses[mockAddress] = {
      walletName: 'Cached Wallet'
    };
    
    render(<AddressHeader address={mockAddress} />);
    
    expect(screen.getByText('Cached Wallet')).toBeInTheDocument();
  });

  it('should apply correct CSS classes', () => {
    render(<AddressHeader address={mockAddress} />);
    
    const container = screen.getByAltText('XCP Wallet').closest('.flex');
    expect(container).toHaveClass('flex');
    expect(container).toHaveClass('items-center');
  });

  it('should apply correct typography classes', () => {
    render(<AddressHeader address={mockAddress} walletName="Test Wallet" />);
    
    const walletName = screen.getByText('Test Wallet');
    expect(walletName).toHaveClass('text-sm');
    expect(walletName).toHaveClass('text-gray-600');
    
    const address = screen.getByText(mockAddress);
    expect(address).toHaveClass('text-xl');
    expect(address).toHaveClass('font-bold');
  });

  it('should handle different address formats', () => {
    const legacyAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    
    render(<AddressHeader address={legacyAddress} />);
    
    expect(screen.getByText(legacyAddress)).toBeInTheDocument();
  });

  it('should handle empty address gracefully', () => {
    render(<AddressHeader address="" />);
    
    // Should still render without errors
    expect(screen.getByAltText('XCP Wallet')).toBeInTheDocument();
  });

  it('should handle empty wallet name gracefully', () => {
    render(<AddressHeader address={mockAddress} walletName="" />);
    
    // Empty wallet name should not render the p element with wallet name
    const container = screen.getByAltText('XCP Wallet').parentElement;
    const paragraphs = container?.querySelectorAll('p.text-sm.text-gray-600');
    expect(paragraphs?.length).toBe(0);
  });

  it('should update when switching between addresses', () => {
    const { rerender } = render(<AddressHeader address={mockAddress} />);
    
    expect(screen.getByText(mockAddress)).toBeInTheDocument();
    
    const differentAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
    
    rerender(<AddressHeader address={differentAddress} />);
    
    expect(screen.getByText(differentAddress)).toBeInTheDocument();
    expect(mockSetAddressHeader).toHaveBeenCalledWith(differentAddress, undefined);
  });

  it('should handle wallet name changes correctly', () => {
    const { rerender } = render(<AddressHeader address={mockAddress} walletName="Wallet 1" />);
    
    expect(screen.getByText('Wallet 1')).toBeInTheDocument();
    
    rerender(<AddressHeader address={mockAddress} walletName="Wallet 2" />);
    
    expect(screen.getByText('Wallet 2')).toBeInTheDocument();
    expect(mockSetAddressHeader).toHaveBeenCalledWith(mockAddress, 'Wallet 2');
  });

  it('should use formatted address from cache when available', () => {
    mockSubheadings.addresses[mockAddress] = {
      formatted: 'Custom Formatted Address'
    };
    
    render(<AddressHeader address={mockAddress} />);
    
    expect(screen.getByText('Custom Formatted Address')).toBeInTheDocument();
  });

  it('should format address when cache is not available', () => {
    render(<AddressHeader address={mockAddress} />);
    
    // Should call formatAddress and display the result
    expect(screen.getByText(mockAddress)).toBeInTheDocument();
  });

  it('should handle undefined walletName in cache', () => {
    mockSubheadings.addresses[mockAddress] = {
      walletName: undefined,
      formatted: 'bc1q...test'
    };
    
    render(<AddressHeader address={mockAddress} />);
    
    // Should not render wallet name paragraph
    const container = screen.getByAltText('XCP Wallet').parentElement;
    const paragraphs = container?.querySelectorAll('p');
    expect(paragraphs?.length).toBe(0);
  });

  it('should handle cache with only formatted address', () => {
    mockSubheadings.addresses[mockAddress] = {
      formatted: 'Formatted Only'
    };
    
    render(<AddressHeader address={mockAddress} walletName="New Name" />);
    
    expect(screen.getByText('New Name')).toBeInTheDocument();
    expect(screen.getByText('Formatted Only')).toBeInTheDocument();
  });

  it('should handle cache miss correctly', () => {
    // Ensure cache is empty for this address
    delete mockSubheadings.addresses[mockAddress];
    
    render(<AddressHeader address={mockAddress} walletName="Test Wallet" />);
    
    // Should set cache for new address
    expect(mockSetAddressHeader).toHaveBeenCalledWith(mockAddress, 'Test Wallet');
    
    // Should display the provided data
    expect(screen.getByText('Test Wallet')).toBeInTheDocument();
    expect(screen.getByText(mockAddress)).toBeInTheDocument();
  });

  it('should handle very long addresses', () => {
    const longAddress = 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3';
    
    render(<AddressHeader address={longAddress} />);
    
    expect(screen.getByText(longAddress)).toBeInTheDocument();
  });

  it('should handle very long wallet names', () => {
    const longWalletName = 'This is a very long wallet name that should still render correctly';
    
    render(<AddressHeader address={mockAddress} walletName={longWalletName} />);
    
    expect(screen.getByText(longWalletName)).toBeInTheDocument();
  });

  it('should maintain layout structure', () => {
    render(<AddressHeader address={mockAddress} walletName="Test" />);
    
    const logo = screen.getByAltText('XCP Wallet');
    const container = logo.parentElement;
    
    expect(container).toHaveClass('flex');
    
    const textContainer = container?.querySelector('div');
    expect(textContainer).toBeInTheDocument();
    
    const walletNameP = textContainer?.querySelector('p');
    expect(walletNameP).toHaveTextContent('Test');
    
    const addressH2 = textContainer?.querySelector('h2');
    expect(addressH2).toHaveTextContent(mockAddress);
  });
});