import type { CoinLock, CoinLockUpdate, OfferCoinCommitment } from '@/types/coinLocks';
/** A real `invalidate_offers` PSBT through the xcp_signPsbt review and signing path: decoding,
 * prevout authentication, the marketplace proof, the locked-coin rules, and software signing.
 * Only wallet/session state and remote ledger responses are simulated, as in
 * marketplaceBundleProofs.integration. No broadcast: the site broadcasts. */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { setCoinLockStore } from '@/core/bitcoin/coinLockStore';
import { finalizePSBT, parsePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { verifyPsbtPrevouts } from '@/core/bitcoin/psbtPrevouts';
import { computeTxid } from '@/core/bitcoin/transactionBroadcaster';
import { parseMarketplaceIntent } from '@/core/counterparty/marketplace/intentParser';
import { beginSignFlow, getSignFlow } from '@/platform/provider/signFlow';
import { createProviderSigningService } from '@/services/providerSigningService';

const SITE = 'https://audit.invalid';

const state = vi.hoisted(() => ({
  address: '',
  /** Raw bytes of every fabricated parent, served by the simulated explorer. */
  parents: new Map<string, string>(),
  wallet: {
    isKeychainUnlocked: vi.fn(async () => true), getActiveWallet: vi.fn(),
    getActiveAddress: vi.fn(), getSettings: vi.fn(async () => ({ strictTransactionVerification: true })),
    signPsbt: vi.fn(), getPairedAddresses: vi.fn(),
  },
}));
vi.mock('@/services/walletService', () => ({ getWalletService: () => state.wallet }));
vi.mock('@/platform/auth/sessionManager', () => ({ getSessionGeneration: () => 0, assertSessionGeneration: () => {} }));
vi.mock('@/services/connectionService', () => ({ getConnectionService: () => ({
  hasPermission: async () => true, hasPairedAddressPermission: async () => true,
}) }));
vi.mock('@/services/eventEmitterService', () => ({ eventEmitterService: { emit: vi.fn() } }));
vi.mock('@/platform/walletManager', () => ({ walletManager: {
  getSettings: () => ({ connectedWebsites: ['https://audit.invalid'], providerCapabilities: {} }),
  getActiveWallet: () => ({ id: 'audit', addresses: [{ address: state.address }] }),
} }));
vi.mock('@/core/settings', () => ({ getActiveSettings: () => ({ zeldHuntSeconds: 0 }) }));
// The ledger knows no assets on these fabricated coins.
vi.mock('@/core/counterparty/api', () => ({
  fetchUtxoBalances: async () => ({ result: [] }),
  fetchAssetDetails: async () => ({ asset: 'XCP', divisible: true }),
  fetchServerInfo: async () => ({ counterparty_height: 900_000, backend_height: 900_000 }),
  clearApiCacheMatching: () => {},
  fetchBackendTransaction: async () => { throw new Error('Transaction not found'); },
  fetchLedgerHeights: async () => ({ backendHeight: 900_000, counterpartyHeight: 900_000 }),
}));
// Only the explorer's raw-transaction and status endpoints are simulated.
vi.mock('@/core/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/core/api/client')>();
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      get: async (url: string, config?: unknown) => {
        const notFound = () => Object.assign(new Error('Transaction not found'), { code: 'HTTP_ERROR', status: 404 });
        const raw = /mempool\.space\/api\/tx\/([0-9a-f]{64})\/hex$/.exec(url);
        if (raw) {
          const bytes = state.parents.get(raw[1]!);
          if (!bytes) throw notFound();
          return { data: bytes, status: 200 };
        }
        if (url.includes('/v2/bitcoin/transactions/')) throw notFound();
        if (/mempool\.space\/api\/tx\/[0-9a-f]{64}\/status$/.test(url)) {
          return { data: { confirmed: true, block_height: 800_000 }, status: 200 };
        }
        return actual.apiClient.get(url, config as never);
      },
    },
  };
});
vi.mock('@/core/counterparty/transaction', () => ({ decodeCounterpartyMessage: async () => undefined }));
vi.mock('@/core/counterparty/sourcePubkey', () => ({ getSourcePubkey: () => undefined }));
vi.mock('@/core/bitcoin/feeRate', () => ({ getFeeRates: async () => ({ fastestFee: 2 }) }));
vi.mock('@/core/zeld/protection', () => ({ classifyZeldOutpoints: async () => ({ bearing: [], apiUnavailable: false }) }));

