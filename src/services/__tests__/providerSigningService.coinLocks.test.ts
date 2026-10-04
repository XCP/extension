/**
 * The signing service and the wallet's locked coins: a site's request to sign a locked coin asks
 * first, confirming unlocks it once the signature is made, and a proved offer signature locks what
 * it commits before the site hears of it. Decoders are stubbed; marketplaceBundleProofs.integration
 * runs the same path over real PSBTs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { CoinLock, CoinLockUpdate, OfferCoinCommitment } from '@/types/coinLocks';

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

import { parseCancelOffersIntent, withCancelledOfferCoinLocks } from '@/core/bitcoin/offerCancellation';
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
    emittedBeforeCommit: -1, emittedBeforeUpdate: -1,
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
    mocks.wallet.signMessage.mockResolvedValue({ signature: 'signed-message', address: identity.address });
    mocks.permissions.hasPermission.mockResolvedValue(true);
    mocks.permissions.hasPairedAddressPermission.mockResolvedValue(true);
    mocks.decodePsbt.mockImplementation(async () => decoded());
    store.locks = []; store.updates = []; store.commits = [];
    setCoinLockStore({
      read: async () => store.locks,
      update: async (_address, update) => {
        store.updates.push(update);
        store.emittedBeforeUpdate = mocks.emit.mock.calls.length;
      },
      commit: async (address, commitments) => {
        store.commits.push([address, commitments]);
        store.emittedBeforeCommit = mocks.emit.mock.calls.length;
      },
      cancelOffers: async (address, origin, intent) => {
        store.emittedBeforeUpdate = mocks.emit.mock.calls.length;
        store.locks = withCancelledOfferCoinLocks(store.locks, address, origin, intent) ?? store.locks;
      },
    });
    service = createProviderSigningService();
  });
  afterEach(() => { setCoinLockStore(null); vi.unstubAllGlobals(); });

  const lockWarnings = (review: Awaited<ReturnType<typeof service.getReview>>) =>
    review.kind === 'sign-psbt' || review.kind === 'sign-transaction'
      ? review.decodedInfo.safety.warnings.filter(warning => warning.code === 'locked_coin_spend')
      : [];

  const cancellation = (): NewSignFlow => ({
    ...identity, id: 'cancel-1', origin: SITE, timestamp: Date.now(), requestKey: 'cancel-key',
    kind: 'sign-message', message: 'Original cancellation bytes',
    cancelOffersIntent: parseCancelOffersIntent({ standard: 'counterparty-marketplace', action: 'cancel_offers',
      offerIds: ['auth-1'], coins: [{ outpoint: SLOT, stillCommitted: false }] })!,
  });

  it.each(['offer', 'cancellation'] as const)('withholds recovery until the %s lock write finishes', async kind => {
    const writing = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const waitForWrite = async () => { writing.resolve(); await release.promise; };
    setCoinLockStore({ read: async () => store.locks, update: async () => {},
      commit: waitForWrite, cancelOffers: waitForWrite });
    mocks.decodePsbt.mockImplementation(async () => decoded({ status: 'proved' }));
    const request = kind === 'offer' ? psbtRequest({ marketplaceIntent: authorize as never }) : cancellation();
    await beginSignFlow(request);
    const review = await service.getReview(request.id);
    const operation = service.approveAndSign(request.id, { reviewKey: review.reviewKey, risksAcknowledged: true });
    await writing.promise;
    try {
      const flow = await getSignFlow(request.id);
      expect(flow?.status).toBe('finalizing');
      expect(flow).not.toHaveProperty('result');
      expect(mocks.emit).not.toHaveBeenCalled();
      // A second click or a reopened popup cannot sign again or cancel the reserved completion.
      await service.reject(request.id);
      expect((await getSignFlow(request.id))?.status).toBe('finalizing');
      await expect(createProviderSigningService().approveAndSign(request.id, {
        reviewKey: review.reviewKey, risksAcknowledged: true,
      })).rejects.toThrow();
    } finally {
      release.resolve();
      await operation;
    }
    expect((await getSignFlow(request.id))?.status).toBe('completed');
    expect(kind === 'offer' ? mocks.wallet.signPsbt : mocks.wallet.signMessage).toHaveBeenCalledTimes(1);
  });

  it('withholds an offer signature when its funding locks cannot be saved', async () => {
    setCoinLockStore({ read: async () => [], update: async () => {},
      commit: async () => { throw new Error('Coin lock limit reached'); } });
    mocks.decodePsbt.mockImplementation(async () => decoded({ status: 'proved' }));
    await beginSignFlow(psbtRequest({ marketplaceIntent: authorize as never }));
    const review = await service.getReview('req-1');
    await expect(service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: true }))
      .rejects.toThrow('Coin lock limit reached');
    const flow = await getSignFlow('req-1');
    expect(flow?.status).toBe('cancelled');
    expect(flow).not.toHaveProperty('result');
    expect(mocks.emit).not.toHaveBeenCalledWith('sign-psbt-complete-req-1', expect.anything());
  });

  it('reviews and releases a cancelled offer only after signing the unchanged message and before delivery', async () => {
    store.locks = [lock()];
    await beginSignFlow(cancellation());
    const review = await service.getReview('cancel-1');
    expect(review).toMatchObject({ cancellationCoins: [{ outpoint: SLOT_OUTPOINT, effect: 'unlocks' }] });
    mocks.wallet.signMessage.mockImplementationOnce(async () => {
      expect(store.locks).toHaveLength(1);
      return { signature: 'signed-message', address: identity.address };
    });
    await service.approveAndSign('cancel-1', { reviewKey: review.reviewKey, risksAcknowledged: false });
    expect(mocks.wallet.signMessage).toHaveBeenCalledWith('Original cancellation bytes', identity.address, identity);
    expect(store.locks).toEqual([]);
    expect(store.emittedBeforeUpdate).toBe(0);
    expect(mocks.emit).toHaveBeenCalledWith('sign-message-complete-cancel-1', { signature: 'signed-message' });
  });

  it.each(['decline', 'error', 'interrupt'] as const)('keeps cancellation locks on %s', async outcome => {
    store.locks = [lock()];
    await beginSignFlow(cancellation());
    const review = await service.getReview('cancel-1');
    if (outcome === 'decline') await service.reject('cancel-1');
    else {
      mocks.wallet.signMessage.mockImplementationOnce(async () => {
        if (outcome === 'error') throw new Error('Device declined');
        await service.reject('cancel-1');
        return { signature: 'signed-message', address: identity.address };
      });
      await expect(service.approveAndSign('cancel-1', { reviewKey: review.reviewKey, risksAcknowledged: false })).rejects.toThrow();
    }
    expect(store.locks).toEqual([lock()]);
    expect(mocks.emit).not.toHaveBeenCalledWith('sign-message-complete-cancel-1', expect.anything());
  });

  it('requires a fresh review if a cancellation coin becomes hand-locked', async () => {
    store.locks = [lock()];
    await beginSignFlow(cancellation());
    const review = await service.getReview('cancel-1');
    store.locks = [lock({ manual: true })];
    await expect(service.approveAndSign('cancel-1', { reviewKey: review.reviewKey, risksAcknowledged: false })).rejects.toThrow(/review changed/);
    expect(mocks.wallet.signMessage).not.toHaveBeenCalled();
  });

  it('preserves a hand lock created while the cancellation signature is in flight', async () => {
    store.locks = [lock()];
    await beginSignFlow(cancellation());
    const review = await service.getReview('cancel-1');
    mocks.wallet.signMessage.mockImplementationOnce(async () => {
      store.locks = [lock({ manual: true })];
      return { signature: 'signed-message', address: identity.address };
    });
    await service.approveAndSign('cancel-1', { reviewKey: review.reviewKey, risksAcknowledged: false });
    expect(store.locks).toEqual([lock({ manual: true })]);
  });

  it('asks before signing a locked coin, and unlocks it after the signature, before the site hears', async () => {
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

    let unlockedBeforeSigning = true;
    mocks.wallet.signPsbt.mockImplementation(async () => {
      unlockedBeforeSigning = store.updates.length > 0;
      return 'signed-psbt';
    });
    await service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: true });
    expect(mocks.wallet.signPsbt).toHaveBeenCalledWith('psbt', { [identity.address]: [0] }, undefined, identity, { approvedCoinLocks: [lock()] });
    expect(store.updates).toEqual([{ unlock: [SLOT_OUTPOINT] }]);
    expect(unlockedBeforeSigning).toBe(false);
    expect(store.emittedBeforeUpdate).toBe(0);
    expect(mocks.emit).toHaveBeenCalledWith('sign-psbt-complete-req-1', { signedPsbtHex: 'signed-psbt' });
  });

  it('keeps the lock when signing fails after "Unlock and sign", or the flow is interrupted mid-signature', async () => {
    store.locks = [lock()];
    await beginSignFlow(psbtRequest());
    const review = await service.getReview('req-1');
    mocks.wallet.signPsbt.mockRejectedValueOnce(new Error('device rejected'));
    await expect(service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: true }))
      .rejects.toThrow('device rejected');
    expect(store.updates).toEqual([]);

    await beginSignFlow(psbtRequest({ id: 'req-2' }));
    const second = await service.getReview('req-2');
    // The wallet locks (or the request is cancelled) while the key is busy.
    mocks.wallet.signPsbt.mockImplementationOnce(async () => {
      await service.reject('req-2');
      return 'signed-psbt';
    });
    await expect(service.approveAndSign('req-2', { reviewKey: second.reviewKey, risksAcknowledged: true })).rejects.toThrow();
    expect(store.updates).toEqual([]);
    expect(mocks.emit).not.toHaveBeenCalledWith('sign-psbt-complete-req-2', expect.anything());
  });

  it('lets the slot\'s own site authorize an offer on it without asking, and adds that offer to the lock', async () => {
    store.locks = [lock()];
    mocks.decodePsbt.mockImplementation(async () => decoded({ status: 'proved' }));
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

  it('asks when the site that locked the slot sends an authorization its review did not prove', async () => {
    store.locks = [lock()];
    for (const [id, status] of [['req-caution', 'caution'], ['req-retry', 'retry'], ['req-blocked', 'blocked'], ['req-none', undefined]] as const) {
      mocks.decodePsbt.mockImplementation(async () => decoded(status ? { status } : undefined));
      await beginSignFlow(psbtRequest({ id, marketplaceIntent: authorize as never }));
      expect(lockWarnings(await service.getReview(id))).toEqual([expect.objectContaining({ title: 'Spends a locked coin' })]);
    }
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

  it('keeps the review when a read only restamps when a locked coin was seen', async () => {
    const other = lock({ outpoint: `${'b'.repeat(64)}:1`, kind: 'manual', manual: true, refs: [], origin: null });
    store.locks = [lock(), other];
    await beginSignFlow(psbtRequest());
    const review = await service.getReview('req-1');
    // A balance load, Max or Coin Control refresh, and an outspend check that missed the coin.
    store.locks = [lock({ seenAt: 5_000 }), { ...other, seenAt: null, candidateSince: 6_000 }];
    expect((await service.getReview('req-1')).reviewKey).toBe(review.reviewKey);
    await service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: true });
    expect(mocks.wallet.signPsbt).toHaveBeenCalledOnce();
    expect(mocks.emit).toHaveBeenCalledWith('sign-psbt-complete-req-1', { signedPsbtHex: 'signed-psbt' });
  });

  it.each([
    ['added', [lock(), lock({ outpoint: `${'b'.repeat(64)}:1` })]],
    ['removed', []],
    ['unlocked', [lock({ unlocked: true })]],
    ['hand-locked too', [lock({ manual: true })]],
    ['backing another offer', [lock({ refs: ['auth-1', 'auth-3'] })]],
    ['given a new expiry', [lock({ expiresAt: 2_000_000_000 })]],
  ])('changes the review when a lock is %s', async (_name, locks) => {
    store.locks = [lock()];
    await beginSignFlow(psbtRequest());
    const review = await service.getReview('req-1');
    store.locks = locks;
    expect((await service.getReview('req-1')).reviewKey).not.toBe(review.reviewKey);
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
