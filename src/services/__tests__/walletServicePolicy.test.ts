/**
 * What an extension page may ask the wallet service for.
 *
 * The recovery phrase and private keys used to be returned to any extension page that asked,
 * with the password checked only by the page beforehand. They now come only from revealSecret,
 * which checks the password in the background. Methods only the background calls are not
 * remotely callable at all, and the settings writer cannot change which sites are connected.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWalletService } from '@/services/walletService';
import { WALLET_SERVICE_POLICY } from '@/services/walletServiceClient';

vi.mock('@/platform/proxy', () => ({
  defineProxyService: (_name: string, factory: () => unknown) => [factory, factory],
}));
const { manager } = vi.hoisted(() => ({ manager: {
  getSettings: vi.fn(() => ({ connectedWebsites: [] as string[] })),
  updateSettings: vi.fn(async () => {}),
} }));
vi.mock('@/platform/walletManager', () => ({ walletManager: manager }));
vi.mock('@/platform/auth/sessionManager', () => ({ registerSessionExpiredHandler: vi.fn() }));
vi.mock('@/services/eventEmitterService', () => ({ eventEmitterService: { emit: vi.fn() } }));

const remote = Object.keys(WALLET_SERVICE_POLICY.methods);

describe('wallet service remote policy', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns key material only through the password-checked reveal', () => {
    expect(remote).not.toContain('getUnencryptedMnemonic');
    expect(remote).not.toContain('getPrivateKey');
    expect(WALLET_SERVICE_POLICY.methods.revealSecret).toBe('command');
  });

  it('does not expose methods only the background calls', () => {
    for (const method of [
      'removeConnectedWebsite', 'clearConnectedWebsites', 'setPairedAddressPermission',
      'signPsbt', 'updateWalletPinnedAssets', 'ensureKeychainLoaded',
    ]) {
      expect(remote, method).not.toContain(method);
    }
  });

  it('does not let the settings writer change which sites are connected', async () => {
    const service = getWalletService();
    await expect(service.updateSettings({ connectedWebsites: ['https://site.example'] }))
      .rejects.toThrow('connection');
    await expect(service.updateSettings({
      providerCapabilities: { 'https://site.example': { pairedAddresses: true } },
    })).rejects.toThrow('connection');
    expect(manager.updateSettings).not.toHaveBeenCalled();

    await service.updateSettings({ fiat: 'eur' });
    expect(manager.updateSettings).toHaveBeenCalledWith({ fiat: 'eur' });
  });
});
