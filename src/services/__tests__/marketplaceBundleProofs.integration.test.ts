/** Real PSBT decoding, background review, prevout verification and software signing for the two
 * marketplace bundles whose proof crosses items: attach-and-list (the listing spends the attach's
 * unbroadcast output) and a batch of exact-offer authorizations sharing one funding outpoint.
 * Only wallet/session state and remote ledger responses are simulated. No broadcast. */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2pkh, p2wpkh, Script, Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AddressFormat } from '@/core/bitcoin/address';
import { finalizePSBT, parsePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { decodePsbtForApproval } from '@/core/bitcoin/psbtApprovalDecoder';
import type { PsbtBundleApprovalInput } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import { verifyPsbtPrevouts } from '@/core/bitcoin/psbtPrevouts';
import { computeTxid } from '@/core/bitcoin/transactionBroadcaster';
import { parseMarketplaceBatchIntents } from '@/core/counterparty/marketplaceBatch';
import { parseMarketplaceIntent } from '@/core/counterparty/marketplaceIntent';
import { arc4 } from '@/core/counterparty/unpack/binary';
import { beginSignFlow, getSignFlow } from '@/platform/provider/signFlow';
import { createProviderSigningService } from '@/services/providerSigningService';

type Balance = { asset: string; quantity: string; quantity_normalized: string };

const state = vi.hoisted(() => ({
  address: '',
  assets: new Map<string, Balance[] | 'fail'>(),
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
vi.mock('@/core/settings', () => ({ getActiveSettings: () => ({ zeldHuntSeconds: 0 }) }));
// The ledger has never seen any outpoint these tests fabricate, exactly like mainnet has never seen
// an unbroadcast attach output: every lookup answers [] unless a test says otherwise.
vi.mock('@/core/counterparty/api', () => ({
  fetchUtxoBalances: async (utxo: string) => {
    const entry = state.assets.get(utxo);
    if (entry === 'fail') throw new Error('Indexer unavailable');
    return { result: entry ?? [] };
  },
  fetchAssetDetails: async () => ({ asset: 'RAREPEPE', divisible: false }),
}));
vi.mock('@/core/counterparty/transaction', () => ({ decodeCounterpartyMessage: async () => undefined }));
vi.mock('@/core/counterparty/sourcePubkey', () => ({ getSourcePubkey: () => undefined }));
vi.mock('@/core/bitcoin/feeRate', () => ({ getFeeRates: async () => ({ fastestFee: 2 }) }));
vi.mock('@/core/zeld/protection', () => ({ classifyZeldOutpoints: async (inputs: unknown[]) => ({
  bearing: [], unknown: [], clean: inputs,
}) }));

const walletKey = new Uint8Array(32).fill(7);
const legacy = p2pkh(getPublicKey(walletKey));
const segwit = p2wpkh(getPublicKey(walletKey));
const outsider = p2wpkh(getPublicKey(new Uint8Array(32).fill(9)));
const platform = p2wpkh(getPublicKey(new Uint8Array(32).fill(11)));

const CNTRPRTY = hexToBytes('434e545250525459');
const opReturn = (key: string, typeId: number, body: string) => Script.encode([
  'RETURN',
  arc4(hexToBytes(key), new Uint8Array([...CNTRPRTY, typeId, ...new TextEncoder().encode(body)])),
]);

function funding(script: Uint8Array, amount: bigint, seed: number) {
  const tx = new Transaction();
  tx.addInput({ txid: new Uint8Array(32).fill(seed), index: 0 });
  tx.addOutput({ script, amount });
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
  state.wallet.getActiveWallet.mockResolvedValue({ id: 'audit', type: 'mnemonic', addressFormat: 'p2wpkh' });
  state.wallet.getActiveAddress.mockResolvedValue({ address: segwit.address });
  state.wallet.getPairedAddresses.mockResolvedValue({ legacy, segwit });
  state.wallet.signPsbt.mockClear();
  state.wallet.signPsbt.mockImplementation(async (hex: string, inputs: Record<string, number[]>, sighashes: number[]) => {
    let current = hex;
    for (const [address, indices] of Object.entries(inputs)) {
      const verified = await verifyPsbtPrevouts(current, { inputIndices: indices });
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
}

function attachAndList(options: PairOptions = {}): PsbtBundleApprovalInput['items'] {
  const source = options.legacySource ? legacy : segwit;
  const sourceFunding = funding(source.script, 100_000n, options.legacySource ? 21 : 22);
  const attach = new Transaction({ version: 2, lockTime: 0, allowUnknownOutputs: true });
  attach.addInput({ txid: sourceFunding.id, index: 0, nonWitnessUtxo: sourceFunding.toBytes(true, false), sighashType: 1 });
  attach.addOutput({ script: segwit.script, amount: 330n });
  attach.addOutput({ script: opReturn(sourceFunding.id, 101, options.attachBody ?? 'RAREPEPE|1|0'), amount: 0n });
  attach.addOutput({ script: source.script, amount: 98_670n });

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
    { psbtHex: bytesToHex(attach.toPSBT()), signInputs: { [source.address]: [0] }, sighashTypes: [1],
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

  it('keeps proving when the ledger is unreachable for the unbroadcast outpoint', async () => {
    const items = attachAndList();
    state.assets.set(`${parsePSBT(items[0]!.psbtHex).id}:0`, 'fail');
    const result = await review(items, 'attach-and-list');
    expect(listingReview(result)?.status).toBe('proved');
    expect(result.policy.blocked).toBe(false);
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
    expect(result.decodedInfo.items[0]!.marketplaceReview?.status).toBe('blocked');
    expect(result.decodedInfo.items[0]!.marketplaceReview?.blockers).toContain(
      'seller input 1 does not independently resolve to exactly one attached asset',
    );
    expect(result.policy.blocked).toBe(true);
  });

  it('never links a single create_listing request', async () => {
    const [, listing] = attachAndList();
    const decoded = await decodePsbtForApproval(listing!.psbtHex, [segwit.address], [1], [1, 0x83],
      undefined, 'counterparty', undefined, listing!.marketplaceIntent as never, [segwit.address]);
    expect(decoded.marketplaceReview?.status).toBe('blocked');
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