const walletKey = new Uint8Array(32).fill(7);
const segwit = p2wpkh(secp256k1.getPublicKey(walletKey));

const FUNDING = 12_330;
const FEE = 220;

/** The bidder's offer funding coin, then the site's fee-only spend of it back to the bidder. */
function invalidation(options: { parentValue?: number } = {}) {
  const parent = new Transaction();
  parent.addInput({ txid: new Uint8Array(32).fill(41), index: 0 });
  parent.addOutput({ script: segwit.script, amount: BigInt(options.parentValue ?? FUNDING) });
  state.parents.set(parent.id, bytesToHex(parent.toBytes(true, false)));
  const tx = new Transaction({ version: 2, lockTime: 0 });
  tx.addInput({ txid: parent.id, index: 0, witnessUtxo: { script: segwit.script, amount: BigInt(FUNDING) }, sighashType: 1 });
  tx.addOutput({ script: segwit.script, amount: BigInt(FUNDING - FEE) });
  const intent = parseMarketplaceIntent({
    standard: 'counterparty-marketplace', version: 1, action: 'invalidate_offers',
    protocolVersion: 'offer_invalidation_v1', operationId: 'invalidate-1', assets: [], bidder: segwit.address,
    fundingInputs: [{ txid: parent.id, vout: 0, valueSats: FUNDING }],
    returnSats: FUNDING - FEE, networkFeeSats: FEE, expectedTxid: tx.id,
  });
  return { psbtHex: bytesToHex(tx.toPSBT()), intent, coin: `${parent.id}:0`, txid: tx.id };
}

async function review(item: ReturnType<typeof invalidation>) {
  const id = crypto.randomUUID();
  await beginSignFlow({ id, walletId: 'audit', address: state.address, origin: SITE, timestamp: Date.now(), requestKey: id,
    kind: 'sign-psbt', psbtHex: item.psbtHex, signInputs: { [state.address]: [0] }, sighashTypes: [1],
    marketplaceIntent: item.intent,
  } as Parameters<typeof beginSignFlow>[0]);
  const result = await createProviderSigningService().getReview(id);
  if (result.kind !== 'sign-psbt') throw new Error('wrong review kind');
  return result;
}

async function approve(result: Awaited<ReturnType<typeof review>>, risksAcknowledged: boolean): Promise<string> {
  await createProviderSigningService().approveAndSign(result.request.id, { reviewKey: result.reviewKey, risksAcknowledged });
  const completed = await getSignFlow(result.request.id);
  if (completed?.status !== 'completed' || !('signedPsbtHex' in completed.result)) throw new Error('Signing did not complete');
  return completed.result.signedPsbtHex;
}

const lockWarnings = (result: Awaited<ReturnType<typeof review>>) =>
  result.decodedInfo.safety.warnings.filter(warning => warning.code === 'locked_coin_spend');

const offerLock = (outpoint: string, extra: Partial<CoinLock> = {}): CoinLock => ({
  outpoint, address: segwit.address!, kind: 'offer_slot', manual: false, refs: ['auth-1'], valueSats: FUNDING,
  origin: SITE, expiresAt: 2_000_000_000, createdAt: 1, seenAt: 1, unlocked: false, ...extra,
});

const store = { locks: [] as CoinLock[], updates: [] as CoinLockUpdate[], commits: [] as Array<[string, OfferCoinCommitment[]]> };

