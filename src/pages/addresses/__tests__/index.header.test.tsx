import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ADDRESSES_PER_WALLET } from '@/core/wallet/constants';
import AddressesPage from '../index';

const fixture = vi.hoisted(() => ({
  setHeaderProps: vi.fn(),
  addAddress: vi.fn(),
  wallet: null as null | { id: string; type: string; addressFormat: string; addresses: Array<{ address: string; name: string; path: string; pubKey: string }> },
  keychainLocked: false,
}));

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null }),
}));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: fixture.setHeaderProps }) }));
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: fixture.wallet,
    activeAddress: fixture.wallet?.addresses[0] ?? null,
    setActiveAddress: vi.fn(),
    addAddress: fixture.addAddress,
    addUtxoAddress: vi.fn(),
    removeUtxoAddress: vi.fn(),
    sweepUtxoAddresses: vi.fn(),
    keychainLocked: fixture.keychainLocked,
  }),
}));
vi.mock('@/components/ui/lists/address-list', () => ({ AddressList: () => null }));

const address = (index: number) => ({
  address: `bc1qexample${index}`, name: `Address ${index + 1}`, path: `m/84'/0'/0'/0/${index}`, pubKey: '02'.padEnd(66, '0'),
});
const wallet = (type: string, count = 1) => ({
  id: 'w1', type, addressFormat: 'P2WPKH', addresses: Array.from({ length: count }, (_, i) => address(i)),
});
const headerButton = () => fixture.setHeaderProps.mock.calls.at(-1)?.[0]?.rightButton;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.keychainLocked = false;
  fixture.addAddress.mockResolvedValue(address(1));
});

describe('address list header', () => {
  it.each(['mnemonic', 'hardware'])('offers a plus that adds an address for a %s wallet', async type => {
    fixture.wallet = wallet(type);
    render(<AddressesPage />);
    const button = headerButton();
    expect(button?.ariaLabel).toBe('Add Address');
    button.onClick();
    await waitFor(() => expect(fixture.addAddress).toHaveBeenCalledWith('w1'));
  });

  it('offers no plus for a private-key wallet, which cannot derive another address', () => {
    fixture.wallet = wallet('privateKey');
    render(<AddressesPage />);
    expect(headerButton()).toBeUndefined();
  });

  it('offers no plus while locked or at the address limit', () => {
    fixture.wallet = wallet('mnemonic');
    fixture.keychainLocked = true;
    const { unmount } = render(<AddressesPage />);
    expect(headerButton()).toBeUndefined();
    unmount();

    fixture.keychainLocked = false;
    fixture.wallet = wallet('mnemonic', MAX_ADDRESSES_PER_WALLET);
    render(<AddressesPage />);
    expect(headerButton()).toBeUndefined();
  });
});
