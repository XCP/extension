import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventEmitterService } from '@/services/eventEmitterService';
import { getWalletService } from '@/services/walletService';

vi.mock('@/platform/proxy', () => ({
  defineProxyService: (_name: string, factory: () => unknown) => [factory, factory],
}));
type FakeWallet = { id: string; addresses: { address: string }[] };
const { manager } = vi.hoisted(() => ({ manager: {
  connected: [] as string[],
  locked: false,
  wallets: [] as FakeWallet[],
  activeId: null as string | null,
  lastActiveAddress: undefined as string | undefined,
} }));
vi.mock('@/platform/walletManager', () => ({ walletManager: {
  // Like the real manager: the connected sites live in the keychain, so a locked one has none.
  getSettings: () => ({
    connectedWebsites: manager.locked ? [] : manager.connected,
    lastActiveAddress: manager.lastActiveAddress,
  }),
  lockKeychain: async () => { manager.locked = true; },
  getActiveWallet: () => manager.locked ? undefined : manager.wallets.find(wallet => wallet.id === manager.activeId),
  selectWallet: async (id: string) => { manager.activeId = id; },
  updateSettings: async (updates: { lastActiveAddress?: string }) => {
    if ('lastActiveAddress' in updates) manager.lastActiveAddress = updates.lastActiveAddress;
  },
  updateWalletAddressFormat: async (id: string) => {
    const wallet = manager.wallets.find(candidate => candidate.id === id)!;
    wallet.addresses = wallet.addresses.map(({ address }) => ({ address: address.replace('bc1q', 'bc1p') }));
    manager.lastActiveAddress = manager.lastActiveAddress?.replace('bc1q', 'bc1p');
  },
  removeWallet: async (id: string) => {
    manager.wallets = manager.wallets.filter(wallet => wallet.id !== id);
    if (manager.activeId === id) manager.activeId = null;
  },
  createMnemonicWallet: async () => {
    const wallet = { id: 'created', addresses: [{ address: 'bc1qcreated' }] };
    manager.wallets.push(wallet);
    manager.activeId = wallet.id;
    return wallet;
  },
} }));
vi.mock('@/platform/auth/sessionManager', () => ({ registerSessionExpiredHandler: vi.fn() }));
vi.mock('@/services/eventEmitterService', () => ({ eventEmitterService: { emit: vi.fn() } }));

const accountsChanged = (origin: string, data: string[]) =>
  ['emit-provider-event', { origin, event: 'accountsChanged', data }];

describe('wallet provider notification boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    manager.connected = [];
    manager.locked = false;
    manager.wallets = [
      { id: 'one', addresses: [{ address: 'bc1qone0' }, { address: 'bc1qone1' }] },
      { id: 'two', addresses: [{ address: 'bc1qtwo0' }] },
    ];
    manager.activeId = 'one';
    manager.lastActiveAddress = 'bc1qone0';
  });

  it('is no longer something an extension page can ask for', () => {
    // Account events are decided in the background from wallet state, not sent by the UI.
    expect('emitProviderEvent' in getWalletService()).toBe(false);
  });

  it('tells every connected site the new account when a wallet switch changes it', async () => {
    manager.connected = ['https://a.example', 'https://b.example'];
    await getWalletService().selectWallet('two');
    expect(vi.mocked(eventEmitterService.emit).mock.calls).toEqual([
      accountsChanged('https://a.example', ['bc1qtwo0']),
      accountsChanged('https://b.example', ['bc1qtwo0']),
    ]);
  });

  it('tells connected sites when a different address of the wallet is chosen', async () => {
    manager.connected = ['https://a.example'];
    await getWalletService().setLastActiveAddress('bc1qone1');
    expect(vi.mocked(eventEmitterService.emit).mock.calls).toEqual([accountsChanged('https://a.example', ['bc1qone1'])]);
  });

  it('says nothing when the active address did not change', async () => {
    manager.connected = ['https://a.example'];
    await getWalletService().setLastActiveAddress('bc1qone0');
    await getWalletService().selectWallet('one');
    expect(eventEmitterService.emit).not.toHaveBeenCalled();
  });

  it('tells connected sites about an address-type switch', async () => {
    manager.connected = ['https://a.example'];
    await getWalletService().updateWalletAddressFormat('one', 'p2tr' as never);
    expect(vi.mocked(eventEmitterService.emit).mock.calls).toEqual([accountsChanged('https://a.example', ['bc1pone0'])]);
  });

  it('tells connected sites the accounts are gone when the active wallet is removed', async () => {
    manager.connected = ['https://a.example'];
    await getWalletService().removeWallet('one');
    expect(eventEmitterService.emit).toHaveBeenCalledWith(...accountsChanged('https://a.example', []));
  });

  it('tells connected sites about a newly created wallet that became active', async () => {
    manager.connected = ['https://a.example'];
    await getWalletService().createMnemonicWallet('mnemonic', 'password');
    expect(eventEmitterService.emit).toHaveBeenCalledWith(...accountsChanged('https://a.example', ['bc1qcreated']));
  });

  it('tells no site that is not connected', async () => {
    await getWalletService().selectWallet('two');
    expect(eventEmitterService.emit).not.toHaveBeenCalledWith('emit-provider-event', expect.anything());
  });

  it('tells every site connected before the lock that its accounts are gone', async () => {
    manager.connected = ['https://a.example', 'https://b.example'];
    manager.locked = false;
    await getWalletService().lockKeychain();
    expect(eventEmitterService.emit).toHaveBeenCalledWith('emit-provider-event',
      { origin: 'https://a.example', event: 'accountsChanged', data: [] });
    expect(eventEmitterService.emit).toHaveBeenCalledWith('emit-provider-event',
      { origin: 'https://b.example', event: 'accountsChanged', data: [] });
  });
});
