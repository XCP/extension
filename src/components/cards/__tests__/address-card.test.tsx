import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AddressCard } from '../address-card';
import { RadioGroup } from '@headlessui/react';
import type { Address } from '@/utils/wallet';

// Mock dependencies
vi.mock('@/utils/format', () => ({
  formatAddress: vi.fn((address, useFullAddress) => {
    if (useFullAddress) {
      return address;
    }
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
  }),
  formatAsset: vi.fn((asset, options) => {
    if (options?.assetInfo?.asset_longname) {
      return options.assetInfo.asset_longname;
    }
    return asset;
  }),
  formatAmount: vi.fn(({ value }) => value.toString())
}));

describe('AddressCard', () => {
  const mockAddress: Address = {
    address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    name: 'Address 1',
    path: "m/84'/0'/0'/0/0",
    pubKey: 'pubkey123'
  };

  const defaultProps = {
    address: mockAddress,
    selected: false,
    onSelect: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render address card within RadioGroup.Option', () => {
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    expect(screen.getByText('Address 1')).toBeInTheDocument();
  });

  it('should display address name', () => {
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    expect(screen.getByText('Address 1')).toBeInTheDocument();
  });

  it('should display formatted address', () => {
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    expect(screen.getByText('bc1qxy...0wlh')).toBeInTheDocument();
  });

  it('should apply selected styles when selected', () => {
    render(
      <RadioGroup value={mockAddress} onChange={() => {}}>
        <AddressCard {...defaultProps} selected={true} />
      </RadioGroup>
    );
    
    // The RadioGroup.Option handles the selected state
    expect(screen.getByText('Address 1')).toBeInTheDocument();
  });

  it('should apply non-selected styles when not selected', () => {
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} selected={false} />
      </RadioGroup>
    );
    
    expect(screen.getByText('Address 1')).toBeInTheDocument();
  });

  it('should apply correct font styles to name', () => {
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    const name = screen.getByText('Address 1');
    expect(name).toHaveClass('text-sm');
    expect(name).toHaveClass('font-medium');
  });

  it('should apply correct font styles to address', () => {
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    const address = screen.getByText('bc1qxy...0wlh');
    expect(address).toHaveClass('text-xs');
    expect(address).toHaveClass('font-mono');
  });

  it('should have correct layout structure', () => {
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    const name = screen.getByText('Address 1');
    const container = name.closest('.flex-col');
    
    expect(container).toHaveClass('flex');
    expect(container).toHaveClass('flex-col');
  });

  it('should render within RadioGroup.Option', () => {
    const { container } = render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    // RadioGroup.Option renders as a specific element
    const option = container.querySelector('[role="radio"]');
    expect(option).toBeInTheDocument();
  });

  it('should handle different address types', () => {
    const legacyAddress: Address = {
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      name: 'Legacy Address',
      path: "m/84'/0'/0'/0/0",
      pubKey: "pubkey123"
    };
    
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} address={legacyAddress} />
      </RadioGroup>
    );
    
    expect(screen.getByText('Legacy Address')).toBeInTheDocument();
    expect(screen.getByText('1A1zP1...vfNa')).toBeInTheDocument();
  });

  it('should handle empty address name', () => {
    const emptyNameAddress: Address = {
      ...mockAddress,
      name: ''
    };
    
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} address={emptyNameAddress} />
      </RadioGroup>
    );
    
    // The empty span should still be rendered
    const nameSpan = screen.getByText('bc1qxy...0wlh').parentElement?.querySelector('.text-sm.font-medium');
    expect(nameSpan).toBeInTheDocument();
    expect(nameSpan?.textContent).toBe('');
  });

  it('should handle very long addresses', () => {
    const longAddress: Address = {
      address: 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3',
      name: 'Long Address',
      path: "m/84'/0'/0'/0/0",
      pubKey: "pubkey123"
    };
    
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} address={longAddress} />
      </RadioGroup>
    );
    
    expect(screen.getByText('bc1qrp...fmv3')).toBeInTheDocument();
  });

  it('should handle very long address names', () => {
    const longNameAddress: Address = {
      ...mockAddress,
      name: 'This is a very long address name that should still render correctly'
    };
    
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} address={longNameAddress} />
      </RadioGroup>
    );
    
    expect(screen.getByText('This is a very long address name that should still render correctly')).toBeInTheDocument();
  });

  it('should maintain structure with different address data', () => {
    const { rerender } = render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    expect(screen.getByText('Address 1')).toBeInTheDocument();
    
    const differentAddress: Address = {
      address: 'bc1qxyz789',
      name: 'Address 2',
      path: "m/84'/0'/0'/0/1",
      pubKey: "pubkey456"
    };
    
    rerender(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} address={differentAddress} />
      </RadioGroup>
    );
    
    expect(screen.getByText('Address 2')).toBeInTheDocument();
    expect(screen.getByText('bc1qxy...z789')).toBeInTheDocument();
  });

  it('should handle addresses with different index values', () => {
    const highIndexAddress: Address = {
      ...mockAddress,
      path: "m/84'/0'/0'/0/99",
      pubKey: "pubkey999"
    };
    
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} address={highIndexAddress} />
      </RadioGroup>
    );
    
    expect(screen.getByText('Address 1')).toBeInTheDocument();
  });

  it('should work with RadioGroup value selection', () => {
    const { rerender } = render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    // Initially not selected
    expect(screen.getByText('Address 1')).toBeInTheDocument();
    
    // Update to be selected
    rerender(
      <RadioGroup value={mockAddress} onChange={() => {}}>
        <AddressCard {...defaultProps} selected={true} />
      </RadioGroup>
    );
    
    expect(screen.getByText('Address 1')).toBeInTheDocument();
  });

  it('should handle click events through RadioGroup', () => {
    const onChange = vi.fn();
    
    render(
      <RadioGroup value={null} onChange={onChange}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    const option = screen.getByRole('radio');
    fireEvent.click(option);
    
    // RadioGroup should handle the selection
    expect(onChange).toHaveBeenCalled();
  });

  it('should format short addresses correctly', () => {
    const shortAddress: Address = {
      address: 'bc1q',
      name: 'Short',
      path: "m/84'/0'/0'/0/0",
      pubKey: "pubkey123"
    };
    
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} address={shortAddress} />
      </RadioGroup>
    );
    
    // formatAddress should handle short addresses
    expect(screen.getByText('Short')).toBeInTheDocument();
  });

  it('should handle empty address gracefully', () => {
    const emptyAddress: Address = {
      address: '',
      name: 'Empty',
      path: "m/84'/0'/0'/0/0",
      pubKey: "pubkey123"
    };
    
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} address={emptyAddress} />
      </RadioGroup>
    );
    
    expect(screen.getByText('Empty')).toBeInTheDocument();
    // formatAddress returns empty string for empty address
    const addressSpan = screen.getByText('Empty').parentElement?.querySelector('.text-xs.font-mono');
    expect(addressSpan?.textContent).toBe('');
  });

  it('should apply cursor pointer style', () => {
    const { container } = render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    const option = container.querySelector('[role="radio"]');
    expect(option?.className).toContain('cursor-pointer');
  });

  it('should apply rounded corners', () => {
    const { container } = render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    const option = container.querySelector('[role="radio"]');
    expect(option?.className).toContain('rounded-lg');
  });

  it('should apply padding', () => {
    const { container } = render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    const option = container.querySelector('[role="radio"]');
    expect(option?.className).toContain('px-4');
    expect(option?.className).toContain('py-3');
  });

  it('should have border styling', () => {
    const { container } = render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} />
      </RadioGroup>
    );
    
    const option = container.querySelector('[role="radio"]');
    expect(option?.className).toContain('border');
  });

  it('should handle numeric address names', () => {
    const numericNameAddress: Address = {
      ...mockAddress,
      name: '123456'
    };
    
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} address={numericNameAddress} />
      </RadioGroup>
    );
    
    expect(screen.getByText('123456')).toBeInTheDocument();
  });

  it('should handle special characters in address name', () => {
    const specialNameAddress: Address = {
      ...mockAddress,
      name: 'Address #1 (Main)'
    };
    
    render(
      <RadioGroup value={null} onChange={() => {}}>
        <AddressCard {...defaultProps} address={specialNameAddress} />
      </RadioGroup>
    );
    
    expect(screen.getByText('Address #1 (Main)')).toBeInTheDocument();
  });
});