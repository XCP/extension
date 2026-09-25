import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n';
import { render } from '@/i18n/test-utils';
import { TrezorAccessNotice } from './trezor-access-notice';

const wallet = vi.hoisted(() => ({ activeWallet: { type: 'hardware' } as { type: string } | null }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => wallet }));

const permissions = () => chrome.permissions as unknown as {
  contains: ReturnType<typeof vi.fn>; request: ReturnType<typeof vi.fn>;
};

describe('TrezorAccessNotice', () => {
  beforeEach(() => { wallet.activeWallet = { type: 'hardware' }; });

  it('asks a Trezor wallet without Suite access, and disappears once allowed', async () => {
    permissions().contains.mockResolvedValue(false);
    render(<TrezorAccessNotice />);
    fireEvent.click(await screen.findByRole('button', { name: t('trezor_access_notice_allow') }));
    expect(permissions().request).toHaveBeenCalledWith({ origins: ['https://suite.trezor.io/*'] });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('stays while access is still denied', async () => {
    permissions().contains.mockResolvedValue(false);
    permissions().request.mockResolvedValue(false);
    render(<TrezorAccessNotice />);
    fireEvent.click(await screen.findByRole('button', { name: t('trezor_access_notice_allow') }));
    await waitFor(() => expect(permissions().request).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent(t('trezor_access_notice_body'));
  });

  it.each([
    ['a Trezor wallet that already has access', { type: 'hardware' }, true],
    ['a seed wallet', { type: 'mnemonic' }, false],
    ['no wallet', null, false],
  ])('shows nothing for %s', async (_label, active, granted) => {
    wallet.activeWallet = active;
    permissions().contains.mockResolvedValue(granted);
    render(<TrezorAccessNotice />);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
