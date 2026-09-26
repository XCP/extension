import './setup'; // Must be first to setup browser mocks
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { classifyProviderError } from '@/core/rpcErrors';
import { connectionRateLimiter } from '@/platform/provider/rateLimiter';

/**
 * One connect is one charge against the per-origin connect limit, and every refusal a site can
 * cause while connecting comes back with a code it can read.
 *
 * The provider service, the connection service and the rate limiter are all real here: the defect
 * was the two services each charging the same limiter, which a mock of either cannot show.
 */

const approval = vi.hoisted(() => ({
  requestApproval: vi.fn(),
  registerCompletionHandler: vi.fn(),
}));
vi.mock('@/services/approvalService', () => ({ getApprovalService: () => approval }));
vi.mock('@/platform/storage/walletStorage', () => ({ keychainExists: vi.fn().mockResolvedValue(true) }));
vi.mock('@/platform/auth/sessionManager', () => ({
  getSessionGeneration: () => 0,
  assertSessionGeneration: () => {},
}));
vi.mock('@/services/eventEmitterService', () => ({
  eventEmitterService: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));
vi.mock('@/platform/fathom', () => ({
  sanitizePath: vi.fn((path: string) => path),
  analytics: { track: vi.fn().mockResolvedValue(undefined), page: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/platform/walletManager', () => ({ walletManager: {} }));

const ADDRESS = 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty';
vi.mock('@/services/walletService', () => ({
  getWalletService: () => ({
    isKeychainUnlocked: async () => true,
    getActiveAddress: async () => ({ address: ADDRESS, pubKey: '02aa' }),
    getActiveWallet: async () => ({ id: 'wallet1', type: 'mnemonic', addressFormat: 'p2wpkh' }),
    getSettings: async () => ({ connectedWebsites: [], providerCapabilities: {} }),
  }),
}));

const connection = vi.hoisted(() => ({ instance: null as unknown }));
vi.mock('@/services/connectionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/connectionService')>();
  return { ...actual, getConnectionService: () => connection.instance };
});

import { ConnectionService } from '../connectionService';
import { createProviderService } from '../providerService';

let originCounter = 0;

describe('connect rate limiting', () => {
  let provider: ReturnType<typeof createProviderService>;
  let service: ConnectionService;
  let origin: string;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeBrowser.reset();
    // The limiter is a module singleton; a fresh origin per test is a fresh budget.
    origin = `https://dapp${++originCounter}.example`;
    service = new ConnectionService();
    connection.instance = service;
    provider = createProviderService();
    approval.requestApproval.mockResolvedValue({ approved: false });
  });

  const connect = () => provider.handleRequest(origin, 'xcp_requestAccounts', []).catch((e: unknown) => e);

  it('reaches the approval screen for every connect the limit allows', async () => {
    // 5 per minute: each one the user declines is still a 4001, never a rate-limit error.
    for (let i = 0; i < 5; i++) {
      const error = await connect();
      expect(classifyProviderError(error), `connect ${i + 1}`).toEqual({ code: 4001, message: 'User denied the request' });
    }
    expect(approval.requestApproval).toHaveBeenCalledTimes(5);
  });

  it('refuses the connect past the limit with -32005, before any approval opens', async () => {
    for (let i = 0; i < 5; i++) await connect();
    approval.requestApproval.mockClear();

    const refused = classifyProviderError(await connect());

    expect(refused.code).toBe(-32005);
    expect(refused.message).toMatch(/Please wait \d+ seconds/);
    expect(approval.requestApproval).not.toHaveBeenCalled();
  });

  it('charges one slot per connect', async () => {
    await connect();

    expect(connectionRateLimiter.getRemainingRequests(origin)).toBe(4);
  });

  it('opens one approval for two concurrent connects and refuses the second with a readable code', async () => {
    let decide!: (value: { approved: boolean }) => void;
    approval.requestApproval.mockReturnValueOnce(new Promise(resolve => { decide = resolve; }));

    const first = service.requestPermission(origin, ADDRESS, 'wallet1');
    const second = service.requestPermission(origin, ADDRESS, 'wallet1');
    const secondError = await second.catch((e: unknown) => e);

    expect(classifyProviderError(secondError).code).toBe(-32005);
    await vi.waitFor(() => expect(approval.requestApproval).toHaveBeenCalledTimes(1));
    decide({ approved: true });
    await expect(first).resolves.toEqual({ approved: true });

    // Once the first is answered the origin may ask again.
    approval.requestApproval.mockResolvedValueOnce({ approved: true });
    await expect(service.requestPermission(origin, ADDRESS, 'wallet1')).resolves.toEqual({ approved: true });
  });

  it('releases the de-dup key when the approval fails', async () => {
    approval.requestApproval.mockRejectedValueOnce(new Error('boom'));
    await expect(service.requestPermission(origin, ADDRESS, 'wallet1')).rejects.toThrow('boom');

    approval.requestApproval.mockResolvedValueOnce({ approved: true });
    await expect(service.requestPermission(origin, ADDRESS, 'wallet1')).resolves.toEqual({ approved: true });
  });
});
