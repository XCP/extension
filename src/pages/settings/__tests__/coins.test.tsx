import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCoinLockStore } from '@/core/bitcoin/coinLockStore';
import { coinLocksOf, withCoinLockUpdate } from '@/core/bitcoin/coinLocks';
import type { UTXO } from '@/core/bitcoin/utxo';
import type { CoinLock, CoinLockUpdate } from '@/types/coinLocks';
import CoinsPage from '../coins';

const ADDRESS = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
const state = vi.hoisted(() => ({ utxos: [] as unknown[], withAssets: new Set<string>(), assetFailure: false, refresh: () => {} }));

vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: (props: { rightButton: { onClick: () => void } }) => { state.refresh = props.rightButton.onClick; } }) }));
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({ activeAddress: { address: 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt' } }),
}));
vi.mock('@/core/bitcoin/utxo', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/core/bitcoin/utxo')>(),
  fetchUTXOs: vi.fn(async () => state.utxos),
  clearUtxoCache: vi.fn(),
}));
vi.mock('@/core/counterparty/api', () => ({ fetchUtxosWithBalances: vi.fn(async () => { if (state.assetFailure) throw new Error('API unavailable'); return state.withAssets; }) }));
vi.mock('@/core/bitcoin/blockHeight', () => ({ getCurrentBlockHeight: vi.fn(async () => 900_010) }));

const txid = (char: string) => char.repeat(64);
const utxo = (char: string, vout: number, value: number, confirmed = true): UTXO => ({
  txid: txid(char), vout, value,
  status: { confirmed, block_height: confirmed ? 900_001 : 0, block_hash: '', block_time: 0 },
});
const NOW = Math.floor(Date.now() / 1000);
const offerLock = (outpoint: string, extra: Partial<CoinLock> = {}): CoinLock => ({
  outpoint, address: ADDRESS, kind: 'offer_slot', manual: false, refs: ['a', 'b'], valueSats: 40_000,
  origin: 'https://market.example', expiresAt: NOW + 86_400, createdAt: NOW, seenAt: NOW, unlocked: false, ...extra,
});

/** A store that applies updates the way the background does. */
function installStore(initial: CoinLock[]) {
  let entries = initial;
  const updates: CoinLockUpdate[] = [];
  setCoinLockStore({
    read: async () => coinLocksOf(entries, ADDRESS),
    update: async (_address, update) => {
      updates.push(update);
      entries = withCoinLockUpdate(entries, ADDRESS, update, Math.floor(Date.now() / 1000)) ?? entries;
    },
  });
  return updates;
}

const renderPage = () => render(<MemoryRouter><CoinsPage /></MemoryRouter>);
const card = (name: RegExp) => screen.getByRole('article', { name });

