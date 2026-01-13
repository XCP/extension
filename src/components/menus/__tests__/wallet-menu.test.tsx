import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WalletMenu } from '../wallet-menu';
import type { Wallet } from '@/utils/wallet/walletManager';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

// Mock wallet context to avoid webext-bridge import side effects
const mockSetActiveWallet = vi.fn();
const mockRemoveWallet = vi.fn();
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    wallets: [],
    activeWallet: null,
    setActiveWallet: mockSetActiveWallet,
    removeWallet: mockRemoveWallet
  })
}));

describe('WalletMenu', () => {
  const mnemonicWallet: Wallet = {
    id: 'wallet-1',
    name: 'Mnemonic Wallet',
    type: 'mnemonic' as const,
    addressFormat: AddressFormat.P2WPKH,
    addressCount: 1,
    addresses: []
  };

  const privateKeyWallet: Wallet = {
    id: 'wallet-2',
    name: 'Private Key Wallet',
    type: 'privateKey' as const,
    addressFormat: AddressFormat.P2PKH,
    addressCount: 1,
    addresses: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetActiveWallet.mockClear();
    mockRemoveWallet.mockClear();
  });

  it('should render menu button', () => {
    render(
      <MemoryRouter>
        <WalletMenu wallet={mnemonicWallet} isOnlyWallet={false} />
      </MemoryRouter>
    );

    const menuButton = screen.getByLabelText('Wallet options');
    expect(menuButton).toBeInTheDocument();
  });

  it('should show menu items when clicked', async () => {
    render(
      <MemoryRouter>
        <WalletMenu wallet={mnemonicWallet} isOnlyWallet={false} />
      </MemoryRouter>
    );

    const menuButton = screen.getByLabelText('Wallet options');
    fireEvent.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('Show Passphrase')).toBeInTheDocument();
      expect(screen.getByText('Remove Mnemonic Wallet')).toBeInTheDocument();
    });
  });

  it('should show "Show Private Key" for private key wallet', async () => {
    render(
      <MemoryRouter>
        <WalletMenu wallet={privateKeyWallet} isOnlyWallet={false} />
      </MemoryRouter>
    );

    const menuButton = screen.getByLabelText('Wallet options');
    fireEvent.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('Show Private Key')).toBeInTheDocument();
    });
  });

  it('should disable Remove option when it is the only wallet', async () => {
    render(
      <MemoryRouter>
        <WalletMenu wallet={mnemonicWallet} isOnlyWallet={true} />
      </MemoryRouter>
    );

    const menuButton = screen.getByLabelText('Wallet options');
    fireEvent.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('Show Passphrase')).toBeInTheDocument();
      const removeButton = screen.getByText('Remove Mnemonic Wallet');
      expect(removeButton).toBeDisabled();
      expect(removeButton).toHaveAttribute('title', 'Cannot remove only wallet');
    });
  });

  it('should navigate to show passphrase page for mnemonic wallet', async () => {
    render(
      <MemoryRouter>
        <WalletMenu wallet={mnemonicWallet} isOnlyWallet={false} />
      </MemoryRouter>
    );

    const menuButton = screen.getByLabelText('Wallet options');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const showButton = screen.getByText('Show Passphrase');
      fireEvent.click(showButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/show-passphrase/wallet-1');
  });

  it('should navigate to show private key page for private key wallet', async () => {
    render(
      <MemoryRouter>
        <WalletMenu wallet={privateKeyWallet} isOnlyWallet={false} />
      </MemoryRouter>
    );

    const menuButton = screen.getByLabelText('Wallet options');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const showButton = screen.getByText('Show Private Key');
      fireEvent.click(showButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/show-private-key/wallet-2');
  });

  it('should navigate to remove wallet page when clicked', async () => {
    render(
      <MemoryRouter>
        <WalletMenu wallet={mnemonicWallet} isOnlyWallet={false} />
      </MemoryRouter>
    );

    const menuButton = screen.getByLabelText('Wallet options');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const removeButton = screen.getByText('Remove Mnemonic Wallet');
      fireEvent.click(removeButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/remove-wallet/wallet-1');
  });

  it('should stop event propagation when menu is clicked', () => {
    const mockOnClick = vi.fn();
    
    render(
      <div onClick={mockOnClick}>
        <MemoryRouter>
          <WalletMenu wallet={mnemonicWallet} isOnlyWallet={false} />
        </MemoryRouter>
      </div>
    );

    // Find the menu container div instead of the button
    const menuButton = screen.getByLabelText('Wallet options');
    const menuContainer = menuButton.closest('div[class*="relative"]');
    if (menuContainer) {
      fireEvent.click(menuContainer);
    }

    // Parent click should not be triggered
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('should stop event propagation when menu items are clicked', async () => {
    const mockOnClick = vi.fn();
    
    render(
      <div onClick={mockOnClick}>
        <MemoryRouter>
          <WalletMenu wallet={mnemonicWallet} isOnlyWallet={false} />
        </MemoryRouter>
      </div>
    );

    const menuButton = screen.getByLabelText('Wallet options');
    fireEvent.click(menuButton);

    // Reset the mock after the menu opens (since opening menu might trigger parent)
    mockOnClick.mockClear();

    await waitFor(() => {
      const showButton = screen.getByText('Show Passphrase');
      fireEvent.click(showButton);
    });

    // Parent click should not be triggered
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('should apply styles to menu items', async () => {
    render(
      <MemoryRouter>
        <WalletMenu wallet={mnemonicWallet} isOnlyWallet={false} />
      </MemoryRouter>
    );

    const menuButton = screen.getByLabelText('Wallet options');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const showButton = screen.getByText('Show Passphrase').closest('button');
      expect(showButton).toBeInTheDocument();
      // Check if basic menu item styles are applied from Button component
      expect(showButton?.className).toContain('flex');
      expect(showButton?.className).toContain('px-4');
      expect(showButton?.className).toContain('py-2');
      expect(showButton?.className).toContain('text-sm');
    });
  });
});