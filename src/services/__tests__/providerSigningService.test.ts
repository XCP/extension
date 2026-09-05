import { bytesToHex } from '@noble/hashes/utils.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { movesCounterpartyValue } from '@/core/counterparty/attachedAssetMovement';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';

const mocks = vi.hoisted(() => ({
  sessionGeneration: 0,
  currentSettings: vi.fn(), currentWallet: vi.fn(),
  wallet: {
    isKeychainUnlocked: vi.fn(), getActiveWallet: vi.fn(), getActiveAddress: vi.fn(),
    getSettings: vi.fn(), getPairedAddresses: vi.fn(), signMessage: vi.fn(),
    signTransaction: vi.fn(), signPsbt: vi.fn(),
  },
  permissions: { hasPermission: vi.fn(), hasPairedAddressPermission: vi.fn() },
  emit: vi.fn(), decodePsbt: vi.fn(), decodeTransaction: vi.fn(), decodeBundle: vi.fn(),
}));
vi.mock('@/platform/auth/sessionManager', () => ({
  getSessionGeneration: () => mocks.sessionGeneration,
  assertSessionGeneration: (generation: number) => {
    if (generation !== mocks.sessionGeneration) throw new Error('Wallet session changed');
  },
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
  extractPsbtDetails: () => ({ inputs: [{ index: 0, address: 'bc1qauthorized' }], outputs: [] }),
}));

import { beginSignFlow, claimSignFlow, getSignFlow, type NewSignFlow, recordSignOutcome, SIGN_FLOW_TTL_MS, signFlowStorage } from '@/platform/provider/signFlow';
import { createProviderSigningService } from '../providerSigningService';

const identity = { walletId: 'wallet-1', address: 'bc1qauthorized' };
const request = (extra: Partial<NewSignFlow> = {}): NewSignFlow => ({
  ...identity, id: 'req-1', origin: 'https://example.test', timestamp: Date.now(),
  requestKey: 'key', kind: 'sign-message', message: 'hello', ...extra,
} as NewSignFlow);
const analysis = () => ({
  verification: { passed: true, repackProved: true }, safety: { blocked: false, warnings: [] },
  attachedAssets: [], structureFindings: [], attachedAssetDestination: null,
});
const rawDecode = () => ({
  ...analysis(), txid: 'tx', inputs: [{ txid: 'prev', vout: 0, address: identity.address, value: 20_000 }],
  outputs: [{ index: 0, address: identity.address, value: 19_000, type: 'p2wpkh' }],
  fee: 1000, vsize: 150, totalInputValue: 20_000, totalOutputValue: 19_000, hasOpReturn: true,
});

