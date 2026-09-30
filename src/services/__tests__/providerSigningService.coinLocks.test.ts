/**
 * The signing service and the wallet's locked coins: a site's request to sign a locked coin asks
 * first, confirming unlocks it before any key is used, and a proved offer signature locks what it
 * commits before the site hears of it. Decoders are stubbed; marketplaceBundleProofs.integration
 * runs the same path over real PSBTs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

const mocks = vi.hoisted(() => ({
  currentSettings: vi.fn(), currentWallet: vi.fn(),
  wallet: {
    isKeychainUnlocked: vi.fn(), getActiveWallet: vi.fn(), getActiveAddress: vi.fn(),
    getSettings: vi.fn(), getPairedAddresses: vi.fn(), signMessage: vi.fn(),
    signTransaction: vi.fn(), signPsbt: vi.fn(),
  },
  permissions: { hasPermission: vi.fn(), hasPairedAddressPermission: vi.fn() },
  emit: vi.fn(), decodePsbt: vi.fn(), decodeTransaction: vi.fn(), decodeBundle: vi.fn(),
  extractPsbtDetails: vi.fn(),
}));
vi.mock('@/platform/auth/sessionManager', () => ({
  getSessionGeneration: () => 0,
  assertSessionGeneration: () => {},
}));
vi.mock('@/services/walletService', () => ({ getWalletService: () => mocks.wallet }));
vi.mock('@/platform/walletManager', () => ({ walletManager: {
  getSettings: mocks.currentSettings, getActiveWallet: mocks.currentWallet,
} }));
vi.mock('@/services/connectionService', () => ({ getConnectionService: () => mocks.permissions }));
vi.mock('@/services/eventEmitterService', () => ({ eventEmitterService: { emit: mocks.emit } }));
vi.mock('@/core/bitcoin/feeRate', () => ({ getFeeRates: async () => ({ fastestFee: 10 }) }));
vi.mock('@/core/bitcoin/psbtApprovalDecoder', () => ({ decodePsbtForApproval: mocks.decodePsbt }));
vi.mock('@/core/bitcoin/transactionApprovalDecoder', () => ({ decodeTransactionForApproval: mocks.decodeTransaction }));
vi.mock('@/core/bitcoin/psbtBundleApprovalDecoder', () => ({ decodePsbtBundleForApproval: mocks.decodeBundle }));
vi.mock('@/core/bitcoin/psbt', async importOriginal => ({
  ...await importOriginal<typeof import('@/core/bitcoin/psbt')>(),
  extractPsbtDetails: mocks.extractPsbtDetails,
}));

import { setCoinLockStore } from '@/core/bitcoin/coinLockStore';
import type { CoinLock, CoinLockUpdate, OfferCoinCommitment } from '@/core/bitcoin/coinLocks';
import { beginSignFlow, getSignFlow, type NewSignFlow } from '@/platform/provider/signFlow';
import { createProviderSigningService } from '../providerSigningService';

const SITE = 'https://example.test';
const identity = { walletId: 'wallet-1', address: 'bc1qauthorized' };
const SLOT = { txid: 'a'.repeat(64), vout: 0 };
const SLOT_OUTPOINT = `${SLOT.txid}:${SLOT.vout}`;

const lock = (extra: Partial<CoinLock> = {}): CoinLock => ({
  outpoint: SLOT_OUTPOINT, address: identity.address, kind: 'offer_slot', manual: false, refs: ['auth-1'],
  valueSats: 20_000, origin: SITE, expiresAt: null, createdAt: 1, seenAt: 1, unlocked: false, ...extra,
});
const authorize = { action: 'authorize_exact_offer', authorizationId: 'auth-2', marketplaceExpiresAt: 2_000_000_000,
  bitcoinInvalidation: { type: 'spend_funding_outpoint', outpoint: SLOT } };
const psbtRequest = (extra: Partial<NewSignFlow> = {}): NewSignFlow => ({
  ...identity, id: 'req-1', origin: SITE, timestamp: Date.now(), requestKey: 'key',
  kind: 'sign-psbt', psbtHex: 'psbt', signInputs: { [identity.address]: [0] }, ...extra,
} as NewSignFlow);
const decoded = (marketplaceReview?: { status: string }) => ({
  verification: { passed: true, repackProved: true }, safety: { blocked: false, warnings: [] },
  attachedAssets: [], structureFindings: [], attachedAssetDestination: null,
  ...(marketplaceReview ? { marketplaceReview: { ...marketplaceReview, family: 'authorize_exact_offer', notices: [], blockers: [], facts: [] } } : {}),
  psbtDetails: {
    transactionId: 'd'.repeat(64),
    inputs: [{ index: 0, ...SLOT, address: identity.address, value: 20_000, scriptType: 'p2wpkh' }],
    outputs: [{ index: 0, address: identity.address, value: 19_000, type: 'p2wpkh' }],
    fee: 1000, rawTxHex: '00'.repeat(100),
  },
});

describe('provider signing with locked coins', () => {
  let service: ReturnType<typeof createProviderSigningService>;
  const store = {
    locks: [] as CoinLock[], updates: [] as CoinLockUpdate[], commits: [] as Array<[string, OfferCoinCommitment[]]>,
    emittedBeforeCommit: -1,
  };

  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal('chrome', fakeBrowser);
    vi.clearAllMocks();
    mocks.currentSettings.mockReturnValue({ connectedWebsites: [SITE], providerCapabilities: {} });
    mocks.currentWallet.mockReturnValue({ id: identity.walletId, addresses: [{ address: identity.address }] });
    mocks.extractPsbtDetails.mockImplementation(() => ({ inputs: [{ index: 0, address: identity.address }], outputs: [] }));
    mocks.wallet.isKeychainUnlocked.mockResolvedValue(true);
    mocks.wallet.getActiveAddress.mockResolvedValue({ address: identity.address });
    mocks.wallet.getActiveWallet.mockResolvedValue({ id: identity.walletId, type: 'privateKey', addressFormat: 'p2wpkh' });
    mocks.wallet.getSettings.mockResolvedValue({ strictTransactionVerification: true });
    mocks.wallet.signPsbt.mockResolvedValue('signed-psbt');
    mocks.wallet.signTransaction.mockResolvedValue('signed-transaction');
    mocks.permissions.hasPermission.mockResolvedValue(true);
    mocks.permissions.hasPairedAddressPermission.mockResolvedValue(true);
    mocks.decodePsbt.mockImplementation(async () => decoded());
    store.locks = []; store.updates = []; store.commits = [];
    setCoinLockStore({
      read: async () => store.locks,
      update: async (_address, update) => { store.updates.push(update); },
      commit: async (address, commitments) => {
        store.commits.push([address, commitments]);
        store.emittedBeforeCommit = mocks.emit.mock.calls.length;
      },
    });
    service = createProviderSigningService();
  });
  afterEach(() => { setCoinLockStore(null); vi.unstubAllGlobals(); });

  const lockWarnings = (review: Awaited<ReturnType<typeof service.getReview>>) =>
    review.kind === 'sign-psbt' || review.kind === 'sign-transaction'
      ? review.decodedInfo.safety.warnings.filter(warning => warning.code === 'locked_coin_spend')
      : [];

  it('asks before signing a locked coin, and unlocking comes before the signature', async () => {
    store.locks = [lock()];
    await beginSignFlow(psbtRequest());
    const review = await service.getReview('req-1');
    expect(review.policy.requiresAcknowledgement).toBe(true);
    expect(lockWarnings(review)).toEqual([expect.objectContaining({
      severity: 'warning',
      data: { coins: [{ outpoint: SLOT_OUTPOINT, address: identity.address, kind: 'offer_slot', manual: false, offers: 1, valueSats: 20_000 }] },
    })]);

    await expect(service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: false }))
      .rejects.toThrow(/acknowledge/);
    expect(store.updates).toEqual([]);

    let unlockedBeforeSigning = false;
    mocks.wallet.signPsbt.mockImplementation(async () => {
      unlockedBeforeSigning = store.updates.length === 1;
      return 'signed-psbt';
    });
    await service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: true });
    expect(store.updates).toEqual([{ unlock: [SLOT_OUTPOINT] }]);
    expect(unlockedBeforeSigning).toBe(true);
    expect(mocks.emit).toHaveBeenCalledWith('sign-psbt-complete-req-1', { signedPsbtHex: 'signed-psbt' });
  });

  it('lets the slot\'s own site authorize an offer on it without asking, and adds that offer to the lock', async () => {
    store.locks = [lock()];
    mocks.decodePsbt.mockImplementation(async () => decoded({ status: 'caution' }));
    await beginSignFlow(psbtRequest({ marketplaceIntent: authorize as never }));
    const review = await service.getReview('req-1');
    expect(lockWarnings(review)).toEqual([]);
    await service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: false });
    expect(store.updates).toEqual([]);
    expect(store.commits).toEqual([[identity.address, [{
      outpoint: SLOT_OUTPOINT, kind: 'offer_slot', refs: ['auth-2'], valueSats: 20_000, origin: SITE, expiresAt: 2_000_000_000,
    }]]]);
    // Locked before the site is told.
    expect(store.emittedBeforeCommit).toBe(0);
    expect(mocks.emit).toHaveBeenCalledWith('sign-psbt-complete-req-1', { signedPsbtHex: 'signed-psbt' });
  });

  it('asks when another site authorizes an offer on the slot, or the user also locked it', async () => {
    mocks.decodePsbt.mockImplementation(async () => decoded({ status: 'caution' }));
    for (const locked of [lock({ origin: 'https://other.example' }), lock({ manual: true })]) {
      store.locks = [locked];
      await beginSignFlow(psbtRequest({ id: `req-${locked.origin}-${locked.manual}`, marketplaceIntent: authorize as never }));
      expect(lockWarnings(await service.getReview(`req-${locked.origin}-${locked.manual}`))).toHaveLength(1);
    }
  });

  it('refuses a click once a lock appeared after the review was shown', async () => {
    await beginSignFlow(psbtRequest());
    const review = await service.getReview('req-1');
    expect(review.policy.requiresAcknowledgement).toBe(false);
    store.locks = [lock({ kind: 'manual', manual: true, refs: [], origin: null })];
    await expect(service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: false }))
      .rejects.toThrow(/review changed/);
    expect(mocks.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('writes nothing when the request is declined', async () => {
    store.locks = [lock()];
    mocks.decodePsbt.mockImplementation(async () => decoded({ status: 'caution' }));
    await beginSignFlow(psbtRequest({ marketplaceIntent: authorize as never }));
    await service.getReview('req-1');
    await service.reject('req-1');
    expect(await getSignFlow('req-1')).toMatchObject({ status: 'cancelled' });
    expect(store.updates).toEqual([]);
    expect(store.commits).toEqual([]);
  });

  it('asks before a raw transaction spends a locked coin', async () => {
    store.locks = [lock({ kind: 'manual', manual: true, refs: [], origin: null })];
    mocks.decodeTransaction.mockImplementation(async () => ({
      ...decoded(), txid: 'tx', inputs: [{ ...SLOT, address: identity.address, value: 20_000 }],
      outputs: [{ index: 0, address: identity.address, value: 19_000, type: 'p2wpkh' }],
      fee: 1000, vsize: 150, totalInputValue: 20_000, totalOutputValue: 19_000, hasOpReturn: false,
    }));
    await beginSignFlow(psbtRequest({ kind: 'sign-transaction', rawTxHex: 'hex' } as never));
    const review = await service.getReview('req-1');
    expect(lockWarnings(review)).toHaveLength(1);
    await service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: true });
    expect(store.updates).toEqual([{ unlock: [SLOT_OUTPOINT] }]);
  });
});
