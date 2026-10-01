import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCoinLockStore } from '@/core/bitcoin/coinLockStore';
import { coinLocksOf, withCoinLockUpdate } from '@/core/bitcoin/coinLocks';
import { fetchUTXOs, type UTXO } from '@/core/bitcoin/utxo';
import { fetchUtxosWithBalances } from '@/core/counterparty/api';
import type { CoinLock, CoinLockUpdate } from '@/types/coinLocks';
import CoinsPage from '../coins';

const ADDRESS = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
const state = vi.hoisted(() => ({ utxos: [] as UTXO[], withAssets: new Set<string>(), address: 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt' }));

vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({ activeAddress: { address: state.address } }),
}));
vi.mock('@/core/bitcoin/utxo', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/core/bitcoin/utxo')>(),
  fetchUTXOs: vi.fn(async () => state.utxos),
  clearUtxoCache: vi.fn(),
}));
vi.mock('@/core/counterparty/api', () => ({ fetchUtxosWithBalances: vi.fn(async () => state.withAssets) }));
vi.mock('@/core/bitcoin/blockHeight', () => ({ getCurrentBlockHeight: vi.fn(async () => 900_010) }));
vi.mock('@/core/bitcoin/outspend', () => ({ checkOutspends: vi.fn(async () => ({ spent: [], unknown: [] })) }));

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
    read: async address => coinLocksOf(entries, address),
    update: async (address, update) => {
      updates.push(update);
      entries = withCoinLockUpdate(entries, address, update, Math.floor(Date.now() / 1000)) ?? entries;
    },
  });
  return updates;
}

const renderPage = () => render(<MemoryRouter><CoinsPage /></MemoryRouter>);
const card = (name: RegExp) => screen.getByRole('article', { name });

describe('the Coins settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchUTXOs).mockImplementation(async () => state.utxos);
    state.address = ADDRESS;
    state.utxos = [utxo('a', 0, 40_000), utxo('b', 1, 100_000), utxo('c', 2, 546), utxo('d', 0, 7_000, false)];
    state.withAssets = new Set([`${txid('c')}:2`]);
  });
  afterEach(() => { cleanup(); setCoinLockStore(null); });

  it('shows only tracked coins and a locked total without classifying unrelated outputs', async () => {
    installStore([offerLock(`${txid('a')}:0`)]);
    state.utxos.push(...Array.from({ length: 500 }, (_, index) => utxo('c', index + 3, 546)));
    renderPage();
    const summary = within(await screen.findByText('Coin protection').then(title => title.parentElement!));
    expect(summary.queryByText('Available')).not.toBeInTheDocument();
    expect(summary.getByText('Locked').nextSibling).toHaveTextContent('0.00040000 BTC');
    const locked = card(/0\.00040000 BTC/);
    expect(within(locked).getByText('Offer funding')).toBeInTheDocument();
    expect(within(locked).getByText(/Backs 2 offers · From market\.example · Expires/)).toBeInTheDocument();
    expect(within(locked).getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
    expect(within(locked).getByRole('link', { name: `${'a'.repeat(8)}...${'a'.repeat(6)}:0` })).toHaveAttribute('href', `https://mempool.space/tx/${txid('a')}`);
    expect(await within(locked).findByText('10 confirmations')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(fetchUTXOs).toHaveBeenCalledTimes(1);
    expect(fetchUtxosWithBalances).not.toHaveBeenCalled();
  });

  it('filters to locked coins', async () => {
    installStore([offerLock(`${txid('a')}:0`), offerLock(`${txid('b')}:1`, { unlocked: true, valueSats: 100_000 })]);
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Locked' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Lock again' })).toBeInTheDocument();
  });

  it('does no network work with no tracked coins, even when the wallet has UTXOs', async () => {
    installStore([]);
    renderPage();
    expect(await screen.findByText('No protected coins')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(fetchUTXOs).not.toHaveBeenCalled();
    expect(fetchUtxosWithBalances).not.toHaveBeenCalled();
  });

  it('unlocks an existing hand lock without waiting for the explorer or rescanning', async () => {
    vi.mocked(fetchUTXOs).mockReturnValue(new Promise(() => {}));
    const updates = installStore([offerLock(`${txid('b')}:1`, {
      kind: 'manual', manual: true, origin: null, refs: [], expiresAt: null, valueSats: 100_000,
    })]);
    renderPage();
    const manual = await screen.findByRole('article', { name: /0\.00100000 BTC/ });
    expect(within(manual).getByText('Checking status…')).toBeInTheDocument();
    fireEvent.click(within(manual).getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('No protected coins')).toBeInTheDocument();
    expect(updates).toEqual([{ unlock: [`${txid('b')}:1`] }]);
    expect(fetchUTXOs).toHaveBeenCalledTimes(1);
  });

  it('keeps local offer actions usable when chain status fails', async () => {
    vi.mocked(fetchUTXOs).mockRejectedValue(new Error('offline'));
    installStore([offerLock(`${txid('a')}:0`)]);
    renderPage();
    expect(await screen.findByText('Status unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Your coin locks are still available/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('button', { name: 'Lock again' })).toBeInTheDocument();
    expect(fetchUTXOs).toHaveBeenCalledTimes(1);
  });

  it('drops an old address response after switching addresses', async () => {
    let resolve: (utxos: UTXO[]) => void = () => {};
    vi.mocked(fetchUTXOs).mockReturnValue(new Promise(done => { resolve = done; }));
    installStore([offerLock(`${txid('a')}:0`)]);
    const view = renderPage();
    await screen.findByRole('article');
    state.address = 'another-address';
    view.rerender(<MemoryRouter><CoinsPage /></MemoryRouter>);
    expect(await screen.findByText('No protected coins')).toBeInTheDocument();
    await act(async () => { resolve(state.utxos); });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('does not resurrect a lock when its earlier chain request finishes after an unlock', async () => {
    let resolve: (utxos: UTXO[]) => void = () => {};
    vi.mocked(fetchUTXOs).mockReturnValue(new Promise(done => { resolve = done; }));
    installStore([offerLock(`${txid('a')}:0`)]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await screen.findByRole('button', { name: 'Lock again' });
    await act(async () => { resolve(state.utxos); });
    expect(screen.getByRole('button', { name: 'Lock again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument();
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
    expect(await within(await screen.findByRole('article', { name: /0\.00005000 BTC/ })).findByText('Not found in latest check')).toBeInTheDocument();
  });
});
