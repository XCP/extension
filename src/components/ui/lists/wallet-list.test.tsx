import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WalletList } from './wallet-list';
import type { Wallet } from '@/types/wallet';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';

// Mock WalletCard component
vi.mock('@/components/ui/cards/wallet-card', () => ({
  WalletCard: ({ wallet, selected, onSelect, isOnlyWallet }: any) => (
    <div
      data-testid={`wallet-card-${wallet.id}`}
      data-selected={selected}
      data-only={isOnlyWallet}
      onClick={() => onSelect(wallet)}
      role="radio"
      aria-checked={selected}
    >
      {wallet.name}
    </div>
  )
}));

describe('WalletList', () => {
  const mockWallets: Wallet[] = [
    {
      id: 'wallet-1',
      name: 'Wallet 1',
      type: 'mnemonic' as const,
      addressFormat: AddressFormat.P2WPKH,
      addressCount: 1,
      addresses: []
    },
    {
      id: 'wallet-2',
      name: 'Wallet 2',
      type: 'mnemonic' as const,
      addressFormat: AddressFormat.P2PKH,
      addressCount: 1,
      addresses: []
    },
    {
      id: 'wallet-3',
      name: 'Private Key Wallet',
      type: 'privateKey' as const,
      addressFormat: AddressFormat.P2WPKH,
      addressCount: 1,
      addresses: []
    }
  ];

  const mockOnSelectWallet = vi.fn();

  it('should render all wallets', () => {
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
  });

  it('should show selected wallet', () => {
    render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={mockWallets[1]}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    const selectedCard = screen.getByTestId('wallet-card-wallet-2');
    expect(selectedCard).toHaveAttribute('data-selected', 'true');
    expect(selectedCard).toHaveAttribute('aria-checked', 'true');
  });

  it('should call onSelectWallet when wallet is clicked', () => {
    render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={mockWallets[0]}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    const walletCard = screen.getByTestId('wallet-card-wallet-2');
    fireEvent.click(walletCard);

    expect(mockOnSelectWallet).toHaveBeenCalledWith(mockWallets[1]);
  });

  it('should mark wallet as only wallet when there is one wallet', () => {
    render(
      <WalletList
        wallets={[mockWallets[0]]}
        selectedWallet={mockWallets[0]}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    const walletCard = screen.getByTestId('wallet-card-wallet-1');
    expect(walletCard).toHaveAttribute('data-only', 'true');
  });

  it('should not mark wallets as only when there are multiple', () => {
    render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={mockWallets[0]}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    const walletCard1 = screen.getByTestId('wallet-card-wallet-1');
    const walletCard2 = screen.getByTestId('wallet-card-wallet-2');
    
    expect(walletCard1).toHaveAttribute('data-only', 'false');
    expect(walletCard2).toHaveAttribute('data-only', 'false');
  });

  it('should render empty list when no wallets', () => {
    const { container } = render(
      <WalletList
        wallets={[]}
        selectedWallet={null}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    // RadioGroup should still render but be empty
    expect(container.querySelector('.space-y-2')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('should handle wallet selection change through RadioGroup', () => {
    render(
      <WalletList
        wallets={mockWallets}
        selectedWallet={mockWallets[0]}
        onSelectWallet={mockOnSelectWallet}
      />
    );

    // Click on a different wallet
    const walletCard3 = screen.getByTestId('wallet-card-wallet-3');
    fireEvent.click(walletCard3);

    expect(mockOnSelectWallet).toHaveBeenCalledWith(mockWallets[2]);
  });
});