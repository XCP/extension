import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCoinLockStore } from '@/core/bitcoin/coinLockStore';
import { type CoinLock, type CoinLockUpdate, coinLocksOf, withCoinLockUpdate } from '@/core/bitcoin/coinLocks';
import type { UTXO } from '@/core/bitcoin/utxo';
import CoinsPage from '../coins';

const ADDRESS = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
const state = vi.hoisted(() => ({ utxos: [] as unknown[], withAssets: new Set<string>() }));

vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({ activeAddress: { address: 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt' } }),
}));
vi.mock('@/core/bitcoin/utxo', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/core/bitcoin/utxo')>(),
  fetchUTXOs: vi.fn(async () => state.utxos),
  clearUtxoCache: vi.fn(),
}));
vi.mock('@/core/counterparty/api', () => ({ fetchUtxosWithBalances: vi.fn(async () => state.withAssets) }));
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
    state.withAssets = new Set([`${txid('c')}:2`]);
  });
  afterEach(() => { cleanup(); setCoinLockStore(null); });

  it('lists every coin with its lock, what it backs, and the free and locked totals', async () => {
    installStore([offerLock(`${txid('a')}:0`)]);
    renderPage();
    expect(await screen.findByText('0.00107000 BTC free · 0.00040000 BTC locked')).toBeInTheDocument();
    const locked = card(/0\.00040000 BTC/);
    expect(within(locked).getByText('Offer funding')).toBeInTheDocument();
    expect(within(locked).getByText(/Backs 2 offers · From market\.example · Expires/)).toBeInTheDocument();
    expect(within(locked).getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
    expect(within(card(/0\.00000546 BTC/)).getByText('Holds assets')).toBeInTheDocument();
    expect(within(card(/0\.00000546 BTC/)).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card(/0\.00007000 BTC/)).getByText('Unconfirmed')).toBeInTheDocument();
    expect(within(card(/0\.00100000 BTC/)).getByText('10 confirmations')).toBeInTheDocument();
  });

  it('filters to locked coins', async () => {
    installStore([offerLock(`${txid('a')}:0`)]);
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Locked' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('locks a plain coin by hand, then unlocks it after a confirmation that it becomes spendable', async () => {
    const updates = installStore([]);
    renderPage();
    await screen.findByText('0.00147000 BTC free');
    fireEvent.click(within(card(/0\.00100000 BTC/)).getByRole('button', { name: 'Lock' }));
    await waitFor(() => expect(within(card(/0\.00100000 BTC/)).getByText('Locked by you')).toBeInTheDocument());
    expect(updates).toEqual([{ lock: [{ outpoint: `${txid('b')}:1`, valueSats: 100_000 }] }]);

    fireEvent.click(within(card(/0\.00100000 BTC/)).getByRole('button', { name: 'Unlock' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('This coin becomes spendable again.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(within(card(/0\.00100000 BTC/)).queryByText('Locked by you')).not.toBeInTheDocument());
    expect(updates.at(-1)).toEqual({ unlock: [`${txid('b')}:1`] });
  });

  it('says how many offers an unlock cancels, and offers to lock the coin again while they live', async () => {
    const updates = installStore([offerLock(`${txid('a')}:0`)]);
    renderPage();
    fireEvent.click(within(await screen.findByRole('article', { name: /0\.00040000 BTC/ })).getByRole('button', { name: 'Unlock' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Spending this coin cancels 2 offers.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(updates).toEqual([]);

    fireEvent.click(within(card(/0\.00040000 BTC/)).getByRole('button', { name: 'Unlock' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Unlock' }));
    const relock = await within(card(/0\.00040000 BTC/)).findByRole('button', { name: 'Lock again' });
    expect(within(card(/0\.00040000 BTC/)).getByText('Unlocked')).toBeInTheDocument();
    fireEvent.click(relock);
    await waitFor(() => expect(updates.at(-1)).toEqual({ relock: [`${txid('a')}:0`] }));
  });

  it('lists a coin an offer locked before its funding reached the chain', async () => {
    installStore([offerLock(`${txid('f')}:0`, { seenAt: null, valueSats: 5_000 })]);
    renderPage();
    expect(within(await screen.findByRole('article', { name: /0\.00005000 BTC/ })).getByText('Not on chain yet')).toBeInTheDocument();
  });
});
