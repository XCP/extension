import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SignMessagePage from './sign-message';

const { sign, privateKey, setHeaderProps } = vi.hoisted(() => ({
  sign: vi.fn(), privateKey: vi.fn(), setHeaderProps: vi.fn(),
}));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps }) }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({
  activeWallet: { id: 'trezor-wallet', type: 'hardware', addressFormat: 'p2wpkh' },
  activeAddress: { address: 'bc1qtest', path: "m/84'/0'/0'/0/0" },
  getPrivateKey: privateKey,
}) }));
vi.mock('@/services/walletService', () => ({ getWalletService: () => ({ signMessage: sign }) }));
vi.mock('@/platform/fathom', () => ({ analytics: { track: vi.fn() } }));

describe('manual hardware message signing', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('uses the background signer with the displayed wallet identity', async () => {
    sign.mockResolvedValue({ signature: 'device-signature', address: 'bc1qtest' });
    render(<MemoryRouter><SignMessagePage /></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Test message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Message' }));
    await waitFor(() => expect(sign).toHaveBeenCalledWith('Test message', 'bc1qtest', {
      walletId: 'trezor-wallet', address: 'bc1qtest',
    }));
    await waitFor(() => expect(screen.getByDisplayValue('device-signature')).toBeInTheDocument());
    expect(privateKey).not.toHaveBeenCalled();
  });

  it('shows a background signing failure without a signature', async () => {
    sign.mockRejectedValue(new Error('Wallet session changed'));
    render(<MemoryRouter><SignMessagePage /></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Test message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wallet session changed');
    expect(screen.queryByDisplayValue('device-signature')).not.toBeInTheDocument();
  });
});