beforeEach(() => {
  fakeBrowser.reset(); vi.stubGlobal('chrome', fakeBrowser);
  state.address = segwit.address!;
  state.parents.clear();
  state.wallet.getActiveWallet.mockResolvedValue({ id: 'audit', type: 'privateKey', addressFormat: 'p2wpkh' });
  state.wallet.getActiveAddress.mockResolvedValue({ address: segwit.address });
  state.wallet.signPsbt.mockReset();
  // As walletManager.signPsbt does: every signed input is re-read from its real parent first.
  state.wallet.signPsbt.mockImplementation(async (hex: string, inputs: Record<string, number[]>, sighashes: number[]) => {
    let current = hex;
    for (const indices of Object.values(inputs)) {
      const verified = await verifyPsbtPrevouts(current, { inputIndices: indices });
      current = signPSBT(verified.hex, bytesToHex(walletKey), indices, AddressFormat.P2WPKH, sighashes);
    }
    return current;
  });
  store.locks = []; store.updates = []; store.commits = [];
  setCoinLockStore({
    read: async () => store.locks,
    update: async (_address, update) => { store.updates.push(update); },
    commit: async (address, commitments) => { store.commits.push([address, commitments]); },
  });
});
afterEach(() => { setCoinLockStore(null); vi.unstubAllGlobals(); });

describe('invalidate_offers through xcp_signPsbt', () => {
  it('proves and signs the site\'s spend of its own offer coin in one click, and leaves the lock for the confirmed spend', async () => {
    const item = invalidation();
    store.locks = [offerLock(item.coin)];
    const result = await review(item);
    expect(result.decodedInfo.marketplaceReview).toMatchObject({ status: 'proved', family: 'invalidate_offers', blockers: [] });
    expect(lockWarnings(result)).toEqual([]);
    expect(result.policy).toMatchObject({ blocked: false, requiresAcknowledgement: false });

    const signed = parsePSBT(await approve(result, false));
    expect(signed.getInput(0).partialSig).toHaveLength(1);
    expect(computeTxid(finalizePSBT(bytesToHex(signed.toPSBT())))).toBe(item.txid);
    // Handed back for the site to broadcast: nothing is unlocked or newly locked by signing.
    expect(store.updates).toEqual([]);
    expect(store.commits).toEqual([]);
  });

  it.each([
    ['locked by hand', (coin: string) => offerLock(coin, { kind: 'manual', manual: true, refs: [], origin: null, expiresAt: null })],
    ['locked by another site', (coin: string) => offerLock(coin, { origin: 'https://elsewhere.example' })],
    ['also relied on by another site', (coin: string) => offerLock(coin, { sharedOrigins: ['https://elsewhere.example'] })],
  ])('asks before spending a coin %s, and still unlocks nothing', async (_, locked) => {
    const item = invalidation();
    store.locks = [locked(item.coin)];
    const result = await review(item);
    expect(result.decodedInfo.marketplaceReview?.status).toBe('proved');
    expect(lockWarnings(result)).toEqual([expect.objectContaining({
      data: expect.objectContaining({ releasedOnSpend: true, coins: [expect.objectContaining({ outpoint: item.coin })] }),
    })]);
    expect(result.policy.requiresAcknowledgement).toBe(true);
    await expect(createProviderSigningService().approveAndSign(result.request.id, { reviewKey: result.reviewKey, risksAcknowledged: false }))
      .rejects.toThrow(/acknowledge/);

    const again = await review(item);
    expect(parsePSBT(await approve(again, true)).getInput(0).partialSig).toHaveLength(1);
    expect(store.updates).toEqual([]);
  });

  it('signs nothing when the coin\'s real parent pays a different value than the PSBT and claim say', async () => {
    const item = invalidation({ parentValue: FUNDING - 1 });
    store.locks = [offerLock(item.coin)];
    const result = await review(item);
    // The review reads the PSBT's declared value; the signer re-reads the real parent and refuses.
    await expect(approve(result, false)).rejects.toThrow(/does not match/);
    expect(await getSignFlow(result.request.id)).not.toHaveProperty('result');
    expect(store.updates).toEqual([]);
  });
});
