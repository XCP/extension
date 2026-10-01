/** Real PSBT decoding, background review, prevout verification and software signing for the two
 * marketplace bundles whose proof crosses items: attach-and-list (the listing spends the attach's
 * unbroadcast output) and a batch of exact-offer authorizations sharing one funding outpoint.
 * Only wallet/session state and remote ledger responses are simulated. No broadcast. */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { p2pkh, p2wpkh, Script, Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { setCoinLockStore } from '@/core/bitcoin/coinLockStore';
import type { CoinLock, CoinLockUpdate, OfferCoinCommitment } from '@/core/bitcoin/coinLocks';
import { finalizePSBT, parsePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { decodePsbtForApproval } from '@/core/bitcoin/psbtApprovalDecoder';
import type { DecodedPsbtBundleItem, PsbtBundleApprovalInput } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import { verifyPsbtPrevouts } from '@/core/bitcoin/psbtPrevouts';
import { computeTxid } from '@/core/bitcoin/transactionBroadcaster';
import { parseMarketplaceIntent } from '@/core/counterparty/marketplace/intentParser';
import { parseMarketplaceBatchIntents } from '@/core/counterparty/marketplaceBatch';
import { parseAcceptanceCpfpBundleIntents } from '@/core/counterparty/marketplaceBundle';
import { arc4 } from '@/core/counterparty/unpack/binary';
import { beginSignFlow, getSignFlow } from '@/platform/provider/signFlow';
import { createProviderSigningService } from '@/services/providerSigningService';

type Balance = { asset: string; quantity: string; quantity_normalized: string };

const state = vi.hoisted(() => ({
  address: '',
  assets: new Map<string, Balance[] | 'fail'>(),
  /** Explorer status per txid; absent means confirmed in an already-parsed block. */
  txStatus: new Map<string, { confirmed: boolean; block_height?: number } | 'missing' | 'fail'>(),
  ledgerHeight: 900_000,
  /** Raw bytes of every fabricated parent, served by the simulated explorer. */
  parents: new Map<string, string>(),
  /** ZELD per outpoint, as the indexer would list it; empty means no input holds any. */
  zeld: new Map<string, bigint>(),
  zeldHuntSeconds: 0,
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
  getSettings: () => ({ connectedWebsites: ['https://audit.invalid'], providerCapabilities: {
    'https://audit.invalid': { pairedAddresses: true, walletId: 'audit', address: state.address },
  } }),
  getActiveWallet: () => ({ id: 'audit', addresses: [{ address: state.address }] }),
} }));
vi.mock('@/core/settings', () => ({ getActiveSettings: () => ({ zeldHuntSeconds: state.zeldHuntSeconds }) }));
// The ledger has never seen any outpoint these tests fabricate, exactly like mainnet has never seen
// an unbroadcast attach output: every lookup answers [] unless a test says otherwise.
vi.mock('@/core/counterparty/api', () => ({
  fetchUtxoBalances: async (utxo: string) => {
    const entry = state.assets.get(utxo);
    if (entry === 'fail') throw new Error('Indexer unavailable');
    return { result: entry ?? [] };
  },
  fetchAssetDetails: async () => ({ asset: 'RAREPEPE', divisible: false }),
  fetchServerInfo: async () => ({ counterparty_height: state.ledgerHeight, backend_height: state.ledgerHeight }),
  clearApiCacheMatching: () => {},
  // The node backend has none of the fabricated transactions; parents come from the explorer.
  fetchBackendTransaction: async () => { throw new Error('Transaction not found'); },
  fetchLedgerHeights: async () => ({ backendHeight: state.ledgerHeight, counterpartyHeight: state.ledgerHeight }),
}));
// Only the explorer's transaction-status endpoint is simulated; every other request is real code.
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
          const known = state.txStatus.get(raw[1]!);
          if (!bytes || known === 'missing' || known === 'fail') throw notFound();
          return { data: bytes, status: 200 };
        }
        if (url.includes('/v2/bitcoin/transactions/')) throw notFound();
        const match =/mempool\.space\/api\/tx\/([0-9a-f]{64})\/status$/.exec(url);
        if (!match) return actual.apiClient.get(url, config as never);
        const status = state.txStatus.get(match[1]!) ?? { confirmed: true, block_height: 800_000 };
        if (status === 'fail') throw Object.assign(new Error('explorer down'), { code: 'NETWORK_ERROR' });
        // mempool.space answers a txid it has never seen with HTTP 200 {"confirmed":false}, not a
        // 404 (checked on mainnet): an unbroadcast attach looks exactly like an unconfirmed one.
        if (status === 'missing') return { data: { confirmed: false }, status: 200 };
        return { data: status, status: 200 };
      },
    },
  };
});
vi.mock('@/core/counterparty/transaction', () => ({ decodeCounterpartyMessage: async () => undefined }));
vi.mock('@/core/counterparty/sourcePubkey', () => ({ getSourcePubkey: () => undefined }));
vi.mock('@/core/bitcoin/feeRate', () => ({ getFeeRates: async () => ({ fastestFee: 2 }) }));
vi.mock('@/core/zeld/protection', () => ({
  classifyZeldOutpoints: async (inputs: Array<{ txid: string; vout: number }>) => {
    const bearing = inputs.map(input => `${input.txid.toLowerCase()}:${input.vout}`)
      .filter(outpoint => state.zeld.has(outpoint));
    return {
      bearing, apiUnavailable: false,
      ...(bearing.length > 0
        ? { amounts: Object.fromEntries(bearing.map(outpoint => [outpoint, state.zeld.get(outpoint)!.toString()])) }
        : {}),
    };
  },
}));

const walletKey = new Uint8Array(32).fill(7);
const legacy = p2pkh(secp256k1.getPublicKey(walletKey));
const segwit = p2wpkh(secp256k1.getPublicKey(walletKey));
const outsider = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(9)));
const platform = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(11)));

const CNTRPRTY = hexToBytes('434e545250525459');
const opReturn = (key: string, typeId: number, body: string) => Script.encode([
  'RETURN',
  arc4(hexToBytes(key), new Uint8Array([...CNTRPRTY, typeId, ...new TextEncoder().encode(body)])),
]);

