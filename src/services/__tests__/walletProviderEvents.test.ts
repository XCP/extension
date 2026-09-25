import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventEmitterService } from '@/services/eventEmitterService';
import { getWalletService } from '@/services/walletService';

vi.mock('@/platform/proxy', () => ({
  defineProxyService: (_name: string, factory: () => unknown) => [factory, factory],
}));
const { manager } = vi.hoisted(() => ({ manager: { connected: [] as string[], locked: false } }));
vi.mock('@/platform/walletManager', () => ({ walletManager: {
  // Like the real manager: the connected sites live in the keychain, so a locked one has none.
  getSettings: () => ({ connectedWebsites: manager.locked ? [] : manager.connected }),
  lockKeychain: async () => { manager.locked = true; },
} }));
vi.mock('@/platform/auth/sessionManager', () => ({ registerSessionExpiredHandler: vi.fn() }));
vi.mock('@/services/core/MessageBus', () => ({ MessageBus: { notifyKeychainLocked: vi.fn(async () => {}) } }));
vi.mock('@/services/eventEmitterService', () => ({ eventEmitterService: { emit: vi.fn() } }));

describe('wallet provider notification boundary', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('forwards a validated account notification', async () => {
    await getWalletService().emitProviderEvent('https://wallet.example', 'accountsChanged', ['bc1qexample']);
    expect(eventEmitterService.emit).toHaveBeenCalledWith('emit-provider-event', {
      origin: 'https://wallet.example', event: 'accountsChanged', data: ['bc1qexample'],
    });
  });

  it.each([
    [null, 'accountsChanged', []],
    ['https://wallet.example', 'wallet-unlocked', {}],
    ['https://wallet.example', 'accountsChanged', 'bc1qexample'],
    ['https://wallet.example', 'accountsChanged', [null]],
  ])('rejects malformed runtime arguments: %j, %j, %j', async (origin, event, data) => {
    // Extension messages are untyped at runtime, even when callers have TypeScript declarations.
    const emitUnchecked = getWalletService().emitProviderEvent as (...args: unknown[]) => Promise<void>;
    await expect(emitUnchecked(origin, event, data)).rejects.toThrow('Invalid provider event');
    expect(eventEmitterService.emit).not.toHaveBeenCalled();
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
