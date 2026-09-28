import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddressDetailsPage from '../details';

const fixture = vi.hoisted(() => ({
  setHeaderProps: vi.fn(),
  navigate: vi.fn(),
  type: 'mnemonic',
}));

vi.mock('react-router', () => ({ useNavigate: () => fixture.navigate }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: fixture.setHeaderProps }) }));
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: { id: 'w1', type: fixture.type, addressFormat: 'P2WPKH', addresses: [] },
    activeAddress: { address: 'bc1qexample0', name: 'Address 1', path: "m/84'/0'/0'/0/0", pubKey: '' },
  }),
}));
vi.mock('@/components/ui/qr-code', () => ({ QRCode: () => null }));

const headerButton = () => fixture.setHeaderProps.mock.calls.at(-1)?.[0]?.rightButton;

beforeEach(() => vi.clearAllMocks());

describe('receive page header', () => {
  it.each(['mnemonic', 'hardware'])('links a %s wallet to its address list and back', type => {
    fixture.type = type;
    render(<AddressDetailsPage />);
    headerButton().onClick();
    expect(fixture.navigate).toHaveBeenCalledWith('/addresses', { state: { returnTo: '/addresses/details' } });
  });

  it('shows no address list for a private-key wallet, which has one address', () => {
    fixture.type = 'privateKey';
    render(<AddressDetailsPage />);
    expect(headerButton()).toBeUndefined();
  });
});
