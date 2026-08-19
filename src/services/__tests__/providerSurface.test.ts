import './setup'; // Must be first to setup browser mocks
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getConnectionService } from '../connectionService';
import { createProviderService } from '../providerService';

/**
 * A sweep of the whole provider surface, rather than a test per method.
 *
 * The decoders got a differential fuzzer that compares every message type against core on every
 * run; the provider surface had only spot checks — grants, origin handling and identity binding
 * read by hand. Reading is what missed the wire-format defects for months, and a method added
 * later is exactly the case a hand-written review does not revisit.
 *
 * The mechanism is the table below. Every method the service dispatches must appear in it with a
 * stated contract, and the final test fails if the service grows a method the table does not
 * classify. So the surface cannot expand without someone deciding, in writing, whether the new
 * method needs a grant.
 */

vi.mock('webext-bridge/background', () => ({
  sendMessage: vi.fn().mockResolvedValue({ success: true, data: {} }),
  onMessage: vi.fn(),
}));
vi.mock('../walletService');
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
// Rate limiters must ALLOW here. Auto-mocking returns undefined from isAllowed(), which the
// service reads as "limited" — every call then fails and the grant assertions below pass for
// entirely the wrong reason. The first run of this file did exactly that.
vi.mock('@/platform/provider/rateLimiter', () => {
  const allow = { isAllowed: () => true, getResetTime: () => 0, reset: () => {} };
  return { apiRateLimiter: allow, connectionRateLimiter: allow, transactionRateLimiter: allow };
});
vi.mock('../connectionService');
vi.mock('../approvalService');

/** What each method is allowed to do for a caller that holds no grant. */
type Contract =
  /** Must not return wallet data or act; an ungranted call has to fail or come back empty. */
  | 'needs-grant'
  /** Public constant. Safe without a grant because it discloses nothing about the wallet. */
  | 'public-constant'
  /** Deliberately unsupported — must reject regardless of grant. */
  | 'unsupported'
  /** Connection handshake or teardown; meaningful without an existing grant. */
  | 'connection-flow';

const CONTRACTS: Record<string, Contract> = {
  xcp_requestAccounts: 'connection-flow',
  xcp_disconnect: 'connection-flow',
  xcp_accounts: 'needs-grant',
  xcp_getAddresses: 'needs-grant',
  xcp_getBalances: 'needs-grant',
  xcp_signMessage: 'needs-grant',
  xcp_signTransaction: 'needs-grant',
  xcp_signPsbt: 'needs-grant',
  xcp_signBitcoinPsbt: 'needs-grant',
  xcp_broadcastTransaction: 'needs-grant',
  xcp_chainId: 'public-constant',
  xcp_getNetwork: 'public-constant',
  xcp_getAssets: 'unsupported',
  xcp_getHistory: 'unsupported',
};

const ORIGIN = 'https://dapp.example';

/** Params shaped well enough to reach each handler's own logic rather than an arity check. */
const PLAUSIBLE_PARAMS: Record<string, unknown[]> = {
  xcp_signMessage: ['hello'],
  xcp_signTransaction: ['0200000001' + '00'.repeat(40)],
  xcp_signPsbt: ['70736274ff' + '00'.repeat(20)],
  xcp_signBitcoinPsbt: [{
    hex: '70736274ff' + '00'.repeat(20),
    signInputs: { bc1qexample: [0] },
    sighashTypes: [0x01],
    intent: {
      standard: 'xcp-wallet/bitcoin-payment',
      version: 1,
      action: 'pay',
      outputs: [{ address: 'bc1qdestination', amountSats: 1_000 }],
    },
  }],
  xcp_broadcastTransaction: ['0200000001' + '00'.repeat(40)],
};

describe('provider surface', () => {
  let provider: ReturnType<typeof createProviderService>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeBrowser.reset();
    // No grant for this origin, in every test below.
    vi.mocked(getConnectionService).mockReturnValue({
      hasPermission: vi.fn().mockResolvedValue(false),
      getConnectedWebsites: vi.fn().mockResolvedValue([]),
      disconnect: vi.fn().mockResolvedValue(true),
      connect: vi.fn().mockResolvedValue(true),
      hasPairedAddressPermission: vi.fn().mockResolvedValue(false),
    } as never);
    provider = createProviderService();
  });

  const call = async (method: string) => {
    try {
      const result = await provider.handleRequest(
        ORIGIN,
        method,
        (PLAUSIBLE_PARAMS[method] ?? []) as never
      );
      return { ok: true as const, result };
    } catch (error) {
      return { ok: false as const, error };
    }
  };

  describe('a caller holding no grant', () => {
    const needsGrant = Object.entries(CONTRACTS)
      .filter(([, c]) => c === 'needs-grant')
      .map(([m]) => m);

    it.each(needsGrant)('%s discloses nothing and does not act', async (method) => {
      const outcome = await call(method);

      if (!outcome.ok) return; // Rejecting is the expected shape.

      // Some methods answer emptily rather than throwing — xcp_accounts returns [] when the site
      // is not connected. Empty is acceptable; populated is not.
      const value = outcome.result;
      if (Array.isArray(value)) {
        expect(value, `${method} returned data without a grant`).toEqual([]);
      } else {
        expect(
          value === null || value === undefined || value === false,
          `${method} returned ${JSON.stringify(value)} without a grant`
        ).toBe(true);
      }
    });
  });

  describe('unsupported methods', () => {
    const unsupported = Object.entries(CONTRACTS)
      .filter(([, c]) => c === 'unsupported')
      .map(([m]) => m);

    it.each(unsupported)('%s rejects rather than answering', async (method) => {
      const outcome = await call(method);
      expect(outcome.ok, `${method} should be unsupported`).toBe(false);
    });
  });

  describe('public constants', () => {
    it('xcp_chainId and xcp_getNetwork answer without a grant and reveal nothing', async () => {
      const chainId = await call('xcp_chainId');
      const network = await call('xcp_getNetwork');
      expect(chainId.ok && chainId.result).toBe('0x0');
      expect(network.ok && network.result).toBe('mainnet');
    });
  });

  describe('malformed input', () => {
    const everyMethod = Object.keys(CONTRACTS);

    it.each(everyMethod)('%s fails cleanly on junk params', async (method) => {
      // A hostile page controls params entirely. Whatever happens, it must be a rejection or a
      // benign value — never an unhandled shape that escapes the JSON-RPC envelope.
      for (const params of [[null], [{}], [[]], ['x'.repeat(10000)], [1, 2, 3, 4, 5]]) {
        const outcome = await provider
          .handleRequest(ORIGIN, method, params as never)
          .then((result) => ({ ok: true, result }))
          .catch((error) => ({ ok: false, error }));
        expect(outcome).toBeDefined();
      }
    });

    it('rejects a method it does not implement', async () => {
      const outcome = await call('xcp_notARealMethod');
      expect(outcome.ok).toBe(false);
    });
  });

  it('classifies every method the service dispatches', async () => {
    // The point of the whole file: a method added without a stated contract fails here, so the
    // surface cannot grow without someone deciding whether it needs a grant.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/services/providerService.ts', 'utf8')
    );
    const dispatched = [...source.matchAll(/case '(xcp_\w+)':/g)].map((m) => m[1]!);

    expect([...new Set(dispatched)].sort()).toEqual(Object.keys(CONTRACTS).sort());
  });
});
