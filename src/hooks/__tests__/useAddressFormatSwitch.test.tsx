import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { withHardwareErrorMetadata } from '@/core/hardware/errorMetadata';
import { t } from '@/i18n';
import { mockBrowserLocale, renderHook } from '@/i18n/test-utils';
import { useAddressFormatSwitch } from '../useAddressFormatSwitch';

const fixture = vi.hoisted(() => ({
  wallet: {
    id: 'wallet',
    type: 'mnemonic',
    addressFormat: 'p2wpkh' as string | undefined,
    addressCount: 1,
    addresses: [{ name: 'Address 1', address: 'active-0', path: "m/84'/0'/0'/0/0", pubKey: '02' }],
  },
  preview: vi.fn(async (_wallet: string, format: string) => `preview:${format}`),
  update: vi.fn(async () => {}),
}));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({
  activeWallet: fixture.wallet,
  activeAddress: fixture.wallet.addresses[0],
  getPreviewAddressForFormat: fixture.preview,
  updateWalletAddressFormat: fixture.update,
}) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fixture.wallet.addressFormat = AddressFormat.P2WPKH;
});
afterEach(() => { vi.restoreAllMocks(); mockBrowserLocale({ language: 'en' }); });

describe('useAddressFormatSwitch', () => {
  it('asks for no preview when no format is offered', async () => {
    fixture.wallet.addressFormat = undefined;
    const { result } = renderHook(() => useAddressFormatSwitch());
    await waitFor(() => expect(result.current.isLoadingPreviews).toBe(false));
    expect(result.current.formats).toEqual([]);
    expect(fixture.preview).not.toHaveBeenCalled();
    expect(result.current.previews).toEqual({});
  });

  it('shows a device failure in the reader\'s language, not the raw diagnostic', async () => {
    mockBrowserLocale({ language: 'ja' });
    fixture.update.mockRejectedValueOnce(withHardwareErrorMetadata(
      new Error('Device disconnected during call'), { vendor: 'trezor', code: 'DEVICE_DISCONNECTED' }));
    const { result } = renderHook(() => useAddressFormatSwitch());
    await waitFor(() => expect(result.current.isLoadingPreviews).toBe(false));

    await act(async () => { await result.current.switchFormat(AddressFormat.P2PKH); });

    expect(result.current.error).toBe(t('hardware_error_disconnected'));
    expect(result.current.error).not.toContain('Device disconnected during call');
    expect(result.current.selectedFormat).toBe(AddressFormat.P2WPKH);
  });

  it('falls back to the translated message when the failure carries no text', async () => {
    mockBrowserLocale({ language: 'ja' });
    fixture.update.mockRejectedValueOnce('refused');
    const { result } = renderHook(() => useAddressFormatSwitch());
    await waitFor(() => expect(result.current.isLoadingPreviews).toBe(false));

    await act(async () => { await result.current.switchFormat(AddressFormat.P2PKH); });

    expect(result.current.error).toBe(t('settings_address_types_failed_to_update_address_type'));
    expect(result.current.error).not.toBe('Failed to update address type');
  });
});