describe('background provider signing execution', () => {
  let service: ReturnType<typeof createProviderSigningService>;
  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal('chrome', fakeBrowser);
    vi.clearAllMocks();
    mocks.sessionGeneration = 0;
    mocks.currentSettings.mockReturnValue({ connectedWebsites: ['https://example.test'], providerCapabilities: {
      'https://example.test': { pairedAddresses: true, ...identity },
    } });
    mocks.currentWallet.mockReturnValue({ id: identity.walletId, addresses: [{ address: identity.address }] });
    mocks.wallet.isKeychainUnlocked.mockResolvedValue(true);
    mocks.wallet.getActiveAddress.mockResolvedValue({ address: identity.address });
    mocks.wallet.getActiveWallet.mockResolvedValue({ id: identity.walletId, type: 'privateKey', addressFormat: 'p2wpkh' });
    mocks.wallet.getSettings.mockResolvedValue({ strictTransactionVerification: true });
    mocks.wallet.signMessage.mockResolvedValue({ signature: 'signed-message', address: identity.address });
    mocks.wallet.signTransaction.mockResolvedValue('signed-transaction');
    mocks.wallet.signPsbt.mockResolvedValue('signed-psbt');
    mocks.permissions.hasPermission.mockResolvedValue(true);
    mocks.permissions.hasPairedAddressPermission.mockResolvedValue(true);
    mocks.decodeTransaction.mockImplementation(async () => rawDecode());
    mocks.decodePsbt.mockImplementation(async () => ({ ...analysis(), psbtDetails: {
      inputs: [{ index: 0, address: identity.address, value: 20_000 }],
      outputs: [{ index: 0, address: identity.address, value: 19_000, type: 'p2wpkh' }],
      fee: 1000, rawTxHex: '00'.repeat(100),
    } }));
    service = createProviderSigningService();
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function approve(acknowledged = false) {
    const review = await service.getReview('req-1');
    return service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: acknowledged });
  }

  it('signs the stored message with its bound identity and persists the outcome', async () => {
    await beginSignFlow(request());
    await approve();
    expect(mocks.wallet.signMessage).toHaveBeenCalledWith('hello', identity.address, identity);
    expect(await getSignFlow('req-1')).toMatchObject({ status: 'completed', result: { signature: 'signed-message' } });
    expect(mocks.emit).toHaveBeenCalledWith('sign-message-complete-req-1', { signature: 'signed-message' });
    await expect(approve()).rejects.toThrow(/no longer pending/);
    expect(mocks.wallet.signMessage).toHaveBeenCalledTimes(1);
  });

  it.each(['sign-transaction', 'sign-psbt'] as const)('rechecks %s policy in the background before key use', async kind => {
    await beginSignFlow(request(kind === 'sign-transaction' ? { kind, rawTxHex: 'original-hex' } : { kind, psbtHex: 'original-psbt' }));
    const review = await service.getReview('req-1');
    const blocked = { ...analysis(), safety: { blocked: true, warnings: [] } };
    if (kind === 'sign-transaction') mocks.decodeTransaction.mockResolvedValue({ ...rawDecode(), ...blocked });
    else mocks.decodePsbt.mockResolvedValue({ ...blocked, psbtDetails: { inputs: [], outputs: [], fee: 0 } });
    await expect(service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: true }))
      .rejects.toThrow(/did not pass/);
    expect(mocks.wallet.signTransaction).not.toHaveBeenCalled();
    expect(mocks.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('refuses changed review facts rather than signing a different displayed outcome', async () => {
    await beginSignFlow(request({ kind: 'sign-transaction', rawTxHex: 'hex' }));
    const review = await service.getReview('req-1');
    mocks.decodeTransaction.mockResolvedValue({ ...rawDecode(), fee: 2000 });
    await expect(service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: true }))
      .rejects.toThrow(/review changed/);
    expect(mocks.wallet.signTransaction).not.toHaveBeenCalled();
  });

  it('requires explicit acknowledgment for a high fee and then signs', async () => {
    await beginSignFlow(request({ kind: 'sign-transaction', rawTxHex: 'hex' }));
    mocks.decodeTransaction.mockResolvedValue({ ...rawDecode(), fee: 100_000 });
    await expect(approve()).rejects.toThrow(/acknowledge/);
    expect(mocks.wallet.signTransaction).not.toHaveBeenCalled();
    await approve(true);
    expect(mocks.wallet.signTransaction).toHaveBeenCalledWith('hex', identity.address, undefined, identity);
  });

  it('reviews and signs an actual locally unpacked Counterparty bigint quantity', async () => {
    const localUnpack = unpackCounterpartyMessage('434e54525052545965'
      + bytesToHex(new TextEncoder().encode('XCP|9007199254740993|0')));
    expect(localUnpack.success).toBe(true);
    expect(localUnpack.data).toMatchObject({ quantity: 9007199254740993n });
    await beginSignFlow(request({ kind: 'sign-transaction', rawTxHex: 'hex' }));
    mocks.decodeTransaction.mockResolvedValue({ ...rawDecode(), verification: {
      passed: true, repackProved: true, localUnpack,
    } });
    const review = await service.getReview('req-1');
    expect(review.reviewKey).toMatch(/^[a-f0-9]{64}$/);
    await service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: false });
    expect(mocks.wallet.signTransaction).toHaveBeenCalledTimes(1);
  });

  it('normalizes omitted inputs so an attached-asset-only request reaches the same proof and signer scope', async () => {
    await beginSignFlow(request({ kind: 'sign-psbt', psbtHex: 'original-psbt' }));
    const assets = [{ inputIndex: 0, utxo: 'prev:0',
      assets: [{ asset: 'XCP', quantity: '1', quantity_normalized: '0.00000001' }] }];
    mocks.decodePsbt.mockImplementation(async (_hex, _signers, indices: number[]) => ({
      ...analysis(), attachedAssets: assets,
      safety: { blocked: !movesCounterpartyValue(false, assets, indices), warnings: [] },
      psbtDetails: { inputs: [{ index: 0, address: identity.address, value: 20_000 }],
        outputs: [{ index: 0, address: identity.address, value: 19_000, type: 'p2wpkh' }], fee: 1000 },
    }));
    const review = await service.getReview('req-1');
    expect(review.policy.blocked).toBe(false);
    expect(review.request).toMatchObject({ signInputs: { [identity.address]: [0] } });
    await service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: true });
    expect(mocks.wallet.signPsbt).toHaveBeenCalledWith('original-psbt', { [identity.address]: [0] }, undefined, identity);
  });

  it.each(['revoked', 'identity', 'locked', 'expired'])('rejects an approval after %s state changes', async reason => {
    await beginSignFlow(request());
    const review = await service.getReview('req-1');
    if (reason === 'revoked') mocks.permissions.hasPermission.mockResolvedValue(false);
    if (reason === 'identity') mocks.wallet.getActiveAddress.mockResolvedValue({ address: 'other-address' });
    if (reason === 'locked') mocks.wallet.isKeychainUnlocked.mockResolvedValue(false);
    if (reason === 'expired') { vi.useFakeTimers(); vi.setSystemTime(Date.now() + SIGN_FLOW_TTL_MS); }
    await expect(service.approveAndSign('req-1', { reviewKey: review.reviewKey, risksAcknowledged: true })).rejects.toThrow();
    expect(mocks.wallet.signMessage).not.toHaveBeenCalled();
  });

  it('withholds the result when the grant is revoked during a signer operation', async () => {
    await beginSignFlow(request());
    mocks.wallet.signMessage.mockImplementation(async () => {
      mocks.permissions.hasPermission.mockResolvedValue(false);
      return { signature: 'must-not-be-delivered' };
    });
    await expect(approve()).rejects.toThrow(/no longer connected/);
    expect(await getSignFlow('req-1')).toMatchObject({ status: 'cancelled' });
    expect(mocks.emit).not.toHaveBeenCalledWith('sign-message-complete-req-1', expect.anything());
  });

  it.each(['revoked', 'paired', 'address', 'wallet', 'locked', 'session'] as const)(
    'retains completion but withholds its event when %s changes during terminal persistence', async state => {
      await beginSignFlow(request(state === 'paired' ? { signingAddress: 'paired-address' } : {}));
      const writing = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const update = signFlowStorage.update.bind(signFlowStorage);
      let held = false;
      vi.spyOn(signFlowStorage, 'update').mockImplementation(async (id, change) => {
        const result = await update(id, change);
        if (!held && result?.status === 'completed') {
          held = true;
          writing.resolve();
          await release.promise;
        }
        return result;
      });
      const operation = approve();
      const rejected = expect(operation).rejects.toThrow();
      await writing.promise;
      if (state === 'revoked') mocks.permissions.hasPermission.mockResolvedValue(false);
      if (state === 'paired') mocks.permissions.hasPairedAddressPermission.mockResolvedValue(false);
      if (state === 'address') mocks.wallet.getActiveAddress.mockResolvedValue({ address: 'other-address' });
      if (state === 'wallet') mocks.wallet.getActiveWallet.mockResolvedValue({ id: 'other-wallet' });
      if (state === 'locked') mocks.wallet.isKeychainUnlocked.mockResolvedValue(false);
      if (state === 'session') mocks.sessionGeneration += 1; // Locked and unlocked again, same identity.
      release.resolve();
      await rejected;
      expect(await getSignFlow('req-1')).toMatchObject({
        status: 'completed', result: { signature: 'signed-message' },
      });
      expect(mocks.emit).not.toHaveBeenCalled();
      expect(mocks.wallet.signMessage).toHaveBeenCalledTimes(1);
    },
  );

  it('checks the grant again in the caller after the authorization helper yields', async () => {
    await beginSignFlow(request());
    const granted = mocks.currentSettings();
    mocks.currentSettings.mockImplementationOnce(() => {
      queueMicrotask(() => mocks.currentSettings.mockReturnValue({
        ...granted, connectedWebsites: [], providerCapabilities: {},
      }));
      return granted;
    });

    await expect(approve()).rejects.toThrow(/no longer connected/);
    expect(await getSignFlow('req-1')).toMatchObject({
      status: 'completed', result: { signature: 'signed-message' },
    });
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.wallet.signMessage).toHaveBeenCalledTimes(1);
  });

  it('does not announce cancellation when completion wins after the reject command reads signing state', async () => {
    await beginSignFlow(request());
    await claimSignFlow('req-1');
    const read = signFlowStorage.get.bind(signFlowStorage);
    const snapshotRead = Promise.withResolvers<void>();
    const releaseSnapshot = Promise.withResolvers<void>();
    vi.spyOn(signFlowStorage, 'get').mockImplementationOnce(async id => {
      const snapshot = await read(id);
      snapshotRead.resolve();
      await releaseSnapshot.promise;
      return snapshot;
    });

    const rejection = service.reject('req-1');
    await snapshotRead.promise;
    await recordSignOutcome('req-1', 'completed', { signature: 'committed-signature' });
    releaseSnapshot.resolve();
    await rejection;

    expect(await getSignFlow('req-1')).toMatchObject({
      status: 'completed', result: { signature: 'committed-signature' },
    });
    expect(mocks.emit).not.toHaveBeenCalledWith('sign-message-cancel-req-1', expect.anything());
  });

  it('keeps a committed result recoverable without a false cancellation if its final read fails', async () => {
    await beginSignFlow(request());
    const read = signFlowStorage.get.bind(signFlowStorage);
    let hideCompletedRead = true;
    vi.spyOn(signFlowStorage, 'get').mockImplementation(async id => {
      const entry = await read(id);
      if (entry?.status === 'completed' && hideCompletedRead) {
        hideCompletedRead = false;
        return null;
      }
      return entry;
    });

    await expect(approve()).rejects.toThrow('Signing request expired before completion');
    expect(await getSignFlow('req-1')).toMatchObject({
      status: 'completed', result: { signature: 'signed-message' },
    });
    expect(mocks.emit).not.toHaveBeenCalledWith('sign-message-cancel-req-1', expect.anything());
    expect(mocks.wallet.signMessage).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent approval clicks and does not replay a persisted signing claim', async () => {
    await beginSignFlow(request());
    const review = await service.getReview('req-1');
    const decision = { reviewKey: review.reviewKey, risksAcknowledged: false };
    await Promise.all([service.approveAndSign('req-1', decision), service.approveAndSign('req-1', decision)]);
    expect(mocks.wallet.signMessage).toHaveBeenCalledTimes(1);
    const restarted = createProviderSigningService();
    await expect(restarted.approveAndSign('req-1', decision)).rejects.toThrow(/no longer pending/);
    expect(mocks.wallet.signMessage).toHaveBeenCalledTimes(1);
  });

  it('proves the complete linked phase before invoking any signer', async () => {
    await beginSignFlow(request({ kind: 'sign-psbts', bundleKind: 'bulk-listing', items: [{
      psbtHex: 'psbt', signInputs: { [identity.address]: [0] }, sighashTypes: [1],
      marketplaceIntent: { action: 'create_listing' } as never,
    }] }));
    mocks.decodeBundle.mockResolvedValue({ items: [], review: { status: 'blocked', blockers: ['item 2 failed'] } });
    await expect(approve()).rejects.toThrow(/did not pass/);
    expect(mocks.wallet.signPsbt).not.toHaveBeenCalled();
  });
});
