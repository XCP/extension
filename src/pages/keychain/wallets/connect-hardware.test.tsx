import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withHardwareErrorMetadata } from '@/core/hardware/errorMetadata';
import { t } from '@/i18n';
import { mockBrowserLocale, render } from '@/i18n/test-utils';
import ConnectHardware from './connect-hardware';

const stable = vi.hoisted(() => ({
  header: { setHeaderProps: vi.fn() },
  wallet: { createHardwareWalletWithDiscovery: vi.fn(), setHardwareOperationInProgress: vi.fn() },
  resetAdapter: vi.fn(),
}));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => stable.header }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => stable.wallet }));
vi.mock('@/core/hardware/trezorAdapter', () => ({ resetTrezorAdapter: stable.resetAdapter }));

beforeEach(() => {
  vi.clearAllMocks();
  mockBrowserLocale({ language: 'en' });
  stable.resetAdapter.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { mockBrowserLocale({}); vi.restoreAllMocks(); });

it('updates a retained hardware failure in every supported language without reconnecting or losing the raw error', async () => {
  const failure = withHardwareErrorMetadata(new Error('Original device busy evidence'), { vendor: 'trezor', code: 'DEVICE_BUSY' });
  stable.wallet.createHardwareWalletWithDiscovery.mockRejectedValue(failure);
  render(<MemoryRouter><ConnectHardware /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: t('wallets_connect_hardware_connect_trezor') }));
  await screen.findByText(t('hardware_error_busy'));

  for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK', 'en']) {
    act(() => mockBrowserLocale({ language }));
    expect(screen.getByText(t('hardware_error_busy'))).toBeVisible();
    expect(stable.header.setHeaderProps).toHaveBeenLastCalledWith(expect.objectContaining({ title: t('wallets_connect_hardware_connect_trezor') }));
    expect(stable.wallet.createHardwareWalletWithDiscovery).toHaveBeenCalledExactlyOnceWith('trezor');
    // Connect 10 routes through Trezor Suite; resetting before connecting would drop that session.
    expect(stable.resetAdapter).not.toHaveBeenCalled();
    expect(failure.message).toBe('Original device busy evidence');
  }
  expect(stable.wallet.setHardwareOperationInProgress.mock.calls).toEqual([[true], [false]]);
});

it.each(['Taproot P2TR: unrecognized device response', 'Cancelled: raw vendor evidence'])('does not diagnose firmware or cancellation from untagged text: %s', async message => {
  stable.wallet.createHardwareWalletWithDiscovery.mockRejectedValue(new Error(message));
  render(<MemoryRouter><ConnectHardware /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: t('wallets_connect_hardware_connect_trezor') }));
  await screen.findByText(message);
  act(() => mockBrowserLocale({ language: 'ja' }));
  expect(screen.getByText(message)).toBeVisible();
  expect(stable.wallet.createHardwareWalletWithDiscovery).toHaveBeenCalledOnce();
});

it('runs account discovery once without resetting the Suite connection', async () => {
  stable.wallet.createHardwareWalletWithDiscovery.mockResolvedValue({ id: 'hardware-wallet' });
  render(<MemoryRouter><ConnectHardware /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: t('wallets_connect_hardware_connect_trezor') }));
  await waitFor(() => expect(stable.wallet.setHardwareOperationInProgress).toHaveBeenLastCalledWith(false));
  // Connect 10 routes through Trezor Suite; resetting before connecting would drop that session.
    expect(stable.resetAdapter).not.toHaveBeenCalled();
  expect(stable.wallet.createHardwareWalletWithDiscovery).toHaveBeenCalledExactlyOnceWith('trezor');
});

it('asks Chrome for Trezor Suite access before connecting, and connects once it is allowed', async () => {
  const permissions = chrome.permissions as unknown as { request: ReturnType<typeof vi.fn> };
  stable.wallet.createHardwareWalletWithDiscovery.mockResolvedValue({ id: 'hardware-wallet' });
  render(<MemoryRouter><ConnectHardware /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: t('wallets_connect_hardware_connect_trezor') }));
  await waitFor(() => expect(stable.wallet.createHardwareWalletWithDiscovery).toHaveBeenCalledOnce());
  expect(permissions.request).toHaveBeenCalledWith({ origins: ['https://suite.trezor.io/*'] });
  expect(permissions.request.mock.invocationCallOrder[0])
    .toBeLessThan(stable.wallet.createHardwareWalletWithDiscovery.mock.invocationCallOrder[0]!);
});

it('does not open Suite when the user denies access, and says how to retry', async () => {
  (chrome.permissions as unknown as { request: ReturnType<typeof vi.fn> }).request.mockResolvedValue(false);
  render(<MemoryRouter><ConnectHardware /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: t('wallets_connect_hardware_connect_trezor') }));
  await screen.findByText(t('hardware_error_suite_access_denied'));
  expect(stable.wallet.createHardwareWalletWithDiscovery).not.toHaveBeenCalled();
  expect(stable.wallet.setHardwareOperationInProgress).not.toHaveBeenCalled();
});
