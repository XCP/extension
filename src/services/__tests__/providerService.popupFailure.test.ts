import './setup'; // Must be first to setup browser mocks
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { classifyProviderError } from '@/core/rpcErrors';
import { countOpenSignFlows, MAX_OPEN_SIGN_FLOWS_PER_ORIGIN, signFlowStorage } from '@/platform/provider/signFlow';
import { getConnectionService } from '../connectionService';
import { createProviderService } from '../providerService';
import { getWalletService } from '../walletService';

/**
 * A signing request whose approval window never opened must not stay behind as an open flow.
 *
 * The sign-flow store and the popup module are real: the defect is the stored 'pending' flow that
 * outlives a failed `chrome.windows.getCurrent()` / `chrome.windows.create()`.
 */

vi.mock('@/platform/auth/sessionManager', () => ({
  getSessionGeneration: () => 0,
  assertSessionGeneration: () => {},
}));
vi.mock('../walletService');
vi.mock('../connectionService');
vi.mock('../approvalService');
vi.mock('@/services/updateService', () => ({
  getUpdateService: () => ({ registerCriticalOperation: vi.fn(), unregisterCriticalOperation: vi.fn() }),
}));
vi.mock('@/platform/walletManager', () => ({
  walletManager: {
    getSettings: vi.fn().mockReturnValue({ connectedWebsites: [], analyticsAllowed: true }),
    updateSettings: vi.fn(),
  },
}));
vi.mock('@/platform/provider/rateLimiter', () => {
  const allow = { isAllowed: () => true, getResetTime: () => 0, reset: () => {} };
  return { apiRateLimiter: allow, connectionRateLimiter: allow, signPopupRateLimiter: allow, transactionRateLimiter: allow };
});

const ORIGIN = 'https://dapp.example';
const ADDRESS = 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty';

let sessionData: Record<string, unknown> = {};

describe('signing request when the approval window cannot be opened', () => {
  let provider: ReturnType<typeof createProviderService>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeBrowser.reset();
    sessionData = {};
    global.chrome = {
      storage: {
        session: {
          get: vi.fn(async (key?: string) =>
            typeof key === 'string' && key in sessionData ? { [key]: sessionData[key] } : {}),
          set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(sessionData, items); }),
        },
      },
      windows: {
        getCurrent: vi.fn().mockRejectedValue(new Error('No current window')),
        create: vi.fn().mockResolvedValue({ id: 321 }),
        update: vi.fn().mockResolvedValue({}),
        onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      runtime: { id: 'test', getURL: (path: string) => `chrome-extension://test/${path}` },
    } as any;
    vi.mocked(getWalletService).mockReturnValue({
      getActiveAddress: vi.fn().mockResolvedValue({ address: ADDRESS, pubKey: '02aa' }),
      getActiveWallet: vi.fn().mockResolvedValue({ id: 'wallet1', type: 'mnemonic', addressFormat: 'p2wpkh' }),
    } as never);
    vi.mocked(getConnectionService).mockReturnValue({
      hasPermission: vi.fn().mockResolvedValue(true),
      hasPairedAddressPermission: vi.fn().mockResolvedValue(false),
    } as never);
    provider = createProviderService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const signMessage = (message = 'hello') =>
    provider.handleRequest(ORIGIN, 'xcp_signMessage', [message]);

  it('rejects with a code the site can read', async () => {
    const error = await signMessage().catch((e: unknown) => e);

    expect(classifyProviderError(error).code).toBe(4001);
  });

  it('does not leave an open flow counting against the per-origin cap', async () => {
    await signMessage().catch(() => {});

    expect(await countOpenSignFlows(ORIGIN)).toBe(0);
    const stored = await signFlowStorage.getAll();
    expect(stored.every(flow => flow.status === 'cancelled')).toBe(true);
  });

  it('opens a fresh window on retry instead of rejoining a request nobody can see', async () => {
    await signMessage().catch(() => {});
    vi.mocked(chrome.windows.getCurrent).mockResolvedValue({ id: 1, width: 1000, height: 800, top: 0, left: 0 } as never);

    const retry = signMessage();
    retry.catch(() => {});

    await vi.waitFor(() => expect(chrome.windows.create).toHaveBeenCalledTimes(1));
    expect(await countOpenSignFlows(ORIGIN)).toBe(1);
  });

  it('lets a site keep asking after more failed opens than the cap', async () => {
    for (let i = 0; i < MAX_OPEN_SIGN_FLOWS_PER_ORIGIN; i++) {
      await expect(signMessage(`attempt ${i}`)).rejects.toThrow();
    }
    vi.mocked(chrome.windows.getCurrent).mockResolvedValue({ id: 1 } as never);

    const next = signMessage('after');
    next.catch(() => {});

    await vi.waitFor(() => expect(chrome.windows.create).toHaveBeenCalledTimes(1));
  });

  it('applies to transaction signing too', async () => {
    const error = await provider.handleRequest(ORIGIN, 'xcp_signTransaction', ['0200000001' + '00'.repeat(40)])
      .catch((e: unknown) => e);

    expect(classifyProviderError(error).code).toBe(4001);
    expect(await countOpenSignFlows(ORIGIN)).toBe(0);
  });
});