function funding(script: Uint8Array, amount: bigint, seed: number) {
  const tx = new Transaction();
  tx.addInput({ txid: new Uint8Array(32).fill(seed), index: 0 });
  tx.addOutput({ script, amount });
  state.parents.set(tx.id, bytesToHex(tx.toBytes(true, false)));
  return tx;
}

async function review(items: PsbtBundleApprovalInput['items'], bundleKind: PsbtBundleApprovalInput['bundleKind']) {
  const id = crypto.randomUUID();
  await beginSignFlow({ id, walletId: 'audit', address: state.address, origin: 'https://audit.invalid',
    timestamp: Date.now(), requestKey: id, kind: 'sign-psbts', bundleKind, items,
  } as Parameters<typeof beginSignFlow>[0]);
  const result = await createProviderSigningService().getReview(id);
  if (result.kind !== 'sign-psbts') throw new Error('wrong review kind');
  return result;
}

async function approve(result: Awaited<ReturnType<typeof review>>, risksAcknowledged = false): Promise<string[]> {
  await createProviderSigningService().approveAndSign(result.request.id, {
    reviewKey: result.reviewKey, risksAcknowledged,
  });
  const completed = await getSignFlow(result.request.id);
  if (completed?.status !== 'completed' || !('signedPsbtHexes' in completed.result)) {
    throw new Error('Signing did not complete');
  }
  return completed.result.signedPsbtHexes;
}

beforeEach(() => {
  fakeBrowser.reset(); vi.stubGlobal('chrome', fakeBrowser);
  state.address = segwit.address;
  state.assets.clear();
  state.txStatus.clear();
  state.zeld.clear();
  state.zeldHuntSeconds = 0;
  state.ledgerHeight = 900_000;
  state.wallet.getActiveWallet.mockResolvedValue({ id: 'audit', type: 'mnemonic', addressFormat: 'p2wpkh' });
  state.wallet.getActiveAddress.mockResolvedValue({ address: segwit.address });
  state.wallet.getPairedAddresses.mockResolvedValue({ legacy, segwit });
  state.wallet.signPsbt.mockClear();
  state.wallet.signPsbt.mockImplementation(async (
    hex: string, inputs: Record<string, number[]>, sighashes: number[], _identity: unknown,
    options?: { packageTransactions?: Record<string, string> },
  ) => {
    let current = hex;
    // As walletManager.signPsbt does: a same-bundle parent is verified from its supplied bytes.
    const packageTransactions = options?.packageTransactions
      ? new Map(Object.entries(options.packageTransactions)) : undefined;
    for (const [address, indices] of Object.entries(inputs)) {
      const verified = await verifyPsbtPrevouts(current, {
        inputIndices: indices, ...(packageTransactions ? { packageTransactions } : {}),
      });
      current = signPSBT(verified.hex, bytesToHex(walletKey), indices,
        address === legacy.address ? AddressFormat.P2PKH : AddressFormat.P2WPKH, sighashes);
    }
    return current;
  });
});

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------------------------
// attach-and-list
// ---------------------------------------------------------------------------------------------

interface PairOptions {
  legacySource?: boolean;
  /** Mutate the listing's asset input before the PSBT is serialized. */
  listingInput?: (attachId: string) => { txid: string; index: number; amount: bigint; script: Uint8Array };
  /** Attach message body; defaults to one RAREPEPE onto output 0. */
  attachBody?: string;
  /** A second attach input: the seller's own 330-sat UTXO created by `parent`. */
  extraInput?: Transaction;
}

function attachAndList(options: PairOptions = {}): PsbtBundleApprovalInput['items'] {
  const source = options.legacySource ? legacy : segwit;
  const sourceFunding = funding(source.script, 100_000n, options.legacySource ? 21 : 22);
  const attach = new Transaction({ version: 2, lockTime: 0, allowUnknownOutputs: true });
  attach.addInput({ txid: sourceFunding.id, index: 0, nonWitnessUtxo: sourceFunding.toBytes(true, false), sighashType: 1 });
  if (options.extraInput) {
    attach.addInput({ txid: options.extraInput.id, index: 0, nonWitnessUtxo: options.extraInput.toBytes(true, false), sighashType: 1 });
  }
  attach.addOutput({ script: segwit.script, amount: 330n });
  attach.addOutput({ script: opReturn(sourceFunding.id, 101, options.attachBody ?? 'RAREPEPE|1|0'), amount: 0n });
  attach.addOutput({ script: source.script, amount: options.extraInput ? 99_000n : 98_670n });

  // Not broadcast yet: the explorer has never heard of the attach, exactly as on mainnet.
  if (!state.txStatus.has(attach.id)) state.txStatus.set(attach.id, 'missing');

  const spent = options.listingInput?.(attach.id)
    ?? { txid: attach.id, index: 0, amount: 330n, script: segwit.script };
  const listing = new Transaction({ version: 2, lockTime: 0 });
  listing.addInput({ txid: new Uint8Array(32), index: 0 });
  listing.addInput({
    txid: spent.txid, index: spent.index,
    witnessUtxo: { script: spent.script, amount: spent.amount }, sighashType: 0x83,
  });
  listing.addOutput({ script: segwit.script, amount: 330n });
  listing.addOutput({ script: segwit.script, amount: 100_330n });

  const parsed = parseMarketplaceBatchIntents([
    {
      standard: 'counterparty-marketplace', version: 1, action: 'attach_for_listing',
      operationId: 'preflight-1', protocolVersion: 'counterparty_attach_listing_v1',
      assets: [{ asset: 'RAREPEPE', quantityRaw: '1' }], seller: segwit.address,
      assetSource: source.address, expectedAttachedOutpoint: { txid: attach.id, vout: 0 },
      utxoAddress: segwit.address, utxoValueSats: 330, networkFeeSats: 1_000,
      protocolFee: { asset: 'XCP', quotedAmountRaw: '0', actualAmountRaw: null, observedBlock: 900_000,
        variableUntilConfirmed: true },
      operationExpiresAt: 2_000_000_000,
    },
    {
      standard: 'counterparty-marketplace', version: 1, action: 'create_listing',
      operationId: 'preflight-1', protocolVersion: 'counterparty_attach_listing_v1',
      assets: [{ asset: 'RAREPEPE', quantityRaw: '1', sourceOutpoint: { txid: attach.id, vout: 0 } }],
      seller: segwit.address, priceSats: 100_000, utxoValueSats: 330, guaranteedSellerPaymentSats: 100_330,
      delivery: { mode: 'buyer_selected_detach' }, signingRequestExpiresAt: 2_000_000_000,
      marketplaceExpiresAt: null, bitcoinExpiresAt: null,
    },
  ]);
  expect(parsed.kind).toBe('attach-and-list');
  return [
    { psbtHex: bytesToHex(attach.toPSBT()),
      signInputs: options.extraInput
        ? (source === segwit ? { [segwit.address]: [0, 1] } : { [source.address]: [0], [segwit.address]: [1] })
        : { [source.address]: [0] },
      sighashTypes: options.extraInput ? [1, 1] : [1],
      marketplaceIntent: parsed.intents[0]! },
    { psbtHex: bytesToHex(listing.toPSBT()), signInputs: { [segwit.address]: [1] }, sighashTypes: [1, 0x83],
      marketplaceIntent: parsed.intents[1]! },
  ];
}

