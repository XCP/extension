/**
 * Choosing a wallet has to look like it happened before it has finished happening.
 *
 * Selecting decrypts the wallet's secret and derives every one of its addresses. That got about
 * ten times faster when the seed stopped being re-derived per address, but it is still work, and
 * nothing on this screen moved while it ran: the radio kept showing the wallet being left, so the
 * click read as having missed. `withStateLock` queues rather than drops, so the natural response —
 * clicking again — put a second full load behind the first instead of replacing it.
 *
 * Both halves are asserted here: the choice shows immediately, and a second click during the wait
 * does nothing.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import type { Wallet } from '@/types/wallet';

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({ setHeaderProps: vi.fn() }),
}));

/** Stands in for the card so the assertions read against the selection, not the styling. */
vi.mock('@/components/domain/wallet/wallet-card', () => ({
  WalletCard: ({ wallet, selected, displayAddress, onSelect, disabled }: any) => (
    <button
      type="button"
      data-testid={`wallet-card-${wallet.id}`}
      data-selected={selected}
      data-display-address={displayAddress?.address ?? ''}
      onClick={() => !disabled && onSelect(wallet)}
    >
      {wallet.name}
    </button>
  ),
}));

const wallet = (id: string, name: string): Wallet => ({
  id,
  name,
  type: 'mnemonic',
  addressFormat: AddressFormat.P2WPKH,
  addressCount: 1,
  addresses: [],
});

const WALLET_A = wallet('wallet-a', 'Wallet A');
const WALLET_B = wallet('wallet-b', 'Wallet B');
const ACTIVE_ADDRESS = { name: 'Address 1', path: "m/84'/0'/0'/0/0", address: 'bc1qactive', pubKey: '' };

const selectWallet = vi.fn();
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    wallets: [WALLET_A, WALLET_B],
    activeWallet: WALLET_A,
    activeAddress: ACTIVE_ADDRESS,
    selectWallet,
  }),
}));

const { default: WalletsPage } = await import('../index');

const renderPage = () =>
  render(
    <MemoryRouter>
      <WalletsPage />
    </MemoryRouter>
  );

const selectedId = () =>
  screen
    .getAllByTestId(/^wallet-card-/)
    .find((card) => card.dataset.selected === 'true')
    ?.dataset.testid;

describe('choosing a wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.dataset.context = 'sidepanel';
  });

  it('shows the choice while the wallet is still loading', async () => {
    // Never settles: the assertion is about what the screen says mid-load.
    selectWallet.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(selectedId()).toBe('wallet-card-wallet-a');

    await userEvent.setup().click(screen.getByTestId('wallet-card-wallet-b'));

    await waitFor(() => expect(selectedId()).toBe('wallet-card-wallet-b'));
    expect(navigate).not.toHaveBeenCalled(); // still loading, so we have not moved on
  });

  it('does not show the leaving wallet address against the wallet being loaded', async () => {
    selectWallet.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('wallet-card-wallet-a').dataset.displayAddress).toBe('bc1qactive');

    await userEvent.setup().click(screen.getByTestId('wallet-card-wallet-b'));

    await waitFor(() => expect(selectedId()).toBe('wallet-card-wallet-b'));
    expect(screen.getByTestId('wallet-card-wallet-b').dataset.displayAddress).toBe('');
  });

  it('ignores further clicks while one selection is in flight', async () => {
    selectWallet.mockReturnValue(new Promise(() => {}));
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByTestId('wallet-card-wallet-b'));
    await user.click(screen.getByTestId('wallet-card-wallet-b'));
    await user.click(screen.getByTestId('wallet-card-wallet-a'));

    expect(selectWallet).toHaveBeenCalledTimes(1);
    expect(selectWallet).toHaveBeenCalledWith('wallet-b');
  });

  it('navigates once the wallet has loaded', async () => {
    selectWallet.mockResolvedValue(undefined);
    renderPage();

    await userEvent.setup().click(screen.getByTestId('wallet-card-wallet-b'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/index'));
  });

  /**
   * Showing the choice before it is real is only honest if it comes back when it turns out not to
   * be. Otherwise the screen claims a wallet is active that failed to load.
   */
  it('puts the selection back and says so when the load fails', async () => {
    selectWallet.mockRejectedValue(new Error('keychain locked'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();

    await userEvent.setup().click(screen.getByTestId('wallet-card-wallet-b'));

    expect(await screen.findByText(/Failed to select wallet/i)).toBeInTheDocument();
    await waitFor(() => expect(selectedId()).toBe('wallet-card-wallet-a'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('lets a new selection through once the failed one has been dismissed', async () => {
    selectWallet.mockRejectedValueOnce(new Error('keychain locked')).mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByTestId('wallet-card-wallet-b'));
    await screen.findByText(/Failed to select wallet/i);
    await user.click(screen.getByTestId('wallet-card-wallet-b'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/index'));
    expect(selectWallet).toHaveBeenCalledTimes(2);
  });
});