describe('the Coins settings page', () => {
  beforeEach(() => {
    state.utxos = [utxo('a', 0, 40_000), utxo('b', 1, 100_000), utxo('c', 2, 546), utxo('d', 0, 7_000, false)];
    state.assetFailure = false;
    state.withAssets = new Set([`${txid('c')}:2`]);
  });
  afterEach(() => { cleanup(); setCoinLockStore(null); });

  it('lists every coin with its lock, what it backs, and the available and locked totals', async () => {
    installStore([offerLock(`${txid('a')}:0`)]);
    renderPage();
    const summary = within(await screen.findByText('Your coins').then(title => title.parentElement!));
    expect(summary.getByText('Available').nextSibling).toHaveTextContent('0.00107000 BTC');
    expect(summary.getByText('Locked').nextSibling).toHaveTextContent('0.00040000 BTC');
    const locked = card(/0\.00040000 BTC/);
    expect(within(locked).getByText('Offer funding')).toBeInTheDocument();
    expect(within(locked).getByText(/Backs 2 offers · From market\.example · Expires/)).toBeInTheDocument();
    expect(within(locked).getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
    expect(within(locked).getByRole('link', { name: `${'a'.repeat(8)}...${'a'.repeat(6)}:0` })).toHaveAttribute('href', `https://mempool.space/tx/${txid('a')}`);
    expect(within(card(/0\.00000546 BTC/)).getByText('Holds assets')).toBeInTheDocument();
    expect(within(card(/0\.00000546 BTC/)).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card(/0\.00007000 BTC/)).getByText('Pending')).toBeInTheDocument();
    expect(within(card(/0\.00100000 BTC/)).getByText('10 confirmations')).toBeInTheDocument();
  });

  it('excludes unknown assets from Available and recovers after refresh', async () => {
    state.assetFailure = true;
    installStore([offerLock(`${txid('a')}:0`)]);
    renderPage();
    await screen.findByText(/Could not check which coins hold assets/);
    const available = () => screen.getByText('Available').nextSibling;
    expect(available()).toHaveTextContent('0.00000000 BTC');
    expect(screen.getAllByText('Asset status unknown')).toHaveLength(4);
    expect(within(card(/0\.00100000 BTC/)).queryByRole('button', { name: 'Lock' })).not.toBeInTheDocument();
    expect(within(card(/0\.00040000 BTC/)).getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
    state.assetFailure = false;
    state.refresh();
    await waitFor(() => expect(available()).toHaveTextContent('0.00107000 BTC'));
    expect(screen.queryByText(/Could not check which coins hold assets/)).not.toBeInTheDocument();
    expect(screen.queryByText('Asset status unknown')).not.toBeInTheDocument();
    expect(within(card(/0\.00100000 BTC/)).getByRole('button', { name: 'Lock' })).toBeInTheDocument();
    state.assetFailure = true;
    state.refresh();
    await waitFor(() => expect(available()).toHaveTextContent('0.00000000 BTC'));
  });

  it('filters to locked coins', async () => {
    installStore([offerLock(`${txid('a')}:0`)]);
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Locked' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('shows no filter and no locked total while nothing is locked', async () => {
    installStore([]);
    renderPage();
    const summary = within(await screen.findByText('Your coins').then(title => title.parentElement!));
    expect(summary.getByText('Available').nextSibling).toHaveTextContent('0.00147000 BTC');
    expect(summary.queryByText('Locked')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
  });

  it('locks a plain coin by hand, then unlocks it at once', async () => {
    const updates = installStore([]);
    renderPage();
    await screen.findByText('Your coins');
    fireEvent.click(within(card(/0\.00100000 BTC/)).getByRole('button', { name: 'Lock' }));
    await waitFor(() => expect(within(card(/0\.00100000 BTC/)).getByText('Locked by you')).toBeInTheDocument());
    expect(updates).toEqual([{ lock: [{ outpoint: `${txid('b')}:1`, valueSats: 100_000 }] }]);
    expect(screen.getByRole('tab', { name: 'Locked' })).toBeInTheDocument();

    fireEvent.click(within(card(/0\.00100000 BTC/)).getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(within(card(/0\.00100000 BTC/)).queryByText('Locked by you')).not.toBeInTheDocument());
    expect(updates.at(-1)).toEqual({ unlock: [`${txid('b')}:1`] });
    expect(within(card(/0\.00100000 BTC/)).getByRole('button', { name: 'Lock' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('asks on the same button how many offers an unlock leaves at risk, and offers to lock the coin again while they live', async () => {
    const updates = installStore([offerLock(`${txid('a')}:0`)]);
    renderPage();
    const offer = () => card(/0\.00040000 BTC/);
    const action = within(await screen.findByRole('article', { name: /0\.00040000 BTC/ })).getByRole('button', { name: 'Unlock' });
    fireEvent.click(action);
    // The same button asks, Cancel sits beside it, and the card keeps everything it said.
    expect(action).toHaveAccessibleName('Confirm');
    expect(within(offer()).getByText('Your 2 offers stay live. If this coin is spent, they are cancelled.')).toBeInTheDocument();
    expect(within(offer()).getByText('Offer funding')).toBeInTheDocument();
    expect(within(offer()).getByText(/Backs 2 offers · From market\.example/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(within(offer()).getByRole('button', { name: 'Cancel' }));
    expect(action).toHaveAccessibleName('Unlock');
    expect(action).toHaveFocus();
    expect(within(offer()).queryByText(/Your 2 offers stay live/)).not.toBeInTheDocument();
    expect(within(offer()).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    // Escape withdraws the question too.
    fireEvent.click(action);
    fireEvent.keyDown(action, { key: 'Escape' });
    expect(action).toHaveAccessibleName('Unlock');
    expect(updates).toEqual([]);

    // Two taps on the same spot unlock.
    fireEvent.click(action);
    fireEvent.click(action);
    const relock = await within(offer()).findByRole('button', { name: 'Lock again' });
    expect(updates).toEqual([{ unlock: [`${txid('a')}:0`] }]);
    expect(within(offer()).getByText('Unlocked')).toBeInTheDocument();
    fireEvent.click(relock);
    await waitFor(() => expect(updates.at(-1)).toEqual({ relock: [`${txid('a')}:0`] }));
  });

  it('asks in one card at a time', async () => {
    installStore([offerLock(`${txid('a')}:0`), offerLock(`${txid('b')}:1`, { refs: ['c'], valueSats: 100_000 })]);
    renderPage();
    fireEvent.click(within(await screen.findByRole('article', { name: /0\.00040000 BTC/ })).getByRole('button', { name: 'Unlock' }));
    expect(within(card(/0\.00040000 BTC/)).getByText(/Your 2 offers stay live/)).toBeInTheDocument();
    fireEvent.click(within(card(/0\.00100000 BTC/)).getByRole('button', { name: 'Unlock' }));
    expect(within(card(/0\.00100000 BTC/)).getByText('Your offer stays live. If this coin is spent, it is cancelled.')).toBeInTheDocument();
    expect(within(card(/0\.00100000 BTC/)).getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(within(card(/0\.00040000 BTC/)).queryByText(/Your 2 offers stay live/)).not.toBeInTheDocument();
    expect(within(card(/0\.00040000 BTC/)).getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
    expect(within(card(/0\.00040000 BTC/)).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('lists a coin an offer locked before its funding reached the chain', async () => {
    installStore([offerLock(`${txid('f')}:0`, { seenAt: null, valueSats: 5_000 })]);
    renderPage();
    expect(within(await screen.findByRole('article', { name: /0\.00005000 BTC/ })).getByText('Not on chain yet')).toBeInTheDocument();
  });
});
