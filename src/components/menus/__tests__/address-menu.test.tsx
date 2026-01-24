import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AddressMenu } from '../address-menu';
import type { Address } from '@/types/wallet';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('AddressMenu', () => {
  const mockAddress: Address = {
    name: 'Address 1',
    address: 'bc1qtest123',
    path: "m/84'/0'/0'/0/0",
    pubKey: '0x123abc'
  };
  
  const mockOnCopyAddress = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render menu button', () => {
    render(
      <MemoryRouter>
        <AddressMenu 
          address={mockAddress}
          walletId="wallet-1"
          onCopyAddress={mockOnCopyAddress}
        />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    expect(menuButton).toBeInTheDocument();
  });

  it('should show menu items when clicked', async () => {
    render(
      <MemoryRouter>
        <AddressMenu 
          address={mockAddress}
          walletId="wallet-1"
          onCopyAddress={mockOnCopyAddress}
        />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('Copy Address')).toBeInTheDocument();
      expect(screen.getByText('Sweep Address')).toBeInTheDocument();
      expect(screen.getByText('Show Private Key')).toBeInTheDocument();
    });
  });

  it('should call onCopyAddress when copy is clicked', async () => {
    render(
      <MemoryRouter>
        <AddressMenu 
          address={mockAddress}
          walletId="wallet-1"
          onCopyAddress={mockOnCopyAddress}
        />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const copyButton = screen.getByText('Copy Address');
      fireEvent.click(copyButton);
    });

    expect(mockOnCopyAddress).toHaveBeenCalledWith('bc1qtest123');
  });

  it('should navigate to sweep page when sweep is clicked', async () => {
    render(
      <MemoryRouter>
        <AddressMenu 
          address={mockAddress}
          walletId="wallet-1"
          onCopyAddress={mockOnCopyAddress}
        />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const sweepButton = screen.getByText('Sweep Address');
      fireEvent.click(sweepButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/compose/sweep/bc1qtest123');
  });

  it('should navigate to show private key page when clicked', async () => {
    render(
      <MemoryRouter>
        <AddressMenu 
          address={mockAddress}
          walletId="wallet-1"
          onCopyAddress={mockOnCopyAddress}
        />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    await waitFor(() => {
      const privateKeyButton = screen.getByText('Show Private Key');
      fireEvent.click(privateKeyButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      "/wallet/secrets/show-private-key/wallet-1/m%2F84'%2F0'%2F0'%2F0%2F0"
    );
  });

  it('should stop event propagation when clicking menu items', async () => {
    const mockOnClick = vi.fn();
    
    render(
      <div onClick={mockOnClick}>
        <MemoryRouter>
          <AddressMenu 
            address={mockAddress}
            walletId="wallet-1"
            onCopyAddress={mockOnCopyAddress}
          />
        </MemoryRouter>
      </div>
    );

    const menuButton = screen.getByRole('button');
    fireEvent.click(menuButton);

    // Reset the mock after the menu opens (since opening menu might trigger parent)
    mockOnClick.mockClear();

    await waitFor(async () => {
      const copyButton = screen.getByText('Copy Address');
      fireEvent.click(copyButton);
    });

    // The parent onClick should not be called due to stopPropagation
    expect(mockOnClick).not.toHaveBeenCalled();
  });
});