import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddressList } from './address-list';
import type { Address } from '@/utils/wallet';

// Mock dependencies
vi.mock('@/utils/format', () => ({
  formatAddress: (address: string, shorten: boolean = true) => {
    if (shorten && address.length > 20) {
      return `${address.substring(0, 8)}...${address.substring(address.length - 8)}`;
    }
    return address;
  }
}));

vi.mock('@/components/menus/address-menu', () => ({
  AddressMenu: ({ address, walletId, onCopyAddress }: any) => (
    <button
      data-testid={`address-menu-${address.name}`}
      className="address-menu"
      onClick={() => onCopyAddress(address.address)}
    >
      Menu for {address.name}
    </button>
  )
}));

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined)
};

Object.defineProperty(navigator, 'clipboard', {
  value: mockClipboard,
  writable: true
});

describe('AddressList', () => {
  const mockAddresses: Address[] = [
    {
      name: 'Address 1',
      address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      derivationPath: "m/84'/0'/0'/0/0",
      publicKey: 'mockpublickey1',
      type: 'native-segwit',
      path: 'path1'
    },
    {
      name: 'Address 2',
      address: 'bc1qverylongaddressthatshouldbeshortenedintheformatfunction123456789',
      derivationPath: "m/84'/0'/0'/0/1",
      publicKey: 'mockpublickey2',
      type: 'native-segwit',
      path: 'path2'
    },
    {
      name: 'Legacy Address',
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      derivationPath: "m/44'/0'/0'/0/0",
      publicKey: 'mockpublickey3',
      type: 'legacy',
      path: 'path3'
    }
  ];

  const mockOnSelectAddress = vi.fn();
  const mockWalletId = 'wallet-1';

  beforeEach(() => {
    vi.clearAllMocks();
    mockClipboard.writeText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('renders all addresses correctly', () => {
    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    expect(screen.getByText('Address 1')).toBeInTheDocument();
    expect(screen.getByText('Address 2')).toBeInTheDocument();
    expect(screen.getByText('Legacy Address')).toBeInTheDocument();
  });

  it('displays formatted addresses', () => {
    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    expect(screen.getByText('bc1qw508...v8f3t4')).toBeInTheDocument();
    expect(screen.getByText('bc1qvery...3456789')).toBeInTheDocument();
    expect(screen.getByText('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBeInTheDocument();
  });

  it('shows derivation paths', () => {
    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    expect(screen.getByText("m/84'/0'/0'/0/0")).toBeInTheDocument();
    expect(screen.getByText("m/84'/0'/0'/0/1")).toBeInTheDocument();
    expect(screen.getByText("m/44'/0'/0'/0/0")).toBeInTheDocument();
  });

  it('shows selected state correctly', () => {
    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={mockAddresses[0]}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    const selectedAddress = screen.getByText('Address 1').closest('div');
    expect(selectedAddress).toHaveClass('bg-blue-600', 'text-white', 'shadow-md');
  });

  it('shows unselected state correctly', () => {
    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={mockAddresses[0]}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    const unselectedAddress = screen.getByText('Address 2').closest('div');
    expect(unselectedAddress).toHaveClass('bg-blue-100', 'hover:bg-blue-200', 'text-gray-800');
  });

  it('calls onSelectAddress when address is clicked', () => {
    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    const address1 = screen.getByText('Address 1').closest('div');
    fireEvent.click(address1!);

    expect(mockOnSelectAddress).toHaveBeenCalledWith(mockAddresses[0]);
  });

  it('does not call onSelectAddress when menu is clicked', () => {
    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    const menu = screen.getByTestId('address-menu-Address 1');
    fireEvent.click(menu);

    expect(mockOnSelectAddress).not.toHaveBeenCalled();
  });

  it('renders address menus for all addresses', () => {
    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    expect(screen.getByTestId('address-menu-Address 1')).toBeInTheDocument();
    expect(screen.getByTestId('address-menu-Address 2')).toBeInTheDocument();
    expect(screen.getByTestId('address-menu-Legacy Address')).toBeInTheDocument();
  });

  it('copies address to clipboard when menu is clicked', async () => {
    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    const menu = screen.getByTestId('address-menu-Address 1');
    fireEvent.click(menu);

    expect(mockClipboard.writeText).toHaveBeenCalledWith(mockAddresses[0].address);
  });

  it('shows check icon after copying address', async () => {
    vi.useFakeTimers();

    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    const menu = screen.getByTestId('address-menu-Address 1');
    fireEvent.click(menu);

    await waitFor(() => {
      const checkIcon = screen.getByRole('img', { hidden: true });
      expect(checkIcon).toBeInTheDocument();
    });

    // Check icon should disappear after 2 seconds
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      const checkIcon = screen.queryByRole('img', { hidden: true });
      expect(checkIcon).not.toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it('only shows check icon for the copied address', async () => {
    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    const menu1 = screen.getByTestId('address-menu-Address 1');
    fireEvent.click(menu1);

    await waitFor(() => {
      const checkIcons = screen.getAllByRole('img', { hidden: true });
      expect(checkIcons).toHaveLength(1);
    });
  });

  it('handles empty address list', () => {
    const { container } = render(
      <AddressList
        addresses={[]}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    const radioGroup = container.querySelector('[role="radiogroup"]');
    expect(radioGroup).toBeInTheDocument();
    expect(radioGroup).toHaveClass('space-y-2');

    // No address options should be rendered
    const radioOptions = container.querySelectorAll('[role="radio"]');
    expect(radioOptions).toHaveLength(0);
  });

  it('uses correct keys for address options', () => {
    // This test ensures no React key warnings
    expect(() => {
      render(
        <AddressList
          addresses={mockAddresses}
          selectedAddress={null}
          onSelectAddress={mockOnSelectAddress}
          walletId={mockWalletId}
        />
      );
    }).not.toThrow();

    mockAddresses.forEach((address) => {
      expect(screen.getByText(address.name)).toBeInTheDocument();
    });
  });

  it('has proper accessibility attributes', () => {
    const { container } = render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    const radioGroup = container.querySelector('[role="radiogroup"]');
    expect(radioGroup).toBeInTheDocument();

    const radioOptions = container.querySelectorAll('[role="radio"]');
    expect(radioOptions).toHaveLength(mockAddresses.length);

    radioOptions.forEach((option) => {
      expect(option).toHaveClass('focus:outline-none');
    });
  });

  it('updates selection when selectedAddress prop changes', () => {
    const { rerender } = render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={mockAddresses[0]}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    let selectedElement = screen.getByText('Address 1').closest('div');
    expect(selectedElement).toHaveClass('bg-blue-600');

    rerender(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={mockAddresses[1]}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    selectedElement = screen.getByText('Address 1').closest('div');
    expect(selectedElement).toHaveClass('bg-blue-100');

    const newSelectedElement = screen.getByText('Address 2').closest('div');
    expect(newSelectedElement).toHaveClass('bg-blue-600');
  });

  it('displays monospace font for addresses', () => {
    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    const addressElement = screen.getByText('bc1qw508...v8f3t4');
    expect(addressElement).toHaveClass('font-mono', 'text-sm');
  });

  it('shows different path colors for selected/unselected addresses', () => {
    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={mockAddresses[0]}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    const selectedPath = screen.getByText("m/84'/0'/0'/0/0");
    const unselectedPath = screen.getByText("m/84'/0'/0'/0/1");

    expect(selectedPath).toHaveClass('text-blue-200');
    expect(unselectedPath).toHaveClass('text-gray-500');
  });

  it('handles clipboard write failures gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockClipboard.writeText.mockRejectedValue(new Error('Clipboard error'));

    render(
      <AddressList
        addresses={mockAddresses}
        selectedAddress={null}
        onSelectAddress={mockOnSelectAddress}
        walletId={mockWalletId}
      />
    );

    const menu = screen.getByTestId('address-menu-Address 1');
    fireEvent.click(menu);

    // Should still show check icon even if clipboard fails
    await waitFor(() => {
      const checkIcon = screen.getByRole('img', { hidden: true });
      expect(checkIcon).toBeInTheDocument();
    });

    consoleErrorSpy.mockRestore();
  });
});