const listingReview = (result: Awaited<ReturnType<typeof review>>) => {
  const item = result.decodedInfo.items[1]!;
  return item.marketplaceReview;
};

describe('attach-and-list linked proof', () => {
  it.each([false, true])('proves the listing from the attach with no ledger evidence (legacy source=%s)', async legacySource => {
    const items = attachAndList({ legacySource });
    const result = await review(items, 'attach-and-list');

    expect(result.decodedInfo.review.blockers).toEqual([]);
    expect(result.decodedInfo.review.status).toBe('caution');
    expect(listingReview(result)).toMatchObject({ status: 'proved', blockers: [] });
    expect(result.policy.blocked).toBe(false);
    expect(result.decodedInfo.policyWarnings?.filter(warning => warning.severity === 'block')).toEqual([]);

    const [signedAttach, signedListing] = await approve(result, result.policy.requiresAcknowledgement);
    const finalAttachTxid = computeTxid(finalizePSBT(signedAttach!));
    const listing = parsePSBT(signedListing!);
    // The listing is signed over exactly the final attach output 0, whatever that txid became.
    expect(bytesToHex(listing.getInput(1).txid!)).toBe(finalAttachTxid);
    expect(listing.getInput(1).index).toBe(0);
    expect(listing.getInput(1).partialSig).toHaveLength(1);
    if (legacySource) {
      expect(finalAttachTxid).not.toBe(parsePSBT(items[0]!.psbtHex).id);
    } else {
      expect(finalAttachTxid).toBe(parsePSBT(items[0]!.psbtHex).id);
    }
  });

  it('proves over a failed ledger lookup of the unbroadcast attach output, from the attach bytes', async () => {
    const items = attachAndList();
    const attachTxid = parsePSBT(items[0]!.psbtHex).id;
    state.assets.set(`${attachTxid}:0`, 'fail');
    // Whatever the explorer says about the attach, the listing is proved from the bundle itself.
    for (const status of ['missing', 'fail', { confirmed: false }] as const) {
      state.txStatus.set(attachTxid, status);
      const result = await review(items, 'attach-and-list');
      expect(listingReview(result)?.status).toBe('proved');
      expect(result.policy.blocked).toBe(false);
    }
  });

  it('keeps a failed lookup a retry when the network already knows the attach', async () => {
    const items = attachAndList();
    const attachTxid = parsePSBT(items[0]!.psbtHex).id;
    state.assets.set(`${attachTxid}:0`, 'fail');
    // The explorer serves the attach's bytes: it may be on chain, so its output is not derivable.
    state.parents.set(attachTxid, bytesToHex(parsePSBT(items[0]!.psbtHex).toBytes(true, false)));
    state.txStatus.set(attachTxid, { confirmed: true, block_height: 800_000 });
    const result = await review(items, 'attach-and-list');
    expect(listingReview(result)?.status).toBe('retry');
    expect(result.policy.blocked).toBe(true);
    state.parents.delete(attachTxid);
  });

  it('keeps an outage on the attach inputs a retry: the listed output also receives what they carry', async () => {
    const items = attachAndList();
    const sourceFunding = bytesToHex(parsePSBT(items[0]!.psbtHex).getInput(0).txid!);
    state.assets.set(`${sourceFunding}:0`, 'fail');
    const result = await review(items, 'attach-and-list');
    expect(result.decodedInfo.review.status).toBe('retry');
    expect(result.policy.blocked).toBe(true);
  });

  // The reviewer's bundle: attach input 1 is the seller's fresh one-unit UTXO of another asset,
  // still unconfirmed, so the ledger reads it as empty. Counterparty would move that asset onto
  // output 0 with RAREPEPE, and the listing would sell both for RAREPEPE's price.
  it.each([
    ['unconfirmed', { confirmed: false }, 900_000],
    ['confirmed above the parsed height', { confirmed: true, block_height: 900_001 }, 900_000],
    ['of unknown status', 'fail' as const, 900_000],
  ])('never signs while an attach input parent is %s', async (_label, status, ledgerHeight) => {
    const prepared = funding(segwit.script, 330n, 23);
    state.txStatus.set(prepared.id, status);
    state.ledgerHeight = ledgerHeight;
    const result = await review(attachAndList({ extraInput: prepared }), 'attach-and-list');
    // The attach itself spends an output whose contents the ledger cannot vouch for yet, so the
    // input-asset check holds it at retry too; the listing link is refused on its own grounds.
    expect(result.decodedInfo.items[0]!.marketplaceReview?.status).toBe('retry');
    expect(listingReview(result)?.status).toBe('retry');
    expect(result.decodedInfo.review.status).toBe('retry');
    expect(result.policy.blocked).toBe(true);
    await expect(approve(result, true)).rejects.toThrow();
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('blocks once the indexed attach input shows the asset it carries', async () => {
    const prepared = funding(segwit.script, 330n, 23);
    state.assets.set(`${prepared.id}:0`, [{ asset: 'OTHERASSET', quantity: '1', quantity_normalized: '1' }]);
    const result = await review(attachAndList({ extraInput: prepared }), 'attach-and-list');
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.policy.blocked).toBe(true);
  });

  it('signs the two-input attach once every parent is confirmed and indexed', async () => {
    const prepared = funding(segwit.script, 330n, 23);
    const result = await review(attachAndList({ extraInput: prepared }), 'attach-and-list');
    expect(listingReview(result)?.status).toBe('proved');
    expect(result.policy.blocked).toBe(false);
    await expect(approve(result, result.policy.requiresAcknowledgement)).resolves.toHaveLength(2);
  });

  it('keeps a ledger that contradicts the attach, and blocks on it', async () => {
    const items = attachAndList();
    state.assets.set(`${parsePSBT(items[0]!.psbtHex).id}:0`, [
      { asset: 'OTHERASSET', quantity: '1', quantity_normalized: '1' },
    ]);
    const result = await review(items, 'attach-and-list');
    expect(listingReview(result)?.status).toBe('blocked');
    expect(result.policy.blocked).toBe(true);
  });

  it.each([
    ['vout', (attachId: string) => ({ txid: attachId, index: 2, amount: 330n, script: segwit.script })],
    ['txid', () => ({ txid: 'ee'.repeat(32), index: 0, amount: 330n, script: segwit.script })],
    ['owner script', (attachId: string) => ({ txid: attachId, index: 0, amount: 330n, script: legacy.script })],
    ['value', (attachId: string) => ({ txid: attachId, index: 0, amount: 331n, script: segwit.script })],
  ])('blocks a listing whose asset input differs from the attach output by %s', async (_label, listingInput) => {
    const items = attachAndList({ listingInput });
    if (_label === 'owner script') {
      // The wallet also owns the Legacy script; the point is that it is not the attach output's.
      items[1] = { ...items[1]!, signInputs: { [legacy.address]: [1] } };
    }
    const result = await review(items, 'attach-and-list');
    expect(listingReview(result)?.blockers.some(problem => problem.startsWith('listing input 1'))).toBe(true);
    expect(listingReview(result)?.status).toBe('blocked');
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.policy.blocked).toBe(true);
    await expect(approve(result, true)).rejects.toThrow();
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it.each([
    ['asset', 'OTHERASSET|1|0'],
    ['quantity', 'RAREPEPE|2|0'],
    ['destination', 'RAREPEPE|1|2'],
  ])('blocks both items when the attach bytes carry a different %s', async (_label, attachBody) => {
    const result = await review(attachAndList({ attachBody }), 'attach-and-list');
    expect(result.decodedInfo.items[0]!.marketplaceReview?.status).toBe('blocked');
    expect(listingReview(result)?.status).toBe('blocked');
    expect(listingReview(result)?.blockers).toContain('the listing depends on an attach that did not prove');
    expect(result.policy.blocked).toBe(true);
  });

  it('never links a standalone listing: bulk-listing still requires the ledger', async () => {
    const [, listing] = attachAndList();
    const result = await review([listing!], 'bulk-listing');
    // The ledger has never seen the unbroadcast attach output, so the listing cannot prove: it
    // waits for the ledger (retry) rather than borrowing the attach's evidence.
    expect(result.decodedInfo.items[0]!.marketplaceReview?.status).toBe('retry');
    expect(result.policy.blocked).toBe(true);
    await expect(approve(result, true)).rejects.toThrow();
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('never links a single create_listing request', async () => {
    const [, listing] = attachAndList();
    const decoded = await decodePsbtForApproval(listing!.psbtHex, [segwit.address], [1], [1, 0x83],
      undefined, 'counterparty', undefined, listing!.marketplaceIntent as never, [segwit.address]);
    expect(decoded.marketplaceReview?.status).toBe('retry');
    expect(decoded.safety.blocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// authorize-offers
// ---------------------------------------------------------------------------------------------

const PRICE = 250_000;
const FEE = 1_000;
const NETWORK_FEE = 500;
const bid = funding(segwit.script, BigInt(PRICE + FEE), 31);

function exactOffer(index: number, overrides: {
  sighashTypes?: number[];
  sellerProceeds?: number;
} = {}): PsbtBundleApprovalInput['items'][number] {
  const target = funding(outsider.script, 546n, 40 + index);
  state.assets.set(`${target.id}:0`, [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }]);
  const tx = new Transaction({ version: 2, lockTime: 0, allowUnknownOutputs: true });
  tx.addInput({ txid: bid.id, index: 0, nonWitnessUtxo: bid.toBytes(true, false), sighashType: 1 });
  tx.addInput({ txid: target.id, index: 0, nonWitnessUtxo: target.toBytes(true, false), sighashType: 1 });
  tx.addOutput({ script: opReturn(bid.id, 102, segwit.address), amount: 0n });
  tx.addOutput({ script: outsider.script, amount: BigInt(overrides.sellerProceeds ?? PRICE + 546 - NETWORK_FEE) });
  tx.addOutput({ script: platform.script, amount: BigInt(FEE) });
  const marketplaceIntent = parseMarketplaceIntent({
    standard: 'counterparty-marketplace', version: 1, action: 'authorize_exact_offer',
    operationId: `auth-${index}`, protocolVersion: 'exact_offer_v1',
    assets: [{ asset: 'RAREPEPE', quantityRaw: '1', sourceOutpoint: { txid: target.id, vout: 0 } }],
    authorizationId: `auth-${index}`, bidder: segwit.address, seller: outsider.address,
    priceSats: PRICE, utxoValueSats: 546, sellerProceedsSats: PRICE + 546 - NETWORK_FEE,
    networkFeeSats: NETWORK_FEE, platformFeeSats: FEE, expectedTxid: tx.id,
    delivery: { mode: 'detached', address: segwit.address },
    marketplaceExpiresAt: 2_000_003_600, bitcoinExpiresAt: null,
    bitcoinInvalidation: { type: 'spend_funding_outpoint', outpoint: { txid: bid.id, vout: 0 } },
  });
  return {
    psbtHex: bytesToHex(tx.toPSBT()), signInputs: { [segwit.address]: [0] },
    sighashTypes: overrides.sighashTypes ?? [1, 1], marketplaceIntent,
  };
}

describe('authorize-offers batch', () => {
  it.each([1, 3, 8])('proves and signs %i exact targets on one funding outpoint, all or none', async count => {
    const items = Array.from({ length: count }, (_, index) => exactOffer(index));
    expect(parseMarketplaceBatchIntents(items.map(item => item.marketplaceIntent)).kind).toBe('authorize-offers');
    const result = await review(items, 'authorize-offers');

    expect(result.decodedInfo.review).toMatchObject({ status: 'caution', family: 'marketplace_batch', blockers: [] });
    expect(result.policy.blocked).toBe(false);
    // The batch asks for exactly what the single-PSBT path asks for the same authorization.
    const single = await decodePsbtForApproval(items[0]!.psbtHex, [segwit.address], [0], [1, 1],
      undefined, 'counterparty', undefined, items[0]!.marketplaceIntent as never, [segwit.address]);
    const { getPsbtApprovalPolicy } = await import('@/core/bitcoin/providerApprovalPolicy');
    const singlePolicy = getPsbtApprovalPolicy({ ...items[0]!, address: segwit.address }, single, true, 2);
    expect(result.policy.requiresAcknowledgement).toBe(singlePolicy.requiresAcknowledgement);

    if (result.policy.requiresAcknowledgement) {
      await expect(approve(result, false)).rejects.toThrow(/acknowledge/);
      expect(state.wallet.signPsbt).not.toHaveBeenCalled();
    }
    const signed = await approve(result, true);
    expect(signed).toHaveLength(count);
    for (const hex of signed) {
      const tx = parsePSBT(hex);
      expect(tx.getInput(0).partialSig).toHaveLength(1);
      expect(tx.getInput(0).partialSig![0]![1].at(-1)).toBe(0x01);
      expect(tx.getInput(1).partialSig).toBeUndefined();
    }
  });

  it('blocks the whole batch when any item asks for SINGLE|ANYONECANPAY on input 0', async () => {
    const items = [exactOffer(0), exactOffer(1, { sighashTypes: [0x83, 1] })];
    const result = await review(items, 'authorize-offers');
    expect(result.decodedInfo.items[1]!.marketplaceReview?.blockers).toContain(
      'the wallet must sign only input 0 with ALL (0x01) for this action',
    );
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.policy.blocked).toBe(true);
    await expect(approve(result, true)).rejects.toThrow();
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('blocks the whole batch when any item does not prove', async () => {
    const items = [exactOffer(0), exactOffer(1, { sellerProceeds: PRICE })];
    const result = await review(items, 'authorize-offers');
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.decodedInfo.review.blockers.some(problem => problem.startsWith('item 2:'))).toBe(true);
    expect(result.policy.blocked).toBe(true);
    await expect(approve(result, true)).rejects.toThrow();
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('blocks the whole batch when a target carries no attached asset', async () => {
    const items = [exactOffer(0), exactOffer(1)];
    const target = parsePSBT(items[1]!.psbtHex).getInput(1);
    state.assets.set(`${bytesToHex(target.txid!)}:0`, []);
    const result = await review(items, 'authorize-offers');
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.policy.blocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// acceptance-cpfp
// ---------------------------------------------------------------------------------------------

describe('acceptance-cpfp: the child spends its unbroadcast parent from the same bundle', () => {
  const PROCEEDS = PRICE + 546 - NETWORK_FEE;
  const CHILD_FEE = 300;

  function acceptance(options: {
    childSpends?: (parentId: string) => { txid: string; index: number; amount: bigint };
  } = {}) {
    // The bidder is someone else; the wallet is the accepting seller of its own asset UTXO.
    const buyerBid = funding(outsider.script, BigInt(PRICE + FEE), 51);
    const asset = funding(segwit.script, 546n, 52);
    state.assets.set(`${asset.id}:0`, [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }]);
    const parent = new Transaction({ version: 2, lockTime: 0, allowUnknownOutputs: true });
    parent.addInput({
      txid: buyerBid.id, index: 0, witnessUtxo: { script: outsider.script, amount: BigInt(PRICE + FEE) }, sighashType: 1,
    });
    parent.addInput({ txid: asset.id, index: 0, witnessUtxo: { script: segwit.script, amount: 546n }, sighashType: 1 });
    parent.addOutput({ script: opReturn(buyerBid.id, 102, outsider.address), amount: 0n });
    parent.addOutput({ script: segwit.script, amount: BigInt(PROCEEDS) });
    parent.addOutput({ script: platform.script, amount: BigInt(FEE) });
    // Never broadcast: the explorer has not heard of the parent, exactly as on mainnet.
    const spends = options.childSpends?.(parent.id) ?? { txid: parent.id, index: 1, amount: BigInt(PROCEEDS) };
    const child = new Transaction({ version: 2, lockTime: 0 });
    child.addInput({
      txid: spends.txid, index: spends.index, witnessUtxo: { script: segwit.script, amount: spends.amount }, sighashType: 1,
    });
    child.addOutput({ script: segwit.script, amount: BigInt(PROCEEDS - CHILD_FEE) });
    const target = { asset: 'RAREPEPE', quantityRaw: '1', sourceOutpoint: { txid: asset.id, vout: 0 } };
    const pair = parseAcceptanceCpfpBundleIntents({
      standard: 'counterparty-marketplace', version: 1, action: 'accept_exact_offer',
      operationId: 'auth-cpfp', protocolVersion: 'exact_offer_v1', assets: [target],
      authorizationId: 'auth-cpfp', bidder: outsider.address, seller: segwit.address,
      priceSats: PRICE, utxoValueSats: 546, sellerProceedsSats: PROCEEDS, networkFeeSats: NETWORK_FEE,
      platformFeeSats: FEE, expectedTxid: parent.id,
      delivery: { mode: 'detached', address: outsider.address },
      marketplaceExpiresAt: 2_000_003_600, bitcoinExpiresAt: null,
      bitcoinInvalidation: { type: 'spend_funding_outpoint', outpoint: { txid: buyerBid.id, vout: 0 } },
    }, {
      standard: 'counterparty-marketplace', version: 1, action: 'bump_acceptance_fee',
      operationId: 'auth-cpfp', protocolVersion: 'exact_offer_v1', assets: [target],
      authorizationId: 'auth-cpfp', seller: segwit.address, parentExpectedTxid: parent.id,
      childExpectedTxid: child.id, parentSellerProceedsVout: 1, parentSellerProceedsSats: PROCEEDS,
      parentNetworkFeeSats: NETWORK_FEE, childNetworkFeeSats: CHILD_FEE,
      packageFeeSats: NETWORK_FEE + CHILD_FEE, packageFeeRate: 2, finalSellerProceedsSats: PROCEEDS - CHILD_FEE,
    });
    const items: PsbtBundleApprovalInput['items'] = [
      {
        psbtHex: bytesToHex(parent.toPSBT()), signInputs: { [segwit.address]: [1] }, sighashTypes: [1, 1],
        marketplaceIntent: pair.parent,
      },
      {
        psbtHex: bytesToHex(child.toPSBT()), signInputs: { [segwit.address]: [0] }, sighashTypes: [1],
        marketplaceIntent: pair.child,
      },
    ];
    return { items, parent };
  }

  it('proves and signs the child against the reviewed parent bytes, never the network', async () => {
    const { items, parent } = acceptance();
    const result = await review(items, 'acceptance-cpfp');
    expect(result.decodedInfo.review).toMatchObject({ status: 'proved', blockers: [] });
    expect(result.policy.blocked).toBe(false);

    const [signedParent, signedChild] = await approve(result, result.policy.requiresAcknowledgement);
    expect(parsePSBT(signedParent!).getInput(1).partialSig).toHaveLength(1);
    const child = parsePSBT(signedChild!);
    expect(bytesToHex(child.getInput(0).txid!)).toBe(parent.id);
    expect(child.getInput(0).partialSig).toHaveLength(1);
    // Only the child was handed the parent, and only the parent's own unsigned bytes.
    const calls = state.wallet.signPsbt.mock.calls as unknown[][];
    expect(calls[0]![4]).toBeUndefined();
    expect(calls[1]![4]).toEqual({ packageTransactions: { [parent.id]: bytesToHex(parent.toBytes(true, false)) } });
  });

  it('without the parent bytes the child cannot be verified: the network has never seen it', async () => {
    const { items } = acceptance();
    await expect(verifyPsbtPrevouts(items[1]!.psbtHex, { inputIndices: [0] }))
      .rejects.toThrow(/Could not independently verify previous transaction/);
  });

  it('blocks a child whose input value differs from the parent output it spends', async () => {
    const { items } = acceptance({ childSpends: id => ({ txid: id, index: 1, amount: BigInt(PROCEEDS + 1) }) });
    const result = await review(items, 'acceptance-cpfp');
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.decodedInfo.review.blockers).toContain(
      'the child input differs from the reviewed parent output it spends',
    );
    await expect(approve(result, true)).rejects.toThrow();
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('blocks a child that spends some transaction other than the parent in the bundle', async () => {
    const { items } = acceptance({ childSpends: () => ({ txid: 'ee'.repeat(32), index: 1, amount: BigInt(PROCEEDS) }) });
    const result = await review(items, 'acceptance-cpfp');
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.decodedInfo.review.blockers).toContain('the child input does not spend the reviewed parent transaction');
    await expect(approve(result, true)).rejects.toThrow();
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// fund-and-authorize-offers
// ---------------------------------------------------------------------------------------------

describe('fund-and-authorize-offers: one review funds the offer and authorizes it', () => {
  const OFFER = 5_000;
  const TAKER_FEE = 1_000;
  const FUNDING = 20_000;
  const FUND_FEE = 500;
  const ASSET_UTXO = 546;

  function fundAndAuthorize(options: {
    owner?: typeof segwit | typeof legacy;
    spends?: (fundId: string) => { txid: string; index: number; amount: bigint };
    targets?: number;
  } = {}) {
    const owner = options.owner ?? segwit;
    const coin = funding(owner.script, BigInt(FUNDING), 61);
    const fund = new Transaction({ version: 2, lockTime: 0 });
    fund.addInput(owner === legacy
      ? { txid: coin.id, index: 0, nonWitnessUtxo: coin.toBytes(true, false), sighashType: 1 }
      : { txid: coin.id, index: 0, witnessUtxo: { script: owner.script, amount: BigInt(FUNDING) }, sighashType: 1 });
    fund.addOutput({ script: owner.script, amount: BigInt(OFFER) });
    fund.addOutput({ script: owner.script, amount: BigInt(FUNDING - OFFER - FUND_FEE) });
    // Never broadcast: nobody but this review has seen the funding.
    const fundIntent = {
      standard: 'counterparty-marketplace', version: 1, action: 'fund_offers',
      operationId: `offer-funding:${fund.id}`, protocolVersion: 'exact_offer_v1', assets: [],
      bidder: owner.address, target: { scope: 'asset', asset: 'RAREPEPE' },
      priceSats: OFFER, platformFeeSats: 0, delivery: { mode: 'detached' },
      fundingInputs: [{ txid: coin.id, vout: 0, valueSats: FUNDING }], fundingValueSats: FUNDING,
      slotCount: 1, slotValueSats: OFFER, networkFeeSats: FUND_FEE, changeSats: FUNDING - OFFER - FUND_FEE,
      expectedTxid: fund.id, marketplaceExpiresAt: 2_000_003_600,
    };
    const authorizations = Array.from({ length: options.targets ?? 1 }, (_, index) => {
      const target = funding(outsider.script, BigInt(ASSET_UTXO), 70 + index);
      state.assets.set(`${target.id}:0`, [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }]);
      const spends = options.spends?.(fund.id) ?? { txid: fund.id, index: 0, amount: BigInt(OFFER) };
      const tx = new Transaction({ version: 2, lockTime: 0, allowUnknownOutputs: true });
      tx.addInput(owner === legacy
        ? { txid: spends.txid, index: spends.index, nonWitnessUtxo: fund.toBytes(true, false), sighashType: 1 }
        : { txid: spends.txid, index: spends.index, witnessUtxo: { script: owner.script, amount: spends.amount }, sighashType: 1 });
      tx.addInput({ txid: target.id, index: 0, witnessUtxo: { script: outsider.script, amount: BigInt(ASSET_UTXO) }, sighashType: 1 });
      tx.addOutput({ script: opReturn(spends.txid, 102, owner.address!), amount: 0n });
      tx.addOutput({ script: outsider.script, amount: BigInt(OFFER - TAKER_FEE + ASSET_UTXO - NETWORK_FEE) });
      tx.addOutput({ script: platform.script, amount: BigInt(TAKER_FEE) });
      return {
        psbtHex: bytesToHex(tx.toPSBT()), signInputs: { [owner.address!]: [0] }, sighashTypes: [1, 1],
        intent: {
          standard: 'counterparty-marketplace', version: 1, action: 'authorize_exact_offer',
          operationId: `auth-fund-${index}`, protocolVersion: 'exact_offer_v1',
          assets: [{ asset: 'RAREPEPE', quantityRaw: '1', sourceOutpoint: { txid: target.id, vout: 0 } }],
          authorizationId: `auth-fund-${index}`, bidder: owner.address, seller: outsider.address,
          priceSats: OFFER - TAKER_FEE, utxoValueSats: ASSET_UTXO,
          sellerProceedsSats: OFFER - TAKER_FEE + ASSET_UTXO - NETWORK_FEE, networkFeeSats: NETWORK_FEE,
          platformFeeSats: TAKER_FEE, sellerPaidFeeSats: TAKER_FEE, expectedTxid: tx.id,
          delivery: { mode: 'detached', address: owner.address },
          marketplaceExpiresAt: 2_000_003_600, bitcoinExpiresAt: null,
          bitcoinInvalidation: { type: 'spend_funding_outpoint', outpoint: { txid: fund.id, vout: 0 } },
        },
      };
    });
    const parsed = parseMarketplaceBatchIntents([fundIntent, ...authorizations.map(item => item.intent)]);
    expect(parsed.kind).toBe('fund-and-authorize-offers');
    const items: PsbtBundleApprovalInput['items'] = [
      {
        psbtHex: bytesToHex(fund.toPSBT()), signInputs: { [owner.address!]: [0] }, sighashTypes: [1],
        marketplaceIntent: parsed.intents[0]!,
      },
      ...authorizations.map((item, index) => ({
        psbtHex: item.psbtHex, signInputs: item.signInputs, sighashTypes: item.sighashTypes,
        marketplaceIntent: parsed.intents[index + 1]!,
      })),
    ];
    return { items, fund, coin };
  }

  it.each([1, 3])('proves the funding and %i authorization(s) together, then signs the funding first', async targets => {
    const { items, fund } = fundAndAuthorize({ targets });
    const result = await review(items, 'fund-and-authorize-offers');
    expect(result.decodedInfo.review).toMatchObject({
      status: 'caution', family: 'marketplace_batch', blockers: [],
      title: targets === 1 ? 'Fund and authorize 1 exact offer' : `Fund and authorize ${targets} exact offers`,
    });
    expect(result.decodedInfo.review.facts).toContainEqual({ kind: 'amount', label: 'Offer price', value: '5,000 sats' });
    expect(result.decodedInfo.items[0]!.marketplaceReview?.status).toBe('proved');
    expect(result.policy.blocked).toBe(false);

    const signed = await approve(result, result.policy.requiresAcknowledgement);
    expect(signed).toHaveLength(targets + 1);
    expect(computeTxid(finalizePSBT(signed[0]!))).toBe(fund.id);
    for (const hex of signed.slice(1)) {
      const authorization = parsePSBT(hex);
      expect(bytesToHex(authorization.getInput(0).txid!)).toBe(fund.id);
      expect(authorization.getInput(0).partialSig).toHaveLength(1);
      expect(authorization.getInput(1).partialSig).toBeUndefined();
    }
    const calls = state.wallet.signPsbt.mock.calls as unknown[][];
    expect(calls[0]![4]).toBeUndefined();
    for (const call of calls.slice(1)) {
      expect(call[4]).toEqual({ packageTransactions: { [fund.id]: bytesToHex(fund.toBytes(true, false)) } });
    }
  });

  describe('locked coins', () => {
    const store = { locks: [] as CoinLock[], updates: [] as CoinLockUpdate[], commits: [] as Array<[string, OfferCoinCommitment[]]> };
    beforeEach(() => {
      store.locks = []; store.updates = []; store.commits = [];
      setCoinLockStore({
        read: async () => store.locks,
        update: async (_address, update) => { store.updates.push(update); },
        commit: async (address, commitments) => { store.commits.push([address, commitments]); },
      });
    });
    afterEach(() => setCoinLockStore(null));

    it('locks the slot the signed funding set aside, with the offers authorized on it, before delivery', async () => {
      const { items, fund } = fundAndAuthorize({ targets: 2 });
      const result = await review(items, 'fund-and-authorize-offers');
      expect(result.decodedInfo.policyWarnings?.some(warning => warning.code === 'locked_coin_spend')).toBe(false);
      await approve(result, result.policy.requiresAcknowledgement);
      expect(store.commits).toEqual([[segwit.address, [{
        outpoint: `${fund.id}:0`, kind: 'offer_slot', refs: ['auth-fund-0', 'auth-fund-1'], valueSats: OFFER,
        origin: 'https://audit.invalid', expiresAt: 2_000_003_600,
      }]]]);
    });

    it('asks before funding offers from a coin the user locked, and confirming unlocks it before signing', async () => {
      const { items, coin } = fundAndAuthorize();
      store.locks = [{
        outpoint: `${coin.id}:0`, address: segwit.address!, kind: 'manual', manual: true, refs: [], valueSats: FUNDING,
        origin: null, expiresAt: null, createdAt: 1, seenAt: 1, unlocked: false,
      }];
      const result = await review(items, 'fund-and-authorize-offers');
      expect(result.policy.requiresAcknowledgement).toBe(true);
      expect(result.decodedInfo.policyWarnings).toContainEqual(expect.objectContaining({
        code: 'locked_coin_spend', severity: 'warning',
        data: { coins: [{ outpoint: `${coin.id}:0`, address: segwit.address, kind: 'manual', manual: true, offers: 0, valueSats: FUNDING }] },
      }));
      await expect(approve(result, false)).rejects.toThrow();
      expect(store.updates).toEqual([]);

      const again = await review(items, 'fund-and-authorize-offers');
      state.wallet.signPsbt.mockClear();
      await approve(again, true);
      expect(store.updates).toEqual([{ unlock: [`${coin.id}:0`] }]);
      expect(state.wallet.signPsbt).toHaveBeenCalled();
    });

    it('writes no lock when signing fails, and delivers the signature when the lock write fails', async () => {
      const { items } = fundAndAuthorize();
      state.wallet.signPsbt.mockRejectedValueOnce(new Error('device unplugged'));
      const failing = await review(items, 'fund-and-authorize-offers');
      await expect(approve(failing, failing.policy.requiresAcknowledgement)).rejects.toThrow('device unplugged');
      expect(store.commits).toEqual([]);

      setCoinLockStore({
        read: async () => [], update: async () => {},
        commit: async () => { throw new Error('keychain write failed'); },
      });
      const result = await review(items, 'fund-and-authorize-offers');
      await expect(approve(result, result.policy.requiresAcknowledgement)).resolves.toHaveLength(2);
    });
  });

  // The funding's inputs' ZELD lands on its first output, the slot; each authorization then sends
  // it to its first spendable output, the seller's proceeds. Broadcast first, the slot would be
  // indexed and the authorization's review would say so; in one review nothing has indexed it.
  const zeldWarnings = (item: DecodedPsbtBundleItem | undefined) => item && 'safety' in item
    ? item.safety.warnings.filter(warning => warning.code === 'zeld_movement') : [];

  it('says the ZELD on the funding inputs leaves with the authorization that spends the slot', async () => {
    const { items, coin } = fundAndAuthorize();
    state.zeld.set(`${coin.id}:0`, 4_096n * 10n ** 8n);
    const result = await review(items, 'fund-and-authorize-offers');
    const notice = { kind: 'leaves', destination: outsider.address, amount: (4_096n * 10n ** 8n).toString() };
    expect(zeldWarnings(result.decodedInfo.items[0])).toEqual([]);
    expect(zeldWarnings(result.decodedInfo.items[1])).toEqual([
      expect.objectContaining({ code: 'zeld_movement', severity: 'warning', data: notice })]);
    expect(result.decodedInfo.policyWarnings).toContainEqual(expect.objectContaining({
      code: 'zeld_movement', severity: 'warning', title: 'Transaction 2: ZELD Would Leave',
      data: { ...notice, items: [2] },
    }));
    expect(result.policy).toMatchObject({ blocked: false, requiresAcknowledgement: true });
  });

  it('blocks it while ZELD hunting is on, as the authorization alone would be', async () => {
    const { items, coin } = fundAndAuthorize();
    state.zeld.set(`${coin.id}:0`, 1n);
    state.zeldHuntSeconds = 20;
    const result = await review(items, 'fund-and-authorize-offers');
    expect(zeldWarnings(result.decodedInfo.items[1])).toEqual([
      expect.objectContaining({ code: 'zeld_movement', severity: 'block' })]);
    expect(result.policy.blocked).toBe(true);
    await expect(approve(result, true)).rejects.toThrow();
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('adds no ZELD notice when the funding inputs hold none', async () => {
    const { items } = fundAndAuthorize();
    const result = await review(items, 'fund-and-authorize-offers');
    for (const item of result.decodedInfo.items) expect(zeldWarnings(item)).toEqual([]);
    expect(result.decodedInfo.policyWarnings?.filter(warning => warning.code === 'zeld_movement')).toEqual([]);
  });

  it('cannot authorize the unbroadcast slot on its own: that is why the funding travels with it', async () => {
    const { items } = fundAndAuthorize();
    const result = await review([items[1]!], 'authorize-offers');
    expect(result.decodedInfo.review.status).toBe('retry');
    expect(result.policy.blocked).toBe(true);
  });

  it('blocks an authorization whose input 0 value differs from the funding output it spends', async () => {
    const { items } = fundAndAuthorize({ spends: id => ({ txid: id, index: 0, amount: BigInt(OFFER + 1) }) });
    const result = await review(items, 'fund-and-authorize-offers');
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.decodedInfo.review.blockers).toContain(
      'item 2: authorization input 0 differs from the offer funding output it spends',
    );
    await expect(approve(result, true)).rejects.toThrow();
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('blocks an authorization that spends something other than the funding in this review', async () => {
    const { items } = fundAndAuthorize({ spends: () => ({ txid: 'ee'.repeat(32), index: 0, amount: BigInt(OFFER) }) });
    // The claims still name the funding, so the parser admits the bundle; the bytes do not.
    const result = await review(items, 'fund-and-authorize-offers');
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.decodedInfo.review.blockers).toContain(
      'item 2: authorization input 0 does not spend the offer funding in this review',
    );
    await expect(approve(result, true)).rejects.toThrow();
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('blocks a funding whose Legacy input would change the txid the authorizations spend', async () => {
    state.address = legacy.address!;
    state.wallet.getActiveAddress.mockResolvedValue({ address: legacy.address });
    const { items } = fundAndAuthorize({ owner: legacy });
    const result = await review(items, 'fund-and-authorize-offers');
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.decodedInfo.review.blockers.some(problem =>
      problem.includes('offer funding spends an input other than P2WPKH or P2TR'))).toBe(true);
    await expect(approve(result, true)).rejects.toThrow();
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });
});
