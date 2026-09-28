import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { localizedAddressFormatLabel } from '@/components/domain/address/address-format-label';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { t } from '@/i18n';
import HomePage from '../index';

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: { id: 'w', name: 'Wallet 1', type: 'mnemonic', addressFormat: AddressFormat.P2WPKH },
    activeAddress: { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', name: 'Address 1' },
    lockKeychain: vi.fn(),
    isLoading: false,
  }),
}));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));
vi.mock('@/core/counterparty/api', () => ({ fetchTokenBalances: vi.fn(async () => []) }));
vi.mock('@/components/domain/address/address-type-shortcut', () => ({ AddressTypeShortcut: () => null }));
vi.mock('@/components/domain/wallet/trezor-access-notice', () => ({ TrezorAccessNotice: () => null }));
vi.mock('@/components/domain/balance/balance-list', () => ({ BalanceList: () => null }));
vi.mock('@/components/domain/asset/asset-list', () => ({ AssetList: () => null }));
vi.mock('@/components/domain/utxo/utxo-list', () => ({ UtxoList: () => null }));

afterEach(cleanup);

describe('HomePage current address card', () => {
  it('shows just the address name, without the address type', async () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    const card = screen.getByRole('button', { name: t('common_current_address') });
    const name = await screen.findByText('Address 1');
    expect(card).toContainElement(name);
    expect(name).toHaveTextContent(/^Address 1$/);
    // The type lives in the header shortcut's tooltip, not beside the name.
    expect(card).not.toHaveTextContent(localizedAddressFormatLabel(AddressFormat.P2WPKH));
    expect(card).not.toHaveTextContent('·');
  });
});
