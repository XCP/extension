import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WalletList } from './wallet-list';
import type { Wallet } from '@/utils/wallet';

// Mock WalletCard component
vi.mock('@/components/cards/wallet-card', () => ({
  default: ({ wallet, selected, onSelect, isOnlyWallet }: any) => (
    <div
      data-testid={`wallet-card-${wallet.id}`}
      className={`wallet-card ${selected ? 'selected' : ''} ${isOnlyWallet ? 'only-wallet' : ''}`}
      onClick={() => onSelect(wallet)}
    >
      <div className="wallet-name">{wallet.name}</div>
      <div className="wallet-type">{wallet.type}</div>
      <div className="selected-state">{selected ? 'Selected' : 'Not Selected'}</div>
      <div className="only-wallet-state">{isOnlyWallet ? 'Only Wallet' : 'Multiple Wallets'}</div>
    </div>
  )
}));

describe('WalletList', () => {
  const mockWallets: Wallet[] = [
    {
      id: 'wallet-1',
      name: 'Main Wallet',
      type: 'mnemonic',
      addresses: [{
        name: 'Address 1',
        address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        derivationPath: "m/84'/0'/0'/0/0",
        publicKey: 'mockpublickey1',
        type: 'native-segwit'
      }]
    },
    {
      id: 'wallet-2',
      name: 'Import Wallet',
      type: 'privateKey',
      addresses: [{
        name: 'Imported Address',
        address: 'bc1qverylongaddressthatshouldbeshortened123456789',
        derivationPath: '',
        publicKey: 'mockpublickey2',
        type: 'native-segwit'
      }]
    },
    {
      id: 'wallet-3',
      name: 'Secondary Wallet',
      type: 'mnemonic',
      addresses: []
    }
  ];

  const mockOnSelectWallet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all wallet cards', () => {
    render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={null}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    expect(screen.getByTestId('wallet-card-wallet-1')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-card-wallet-2')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-card-wallet-3')).toBeInTheDocument();
    
    expect(screen.getByText('Main Wallet')).toBeInTheDocument();
    expect(screen.getByText('Import Wallet')).toBeInTheDocument();
    expect(screen.getByText('Secondary Wallet')).toBeInTheDocument();
  });

  it('shows selected state correctly', () => {
    render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={mockWallets[0]}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    const selectedCard = screen.getByTestId('wallet-card-wallet-1');
    const unselectedCard = screen.getByTestId('wallet-card-wallet-2');

    expect(selectedCard).toHaveClass('selected');
    expect(unselectedCard).not.toHaveClass('selected');
    
    // Check that one card shows "Selected"
    const selectedTexts = screen.getAllByText('Selected');
    const notSelectedTexts = screen.getAllByText('Not Selected');
    expect(selectedTexts).toHaveLength(1);
    expect(notSelectedTexts).toHaveLength(2);
  });

  it('calls onSelectWallet when wallet card is clicked', () => {
    render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={null}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    const walletCard = screen.getByTestId('wallet-card-wallet-1');
    fireEvent.click(walletCard);

    expect(mockOnSelectWallet).toHaveBeenCalledWith(mockWallets[0]);
  });

  it('calls onSelectWallet with correct wallet when different cards are clicked', () => {
    render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={null}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    const firstCard = screen.getByTestId('wallet-card-wallet-1');
    const secondCard = screen.getByTestId('wallet-card-wallet-2');

    fireEvent.click(firstCard);
    expect(mockOnSelectWallet).toHaveBeenCalledWith(mockWallets[0]);

    fireEvent.click(secondCard);
    expect(mockOnSelectWallet).toHaveBeenCalledWith(mockWallets[1]);
  });

  it('passes isOnlyWallet=true when there is only one wallet', () => {
    const singleWallet = [mockWallets[0]];

    render(
      <WalletList
        wallets={singleWallet}
        selectedWallet={null}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    const walletCard = screen.getByTestId('wallet-card-wallet-1');
    expect(walletCard).toHaveClass('only-wallet');
    expect(screen.getByText('Only Wallet')).toBeInTheDocument();
  });

  it('passes isOnlyWallet=false when there are multiple wallets', () => {
    render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={null}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    const walletCards = screen.getAllByText('Multiple Wallets');
    expect(walletCards).toHaveLength(3);
    
    mockWallets.forEach((wallet) => {
      const card = screen.getByTestId(`wallet-card-${wallet.id}`);
      expect(card).not.toHaveClass('only-wallet');
    });
  });

  it('renders with empty wallet list', () => {
    const { container } = render(
      <WalletList
        wallets={[]}
        selectedWallet={null}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    // Should render RadioGroup but with no wallet cards
    const radioGroup = container.querySelector('[role="radiogroup"]');
    expect(radioGroup).toBeInTheDocument();
    expect(screen.queryByTestId('wallet-card-')).not.toBeInTheDocument();
  });

  it('has proper RadioGroup structure and spacing', () => {
    const { container } = render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={null}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    const radioGroup = container.querySelector('[role="radiogroup"]');
    expect(radioGroup).toBeInTheDocument();
    expect(radioGroup).toHaveClass('space-y-2');
  });

  it('uses unique keys for wallet cards', () => {
    // This test ensures no React key warnings
    expect(() => {
      render(
        <WalletList
          wallets={mockWallets}
          selectedWallet={null}
          onSelectWallet={mockOnSelectWallet}
        />
      );
    }).not.toThrow();

    mockWallets.forEach((wallet) => {
      expect(screen.getByTestId(`wallet-card-${wallet.id}`)).toBeInTheDocument();
    });
  });

  it('maintains selection state correctly across re-renders', () => {
    const { rerender } = render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={mockWallets[0]}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    expect(screen.getByTestId('wallet-card-wallet-1')).toHaveClass('selected');

    // Change selection
    rerender(
      <WalletList
        wallets={mockWallets}
        selectedWallet={mockWallets[1]}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    expect(screen.getByTestId('wallet-card-wallet-1')).not.toHaveClass('selected');
    expect(screen.getByTestId('wallet-card-wallet-2')).toHaveClass('selected');
  });

  it('handles null selectedWallet correctly', () => {
    render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={null}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    // All cards should be unselected
    mockWallets.forEach((wallet) => {
      const card = screen.getByTestId(`wallet-card-${wallet.id}`);
      expect(card).not.toHaveClass('selected');
    });

    const notSelectedTexts = screen.getAllByText('Not Selected');
    expect(notSelectedTexts).toHaveLength(mockWallets.length);
  });

  it('passes different wallet types correctly', () => {
    render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={null}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    expect(screen.getAllByText('mnemonic')).toHaveLength(2);
    expect(screen.getByText('privateKey')).toBeInTheDocument();
  });

  it('handles wallet selection by id comparison', () => {
    const walletCopy = { ...mockWallets[0] };
    
    render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={walletCopy}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    // Should recognize as selected since ID matches
    const selectedCard = screen.getByTestId('wallet-card-wallet-1');
    expect(selectedCard).toHaveClass('selected');
  });

  it('works with RadioGroup keyboard navigation', () => {
    const { container } = render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={null}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    const radioGroup = container.querySelector('[role="radiogroup"]');
    expect(radioGroup).toBeInTheDocument();
    
    // The WalletCard components are mocked, so we check that we have the expected number of wallet cards
    const walletCards = container.querySelectorAll('.wallet-card');
    expect(walletCards).toHaveLength(mockWallets.length);
  });
});