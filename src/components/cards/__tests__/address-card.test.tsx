import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadioGroup } from '@headlessui/react';
import { AddressCard } from '../address-card';
import type { Address } from '@/types/wallet';

// Mock the format utils
vi.mock('@/utils/format', () => ({
  formatAddress: (address: string, shorten: boolean = true) => {
    if (shorten && address.length > 20) {
      return `${address.substring(0, 8)}...${address.substring(address.length - 8)}`;
    }
    return address;
  }
}));

// Test wrapper with RadioGroup context
const TestWrapper = ({ children, value, onChange }: { children: React.ReactNode, value: Address, onChange: (address: Address) => void }) => (
  <RadioGroup value={value} onChange={onChange}>
    {children}
  </RadioGroup>
);

describe('AddressCard', () => {
  const mockAddress: Address = {
    name: 'Main Address',
    address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    path: "m/84'/0'/0'/0/0",
    pubKey: 'mockpublickey'
  };

  const mockLongAddress: Address = {
    name: 'Long Address Name That Should Display Properly',
    address: 'bc1qverylongaddressthatshouldbeshortenedintheformatfunction123456789',
    path: "m/84'/0'/0'/0/1",
    pubKey: 'mockpublickey2'
  };

  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders address name and address correctly', () => {
    render(
      <TestWrapper value={mockAddress} onChange={mockOnSelect}>
        <AddressCard
          address={mockAddress}
          selected={false}
          onSelect={mockOnSelect}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Main Address')).toBeInTheDocument();
    expect(screen.getByText('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBeInTheDocument();
  });

  it('applies selected styles when selected', () => {
    const { container } = render(
      <TestWrapper value={mockAddress} onChange={mockOnSelect}>
        <AddressCard
          address={mockAddress}
          selected={true}
          onSelect={mockOnSelect}
        />
      </TestWrapper>
    );

    const cardElement = container.querySelector('.bg-blue-600');
    expect(cardElement).toBeInTheDocument();
    expect(cardElement).toHaveClass('text-white');
  });

  it('applies unselected styles when not selected', () => {
    const { container } = render(
      <TestWrapper value={mockAddress} onChange={mockOnSelect}>
        <AddressCard
          address={mockAddress}
          selected={false}
          onSelect={mockOnSelect}
        />
      </TestWrapper>
    );

    const cardElement = container.querySelector('.bg-white');
    expect(cardElement).toBeInTheDocument();
    expect(cardElement).toHaveClass('hover:bg-gray-100');
  });

  it('handles long address names properly', () => {
    render(
      <TestWrapper value={mockLongAddress} onChange={mockOnSelect}>
        <AddressCard
          address={mockLongAddress}
          selected={false}
          onSelect={mockOnSelect}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Long Address Name That Should Display Properly')).toBeInTheDocument();
  });

  it('formats long addresses with formatAddress function', () => {
    render(
      <TestWrapper value={mockLongAddress} onChange={mockOnSelect}>
        <AddressCard
          address={mockLongAddress}
          selected={false}
          onSelect={mockOnSelect}
        />
      </TestWrapper>
    );

    // The formatAddress is called with false parameter, so the long address is NOT shortened
    expect(screen.getByText('bc1qverylongaddressthatshouldbeshortenedintheformatfunction123456789')).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    const { container } = render(
      <TestWrapper value={mockAddress} onChange={mockOnSelect}>
        <AddressCard
          address={mockAddress}
          selected={false}
          onSelect={mockOnSelect}
        />
      </TestWrapper>
    );

    const radioOption = container.querySelector('[role="radio"]');
    expect(radioOption).toBeInTheDocument();
    expect(radioOption).toHaveAttribute('tabIndex');
  });

  it('responds to keyboard navigation', () => {
    const { container } = render(
      <TestWrapper value={mockAddress} onChange={mockOnSelect}>
        <AddressCard
          address={mockAddress}
          selected={false}
          onSelect={mockOnSelect}
        />
      </TestWrapper>
    );

    const radioOption = container.querySelector('[role="radio"]') as HTMLElement;
    expect(radioOption).toBeInTheDocument();
    
    fireEvent.keyDown(radioOption, { key: 'Enter' });
    // RadioGroup handles the selection internally
  });

  it('has focus styles when active', () => {
    const { container } = render(
      <TestWrapper value={mockAddress} onChange={mockOnSelect}>
        <AddressCard
          address={mockAddress}
          selected={false}
          onSelect={mockOnSelect}
        />
      </TestWrapper>
    );

    const cardElement = container.querySelector('.focus-visible\\:outline-none');
    expect(cardElement).toBeInTheDocument();
  });

  it('displays monospace font for address', () => {
    render(
      <TestWrapper value={mockAddress} onChange={mockOnSelect}>
        <AddressCard
          address={mockAddress}
          selected={false}
          onSelect={mockOnSelect}
        />
      </TestWrapper>
    );

    const addressElement = screen.getByText('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    expect(addressElement).toHaveClass('font-mono');
    expect(addressElement).toHaveClass('text-xs');
  });

  it('has proper cursor pointer styling', () => {
    const { container } = render(
      <TestWrapper value={mockAddress} onChange={mockOnSelect}>
        <AddressCard
          address={mockAddress}
          selected={false}
          onSelect={mockOnSelect}
        />
      </TestWrapper>
    );

    const cardElement = container.querySelector('.cursor-pointer');
    expect(cardElement).toBeInTheDocument();
  });
});