import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HardwareWalletError } from '@/core/hardware/types';
import { t } from '@/i18n';
import { mockBrowserLocale, render } from '@/i18n/test-utils';
import SignMessagePage from './sign-message';

const stable = vi.hoisted(() => ({
  header: { setHeaderProps: vi.fn() },
  wallet: { activeWallet: { id: 'hardware', type: 'hardware', addressFormat: 'P2WPKH' }, activeAddress: { address: 'bc1qEXACT', path: "m/84'/0'/0'/0/0" }, getPrivateKey: vi.fn() },
  adapter: { init: vi.fn(), signMessage: vi.fn() },
  walletService: { signMessage: vi.fn() },
}));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => stable.header }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => stable.wallet }));
vi.mock('@/platform/fathom', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/core/bitcoin/messageSigner', () => ({ getSigningCapabilities: () => ({ canSign: true, method: 'BIP-137' }), signMessage: vi.fn() }));
vi.mock('@/services/walletServiceClient', () => ({ getWalletServiceClient: () => stable.walletService }));
vi.mock('@/core/hardware/trezorAdapter', () => ({ getTrezorAdapter: () => stable.adapter }));

beforeEach(() => {
  vi.clearAllMocks();
  mockBrowserLocale({ language: 'en' });
  stable.adapter.init.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { mockBrowserLocale({}); vi.restoreAllMocks(); });

it('retains exact message bytes and local device evidence when changing language after a failed signature', async () => {
  const failure = new HardwareWalletError('Original device evidence', 'DEVICE_DISCONNECTED', 'trezor');
  // Connect 10 signs in the service worker, so the page goes through the wallet service.
  stable.walletService.signMessage.mockRejectedValue(failure);
  render(<MemoryRouter><SignMessagePage /></MemoryRouter>);
  const message = '  Exact 日本語\n0.00000001 XCP  ';
  const input = screen.getByRole('textbox', { name: t('common_message') });
  fireEvent.change(input, { target: { value: message } });
  fireEvent.click(screen.getByRole('button', { name: t('common_sign_message') }));
  await screen.findByText(t('hardware_error_disconnected'));
  for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
    act(() => mockBrowserLocale({ language, numberLocale: 'de-DE' }));
    expect(screen.getByText(t('hardware_error_disconnected'))).toBeVisible();
    expect(input).toHaveValue(message);
    expect(screen.getByRole('textbox', { name: t('common_signature') })).toHaveValue('');
    expect(stable.walletService.signMessage).toHaveBeenCalledExactlyOnceWith(message, 'bc1qEXACT', {
      walletId: 'hardware', address: 'bc1qEXACT',
    });
    expect(stable.wallet.getPrivateKey).not.toHaveBeenCalled();
    expect(failure.message).toBe('Original device evidence');
  }
});
