import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withHardwareErrorMetadata } from '@/core/hardware/errorMetadata';
import { configureLocale, t } from '@/i18n';
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
  configureLocale({ language: 'en' });
  stable.resetAdapter.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { configureLocale({}); vi.restoreAllMocks(); });

it('updates a retained hardware failure in every supported language without reconnecting or losing the raw error', async () => {
  const failure = withHardwareErrorMetadata(new Error('Original device busy evidence'), { vendor: 'trezor', code: 'DEVICE_BUSY' });
  stable.wallet.createHardwareWalletWithDiscovery.mockRejectedValue(failure);
  render(<MemoryRouter><ConnectHardware /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: t('wallets_connect_hardware_connect_trezor') }));
  await screen.findByText(t('hardware_error_busy'));

  for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK', 'en']) {
    act(() => configureLocale({ language }));
    expect(screen.getByText(t('hardware_error_busy'))).toBeVisible();
    expect(stable.header.setHeaderProps).toHaveBeenLastCalledWith(expect.objectContaining({ title: t('wallets_connect_hardware_connect_trezor') }));
    expect(stable.wallet.createHardwareWalletWithDiscovery).toHaveBeenCalledExactlyOnceWith('trezor');
    expect(stable.resetAdapter).toHaveBeenCalledOnce();
    expect(failure.message).toBe('Original device busy evidence');
  }
  expect(stable.wallet.setHardwareOperationInProgress.mock.calls).toEqual([[true], [false]]);
});

it.each(['Taproot P2TR: unrecognized device response', 'Cancelled: raw vendor evidence'])('does not diagnose firmware or cancellation from untagged text: %s', async message => {
  stable.wallet.createHardwareWalletWithDiscovery.mockRejectedValue(new Error(message));
  render(<MemoryRouter><ConnectHardware /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: t('wallets_connect_hardware_connect_trezor') }));
  await screen.findByText(message);
  act(() => configureLocale({ language: 'ja' }));
  expect(screen.getByText(message)).toBeVisible();
  expect(stable.wallet.createHardwareWalletWithDiscovery).toHaveBeenCalledOnce();
});

it('keeps the original adapter reset and account discovery command on success', async () => {
  stable.wallet.createHardwareWalletWithDiscovery.mockResolvedValue({ id: 'hardware-wallet' });
  render(<MemoryRouter><ConnectHardware /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: t('wallets_connect_hardware_connect_trezor') }));
  await waitFor(() => expect(stable.wallet.setHardwareOperationInProgress).toHaveBeenLastCalledWith(false));
  expect(stable.resetAdapter).toHaveBeenCalledOnce();
  expect(stable.wallet.createHardwareWalletWithDiscovery).toHaveBeenCalledExactlyOnceWith('trezor');
});
