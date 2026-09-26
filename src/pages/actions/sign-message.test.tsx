import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SignMessagePage from './sign-message';

const { sign, privateKey, localSign, setHeaderProps, wallet } = vi.hoisted(() => ({
  sign: vi.fn(), privateKey: vi.fn(), localSign: vi.fn(), setHeaderProps: vi.fn(),
  wallet: { current: { id: 'trezor-wallet', type: 'hardware', addressFormat: 'p2wpkh' } },
}));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps }) }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({
  activeWallet: wallet.current,
  activeAddress: { address: 'bc1qtest', path: "m/84'/0'/0'/0/0" },
  getPrivateKey: privateKey,
}) }));
vi.mock('@/services/walletServiceClient', () => ({ getWalletServiceClient: () => ({ signMessage: sign }) }));
vi.mock('@/platform/fathom', () => ({ analytics: { track: vi.fn() } }));
// Spy on the signer so a test can tell if the page ever signs by itself.
vi.mock('@/core/bitcoin/messageSigner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/bitcoin/messageSigner')>()),
  signMessage: localSign,
}));

describe('manual message signing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.current = { id: 'trezor-wallet', type: 'hardware', addressFormat: 'p2wpkh' };
  });
  afterEach(cleanup);

  it.each(['mnemonic', 'privateKey'])('signs a %s wallet in the background, never fetching its key', async (type) => {
    wallet.current = { id: 'software-wallet', type, addressFormat: 'p2wpkh' };
    sign.mockResolvedValue({ signature: 'background-signature', address: 'bc1qtest' });
    render(<MemoryRouter><SignMessagePage /></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Test message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Message' }));
    await waitFor(() => expect(screen.getByDisplayValue('background-signature')).toBeInTheDocument());
    expect(sign).toHaveBeenCalledExactlyOnceWith('Test message', 'bc1qtest', {
      walletId: 'software-wallet', address: 'bc1qtest',
    });
    expect(privateKey).not.toHaveBeenCalled();
    expect(localSign).not.toHaveBeenCalled();
  });

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
