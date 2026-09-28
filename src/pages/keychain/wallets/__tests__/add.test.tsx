import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { t } from '@/i18n';
import type { Wallet } from '@/types/wallet';
import AddWalletPage from '../add';

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));

const hardwareWallet = { id: 'hw-1', name: 'Trezor', type: 'hardware', addresses: [] } as unknown as Wallet;
const removeWallet = vi.fn();
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({ wallets: [hardwareWallet], removeWallet }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

it('says so when disconnecting the hardware wallet fails, and stays on the page', async () => {
  removeWallet.mockRejectedValue(new Error('Lock timeout'));
  render(<MemoryRouter><AddWalletPage /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: t('wallets_add_disconnect_hardware_wallet') }));
  expect(await screen.findByText(t('wallets_remove_failed_to_remove_wallet_please'))).toBeVisible();
  expect(removeWallet).toHaveBeenCalledExactlyOnceWith('hw-1');
  expect(navigate).not.toHaveBeenCalled();
});

it('goes back to the wallet list once the hardware wallet is disconnected', async () => {
  removeWallet.mockResolvedValue(undefined);
  render(<MemoryRouter><AddWalletPage /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: t('wallets_add_disconnect_hardware_wallet') }));
  expect(navigate).toHaveBeenCalledWith('/keychain/wallets', { replace: true });
});
