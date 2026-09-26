import './setup'; // Must be first to setup browser mocks
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { clearReplayPreventionData, getTransactionStats } from '@/core/replayPrevention';
import { classifyProviderError } from '@/core/rpcErrors';
import { getConnectionService } from '../connectionService';
import { createProviderService } from '../providerService';
import { getWalletService } from '../walletService';

/**
 * A failed dApp broadcast must not lock the site out of retrying the same transaction.
 *
 * Unlike providerService.test.ts, replay prevention is the real module here: the defect lived in
 * how the service and that module interact (a record left 'pending' forever), which a mock of the
 * module cannot show.
 */

vi.mock('../walletService');
vi.mock('../connectionService');
vi.mock('../approvalService');
vi.mock('@/platform/walletManager', () => ({
  walletManager: {
    getSettings: vi.fn().mockReturnValue({
      connectedWebsites: [],
      analyticsAllowed: true,
      counterpartyApiBase: 'https://api.counterparty.io',
    }),
    updateSettings: vi.fn(),
  },
}));
vi.mock('@/platform/provider/rateLimiter', () => {
  const allow = { isAllowed: () => true, getResetTime: () => 0, reset: () => {} };
  return { apiRateLimiter: allow, connectionRateLimiter: allow, signPopupRateLimiter: allow, transactionRateLimiter: allow };
});
vi.mock('@/platform/provider/recentBroadcasts', () => ({
  rememberSuccessfulBroadcast: vi.fn().mockResolvedValue(undefined),
}));

const ORIGIN = 'https://dapp.example';
const SIGNED_TX = '0200000001' + '00'.repeat(40);
const TXID = 'ab'.repeat(32);

describe('xcp_broadcastTransaction retry after a failure', () => {
  let broadcast: ReturnType<typeof vi.fn>;
  let provider: ReturnType<typeof createProviderService>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeBrowser.reset();
    clearReplayPreventionData();
    broadcast = vi.fn();
    vi.mocked(getWalletService).mockReturnValue({ broadcastTransaction: broadcast } as never);
    vi.mocked(getConnectionService).mockReturnValue({
      hasPermission: vi.fn().mockResolvedValue(true),
    } as never);
    provider = createProviderService();
  });

  const send = () => provider.handleRequest(ORIGIN, 'xcp_broadcastTransaction', [SIGNED_TX]);

  it('lets the site resend the same transaction after the broadcast failed', async () => {
    broadcast.mockRejectedValueOnce(new Error('Failed to broadcast transaction on all endpoints'));
    broadcast.mockResolvedValueOnce({ txid: TXID });

    await expect(send()).rejects.toThrow('Failed to broadcast');
    await expect(send()).resolves.toEqual({ txid: TXID });
    expect(broadcast).toHaveBeenCalledTimes(2);
  });

  it('records the failed attempt as failed, not pending', async () => {
    broadcast.mockRejectedValueOnce(new Error('network down'));

    await expect(send()).rejects.toThrow('network down');

    expect(getTransactionStats()).toMatchObject({ pending: 0, failed: 1 });
  });

  it('keeps the broadcast error as the answer, not a masked replay error on retry', async () => {
    broadcast.mockRejectedValue(new Error('network down'));

    await expect(send()).rejects.toThrow('network down');
    // The second attempt reaches the node again instead of being refused as a replay.
    await expect(send()).rejects.toThrow('network down');
    expect(broadcast).toHaveBeenCalledTimes(2);
  });

  it('still refuses to resend a transaction that was broadcast', async () => {
    broadcast.mockResolvedValue({ txid: TXID });

    await expect(send()).resolves.toEqual({ txid: TXID });
    const replay: Error = await send().catch((error: Error) => error) as Error;

    expect(replay).toBeInstanceOf(Error);
    expect(String(replay.message)).toMatch(/replay/i);
    expect(broadcast).toHaveBeenCalledTimes(1);
    // Unchanged behaviour: the replay refusal is not a new surfaced code.
    expect(classifyProviderError(replay).code).toBe(-32603);
  });

  it('refuses a concurrent duplicate while the first attempt is still in flight', async () => {
    let finish!: (value: { txid: string }) => void;
    broadcast.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));

    const first = send();
    await vi.waitFor(() => expect(broadcast).toHaveBeenCalledTimes(1));
    await expect(send()).rejects.toThrow(/replay/i);
    finish({ txid: TXID });
    await expect(first).resolves.toEqual({ txid: TXID });
  });
});
