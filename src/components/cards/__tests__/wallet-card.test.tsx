import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadioGroup } from '@headlessui/react';
import WalletCard from '../wallet-card';
import type { Wallet } from '@/utils/wallet/walletManager';

// Mock the format utils
vi.mock('@/utils/format', () => ({
  formatAddress: (address: string, shorten: boolean = true) => {
    if (shorten && address.length > 20) {
      return `${address.substring(0, 8)}...${address.substring(address.length - 8)}`;
    }
    return address;
  }
}));

// Mock the WalletMenu component
vi.mock('@/components/menus/wallet-menu', () => ({
  WalletMenu: ({ wallet, isOnlyWallet }: { wallet: any; isOnlyWallet: boolean }) => (
    <button data-testid={`wallet-menu-${wallet.id}`} className="wallet-menu">
      Menu {isOnlyWallet ? '(Only)' : ''}
    </button>
  )
}));

// Test wrapper with RadioGroup context
const TestWrapper = ({ children, value, onChange }: { children: React.ReactNode, value: Wallet, onChange: (wallet: Wallet) => void }) => (
  <RadioGroup value={value} onChange={onChange}>
    {children}
  </RadioGroup>
);

describe('WalletCard', () => {
  const mockMnemonicWallet: Wallet = {
    id: 'wallet-1',
    name: 'Main Wallet',
    type: 'mnemonic',
    addressFormat: 'p2wpkh',
    addressCount: 1,
    addresses: [{
      name: 'Address 1',
      address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      path: "m/84'/0'/0'/0/0",
      pubKey: 'mockpublickey'
    }]
  };

  const mockPrivateKeyWallet: Wallet = {
    id: 'wallet-2',
    name: 'Import Wallet',
    type: 'privateKey',
    addressFormat: 'p2wpkh',
    addressCount: 1,
    addresses: [{
      name: 'Imported Address',
      address: 'bc1qverylongaddressthatshouldbeshortenedintheformatfunction123456789',
      path: '',
      pubKey: 'mockpublickey2'
    }]
  };

  const mockEmptyWallet: Wallet = {
    id: 'wallet-3',
    name: 'Empty Wallet',
    type: 'mnemonic',
    addressFormat: 'p2wpkh',
    addressCount: 0,
    addresses: []
  };

  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders wallet information correctly', () => {
    render(
      <TestWrapper value={mockMnemonicWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockMnemonicWallet}
          selected={false}
          onSelect={mockOnSelect}
          isOnlyWallet={false}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Main Wallet')).toBeInTheDocument();
    expect(screen.getByText('bc1qw508...7kv8f3t4')).toBeInTheDocument();
    expect(screen.getByText('Mnemonic')).toBeInTheDocument();
  });

  it('displays private key wallet type correctly', () => {
    render(
      <TestWrapper value={mockPrivateKeyWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockPrivateKeyWallet}
          selected={false}
          onSelect={mockOnSelect}
          isOnlyWallet={false}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Private Key')).toBeInTheDocument();
  });

  it('handles wallet with no addresses', () => {
    render(
      <TestWrapper value={mockEmptyWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockEmptyWallet}
          selected={false}
          onSelect={mockOnSelect}
          isOnlyWallet={false}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Empty Wallet')).toBeInTheDocument();
    expect(screen.getByText('No address')).toBeInTheDocument();
  });

  it('applies selected styles when checked', () => {
    const { container } = render(
      <TestWrapper value={mockMnemonicWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockMnemonicWallet}
          selected={true}
          onSelect={mockOnSelect}
          isOnlyWallet={false}
        />
      </TestWrapper>
    );

    const cardElement = container.querySelector('.bg-blue-600');
    expect(cardElement).toBeInTheDocument();
    expect(cardElement).toHaveClass('text-white', 'shadow-md');
  });

  it('applies unselected styles when not checked', () => {
    const { container } = render(
      <TestWrapper value={mockPrivateKeyWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockMnemonicWallet}
          selected={false}
          onSelect={mockOnSelect}
          isOnlyWallet={false}
        />
      </TestWrapper>
    );

    // When not selected, should have unselected styles
    const cardElement = container.querySelector('[data-checked=""]');
    expect(cardElement).toBeNull(); // Should not be checked
    
    // Find the radio option that's not checked
    const uncheckedElement = container.querySelector('[role="radio"]:not([data-checked])');
    expect(uncheckedElement).toBeInTheDocument();
  });

  it('renders wallet menu', () => {
    render(
      <TestWrapper value={mockMnemonicWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockMnemonicWallet}
          selected={false}
          onSelect={mockOnSelect}
          isOnlyWallet={false}
        />
      </TestWrapper>
    );

    expect(screen.getByTestId('wallet-menu-wallet-1')).toBeInTheDocument();
  });

  it('passes isOnlyWallet prop to wallet menu', () => {
    render(
      <TestWrapper value={mockMnemonicWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockMnemonicWallet}
          selected={false}
          onSelect={mockOnSelect}
          isOnlyWallet={true}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Menu (Only)')).toBeInTheDocument();
  });

  it('calls onSelect when wallet card is clicked', () => {
    render(
      <TestWrapper value={mockMnemonicWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockMnemonicWallet}
          selected={false}
          onSelect={mockOnSelect}
          isOnlyWallet={false}
        />
      </TestWrapper>
    );

    const walletName = screen.getByText('Main Wallet');
    fireEvent.click(walletName);
    expect(mockOnSelect).toHaveBeenCalledWith(mockMnemonicWallet);
  });

  it('does not call onSelect when menu is clicked', () => {
    render(
      <TestWrapper value={mockMnemonicWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockMnemonicWallet}
          selected={false}
          onSelect={mockOnSelect}
          isOnlyWallet={false}
        />
      </TestWrapper>
    );

    const menu = screen.getByTestId('wallet-menu-wallet-1');
    fireEvent.click(menu);
    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it('has proper accessibility attributes', () => {
    const { container } = render(
      <TestWrapper value={mockMnemonicWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockMnemonicWallet}
          selected={false}
          onSelect={mockOnSelect}
          isOnlyWallet={false}
        />
      </TestWrapper>
    );

    const radioOption = container.querySelector('[role="radio"]');
    expect(radioOption).toBeInTheDocument();
    expect(radioOption).toHaveAttribute('tabIndex');
  });

  it('displays monospace font for address', () => {
    render(
      <TestWrapper value={mockMnemonicWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockMnemonicWallet}
          selected={false}
          onSelect={mockOnSelect}
          isOnlyWallet={false}
        />
      </TestWrapper>
    );

    const addressElement = screen.getByText('bc1qw508...7kv8f3t4');
    expect(addressElement).toHaveClass('font-mono');
  });

  it('has cursor pointer styling', () => {
    const { container } = render(
      <TestWrapper value={mockMnemonicWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockMnemonicWallet}
          selected={false}
          onSelect={mockOnSelect}
          isOnlyWallet={false}
        />
      </TestWrapper>
    );

    const cardElement = container.querySelector('.cursor-pointer');
    expect(cardElement).toBeInTheDocument();
  });

  it('has transition animation classes', () => {
    const { container } = render(
      <TestWrapper value={mockMnemonicWallet} onChange={mockOnSelect}>
        <WalletCard
          wallet={mockMnemonicWallet}
          selected={false}
          onSelect={mockOnSelect}
          isOnlyWallet={false}
        />
      </TestWrapper>
    );

    const cardElement = container.querySelector('.transition');
    expect(cardElement).toBeInTheDocument();
    expect(cardElement).toHaveClass('duration-300');
  });
});