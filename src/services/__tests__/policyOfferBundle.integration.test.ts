/** funded_policy_offer_v1 end to end in the wallet: real PSBT decoding, the background review of a
 * 1..N alternative funding set, prevout verification, and software signing of version-3 parents
 * (P2WPKH ALL and P2TR DEFAULT), then a seller's acceptance child. Only wallet/session state and
 * remote chain and ledger responses are simulated. The offer bytes are built here with the wallet's
 * own port; `policyOffer.test.ts` pins that port to the marketplace reference. No broadcast. */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as secp256k1 from '@noble/secp256k1';
import { p2pkh, p2tr, p2wpkh, SigHash, Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AddressFormat } from '@/core/bitcoin/address';
import { getPsbtApprovalPolicy } from '@/core/bitcoin/providerApprovalPolicy';
import { extractPsbtDetails, parsePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { decodePsbtForApproval } from '@/core/bitcoin/psbtApprovalDecoder';
import type { PsbtBundleApprovalInput } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import { verifyPsbtPrevouts } from '@/core/bitcoin/psbtPrevouts';
import { parseMarketplaceBatchIntents } from '@/core/counterparty/marketplaceBatch';
import { type AcceptPolicyOfferIntentClaim, parseMarketplaceIntent } from '@/core/counterparty/marketplaceIntent';
import {
  type CanonicalPolicy,
  encodePolicyLeaf,
  platformFeeSats,
  policyDetachScriptHex,
  policyHashHex,
  policyOfferTaproot,
  unsignedPolicyParentVsize,
} from '@/core/counterparty/policyOffer';
import { beginSignFlow, getSignFlow } from '@/platform/provider/signFlow';
import { createProviderSigningService } from '@/services/providerSigningService';

type Balance = { asset: string; quantity: string; quantity_normalized: string };

const state = vi.hoisted(() => ({
  address: '',
  /** The market key the test build pins: x-only of the private key 0x0b…0b. */
  marketKey: '552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84',
  assets: new Map<string, Balance[] | 'fail'>(),
  txStatus: new Map<string, { confirmed: boolean; block_height?: number } | 'missing' | 'fail'>(),
  ledgerHeight: 900_000,
  parents: new Map<string, string>(),
  wallet: {
    isKeychainUnlocked: vi.fn(async () => true), getActiveWallet: vi.fn(),
    getActiveAddress: vi.fn(), getSettings: vi.fn(async () => ({ strictTransactionVerification: true })),
    signPsbt: vi.fn(), getPairedAddresses: vi.fn(),
  },
}));
vi.mock('@/core/counterparty/policyOfferKeys', () => ({
  PINNED_POLICY_OFFER_MARKET_KEYS: [{ xOnlyKey: state.marketKey, operator: 'Digirare' }],
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
vi.mock('@/core/counterparty/api', () => ({
  fetchUtxoBalances: async (utxo: string) => {
    const entry = state.assets.get(utxo);
    if (entry === 'fail') throw new Error('Indexer unavailable');
    return { result: entry ?? [] };
  },
  fetchAssetDetails: async () => ({ asset: 'RAREPEPE', divisible: false }),
  fetchServerInfo: async () => ({ counterparty_height: state.ledgerHeight, backend_height: state.ledgerHeight }),
  clearApiCacheMatching: () => {},
  fetchBackendTransaction: async () => { throw new Error('Transaction not found'); },
  fetchLedgerHeights: async () => ({ backendHeight: state.ledgerHeight, counterpartyHeight: state.ledgerHeight }),
}));
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
        const match = /mempool\.space\/api\/tx\/([0-9a-f]{64})\/status$/.exec(url);
        if (!match) return actual.apiClient.get(url, config as never);
        const status = state.txStatus.get(match[1]!) ?? { confirmed: true, block_height: 800_000 };
        if (status === 'fail') throw Object.assign(new Error('explorer down'), { code: 'NETWORK_ERROR' });
        if (status === 'missing') throw notFound();
        return { data: status, status: 200 };
      },
    },
  };
});
vi.mock('@/core/counterparty/transaction', () => ({ decodeCounterpartyMessage: async () => undefined }));
vi.mock('@/core/counterparty/sourcePubkey', () => ({ getSourcePubkey: () => undefined }));
vi.mock('@/core/bitcoin/feeRate', () => ({ getFeeRates: async () => ({ fastestFee: 2 }) }));
vi.mock('@/core/zeld/protection', () => ({ classifyZeldOutpoints: async (inputs: unknown[]) => ({
  bearing: [], unknown: [], clean: inputs,
}) }));

// Schnorr verification below needs noble's hash; the wallet sets it the same way (bip322.ts).
if (!secp256k1.hashes.sha256) secp256k1.hashes.sha256 = msg => new Uint8Array(sha256(msg));

const walletKey = new Uint8Array(32).fill(7);
const publicKey = secp256k1.getPublicKey(walletKey);
const legacy = p2pkh(publicKey);
const segwit = p2wpkh(publicKey);
const taproot = p2tr(publicKey.slice(1));
const INTERNAL_KEY = bytesToHex(publicKey.slice(1));
const anchorScript = p2tr(secp256k1.schnorr.getPublicKey(new Uint8Array(32).fill(12))).script;
const feeScript = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(11))).script;
const sellerKey = new Uint8Array(32).fill(8);
const seller = p2tr(secp256k1.schnorr.getPublicKey(sellerKey));

const POLICY: CanonicalPolicy = {
  scope: 'collection', asset: null, collection: 'rare-pepe', max_supply_units: null,
  min_supply_units: null, issued_year: null, series: 3, artist: null,
};

function fabricate(script: Uint8Array, amount: bigint, seed: number) {
  const tx = new Transaction();
  tx.addInput({ txid: new Uint8Array(32).fill(seed), index: 0 });
  tx.addOutput({ script, amount });
  state.parents.set(tx.id, bytesToHex(tx.toBytes(true, false)));
  return tx;
}

type Bidder = 'wpkh' | 'tr';

interface Offer {
  items: PsbtBundleApprovalInput['items'];
  claim: Record<string, unknown>;
  funding: Transaction;
  parents: string[];
}

/** One funding set with `prices.length` alternatives, in the reference wire form. */
function policyOffer(kind: Bidder, prices: number[], seed: number): Offer {
  const bidder = kind === 'tr' ? taproot : segwit;
  const delivery = kind === 'tr' ? taproot.address! : legacy.address!;
  const fundingValue = 150_000;
  const funding = fabricate(bidder.script, BigInt(fundingValue), seed);
  const anchor = fabricate(anchorScript, 330n, seed + 100);
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86_400;
  const policyHash = policyHashHex(POLICY);
  const built = prices.map((priceSats) => {
    const leaf = encodePolicyLeaf({ priceSats, expiresAt, deliveryAddress: delivery, policyHash, marketKey: state.marketKey });
    const offerScript = policyOfferTaproot(INTERNAL_KEY, leaf).scriptPubKeyHex;
    const tx = new Transaction({ version: 3, lockTime: 0, allowUnknownOutputs: true });
    tx.addInput({ txid: funding.id, index: 0, sequence: 0xfffffffd,
      witnessUtxo: { script: bidder.script, amount: BigInt(fundingValue) } });
    tx.addInput({ txid: anchor.id, index: 0, sequence: 0xfffffffd, witnessUtxo: { script: anchorScript, amount: 330n } });
    tx.addOutput({ script: hexToBytes(offerScript), amount: BigInt(priceSats) });
    tx.addOutput({ script: anchorScript, amount: 330n });
    const changeSats = fundingValue - priceSats;
    tx.addOutput({ script: bidder.script, amount: BigInt(changeSats) });
    const psbtHex = bytesToHex(tx.toPSBT());
    const details = extractPsbtDetails(psbtHex);
    return {
      psbtHex,
      alternative: {
        expectedParentTxid: tx.id, priceSats, offerValueSats: priceSats, expiresAt, policy: POLICY, policyHash,
        leafHex: bytesToHex(leaf), offerScriptPubKey: offerScript,
        parentVsize: unsignedPolicyParentVsize(details.inputs.map(input => input.scriptType), details.outputs.map(output => output.script)),
        changeSats, parentFeeSats: 0, detachScriptHex: policyDetachScriptHex(delivery, tx.id),
      },
    };
  });
  const claim = {
    standard: 'counterparty-marketplace', version: 1, action: 'fund_policy_offer',
    protocolVersion: 'funded_policy_offer_v1', operationId: `policy-${seed}`, assets: [],
    bidder: bidder.address, internalKey: INTERNAL_KEY, marketKey: state.marketKey,
    delivery: { mode: 'detached', address: delivery },
    fundingInputs: [{ txid: funding.id, vout: 0, valueSats: fundingValue }],
    anchor: { txid: anchor.id, vout: 0, valueSats: 330, scriptPubKey: bytesToHex(anchorScript) },
    alternatives: built.map(entry => entry.alternative),
    marketplaceFee: { payer: 'seller', bps: 250, minSats: 1000 },
  };
  const parsed = parseMarketplaceBatchIntents(built.map(() => claim));
  expect(parsed.kind).toBe('fund-policy-offer');
  return {
    claim,
    funding,
    parents: built.map(entry => entry.psbtHex),
    items: built.map((entry, index) => ({
      psbtHex: entry.psbtHex,
      signInputs: { [bidder.address!]: [0] },
      sighashTypes: [kind === 'tr' ? 0x00 : 0x01, 0x00],
      marketplaceIntent: parsed.intents[index]!,
    })),
  };
}

async function review(items: PsbtBundleApprovalInput['items']) {
  const id = crypto.randomUUID();
  await beginSignFlow({ id, walletId: 'audit', address: state.address, origin: 'https://audit.invalid',
    timestamp: Date.now(), requestKey: id, kind: 'sign-psbts', bundleKind: 'fund-policy-offer', items,
  } as Parameters<typeof beginSignFlow>[0]);
  const result = await createProviderSigningService().getReview(id);
  if (result.kind !== 'sign-psbts') throw new Error('wrong review kind');
  return result;
}

async function approve(result: Awaited<ReturnType<typeof review>>): Promise<string[]> {
  await createProviderSigningService().approveAndSign(result.request.id, {
    reviewKey: result.reviewKey, risksAcknowledged: result.policy.requiresAcknowledgement,
  });
  const completed = await getSignFlow(result.request.id);
  if (completed?.status !== 'completed' || !('signedPsbtHexes' in completed.result)) {
    throw new Error('Signing did not complete');
  }
  return completed.result.signedPsbtHexes;
}

const formatFor = (address: string): AddressFormat =>
  address === taproot.address ? AddressFormat.P2TR
    : address === legacy.address ? AddressFormat.P2PKH : AddressFormat.P2WPKH;

function useWallet(kind: Bidder) {
  state.address = kind === 'tr' ? taproot.address! : segwit.address!;
  state.wallet.getActiveWallet.mockResolvedValue({ id: 'audit', type: 'mnemonic', addressFormat: kind === 'tr' ? 'p2tr' : 'p2wpkh' });
  state.wallet.getActiveAddress.mockResolvedValue({ address: state.address });
  state.wallet.getPairedAddresses.mockResolvedValue({ legacy, segwit });
}

/** Verify a funding input's signature against the parent's own sighash, and nothing else signed. */
function expectSignedFundingOnly(signedHex: string, kind: Bidder) {
  const tx = parsePSBT(signedHex);
  const scripts = [0, 1].map(index => tx.getInput(index).witnessUtxo!.script);
  const amounts = [0, 1].map(index => tx.getInput(index).witnessUtxo!.amount);
  expect(tx.version).toBe(3);
  if (kind === 'tr') {
    const signature = tx.getInput(0).tapKeySig!;
    // DEFAULT is the 64-byte encoding; a 65-byte ALL would carry its flag.
    expect(signature.length).toBe(64);
    const sighash = tx.preimageWitnessV1(0, scripts, SigHash.DEFAULT, amounts);
    expect(secp256k1.schnorr.verify(signature, sighash, taproot.tweakedPubkey)).toBe(true);
  } else {
    const [pubkey, der] = tx.getInput(0).partialSig![0]!;
    expect(bytesToHex(pubkey!)).toBe(bytesToHex(publicKey));
    expect(der!.at(-1)).toBe(SigHash.ALL);
    const scriptCode = p2pkh(publicKey).script;
    const digest = tx.preimageWitnessV0(0, scriptCode, SigHash.ALL, amounts[0]!);
    expect(secp256k1.verify(derToCompact(der!.slice(0, -1)), digest, publicKey, { prehash: false })).toBe(true);
  }
  const anchor = tx.getInput(1);
  expect(anchor.tapKeySig).toBeUndefined();
  expect(anchor.partialSig).toBeUndefined();
  expect(anchor.finalScriptWitness).toBeUndefined();
}

function derToCompact(der: Uint8Array): Uint8Array {
  const rLength = der[3]!;
  const r = der.slice(4, 4 + rLength);
  const s = der.slice(6 + rLength);
  const pad = (value: Uint8Array) => {
    const trimmed = value[0] === 0 ? value.slice(1) : value;
    const out = new Uint8Array(32);
    out.set(trimmed, 32 - trimmed.length);
    return out;
  };
  return new Uint8Array([...pad(r), ...pad(s)]);
}

beforeEach(() => {
  fakeBrowser.reset(); vi.stubGlobal('chrome', fakeBrowser);
  state.assets.clear();
  state.txStatus.clear();
  state.ledgerHeight = 900_000;
  useWallet('wpkh');
  state.wallet.signPsbt.mockClear();
  state.wallet.signPsbt.mockImplementation(async (hex: string, inputs: Record<string, number[]>, sighashes: number[]) => {
    let current = hex;
    for (const [address, indices] of Object.entries(inputs)) {
      const verified = await verifyPsbtPrevouts(current, { inputIndices: indices });
      current = signPSBT(verified.hex, bytesToHex(walletKey), indices, formatFor(address), sighashes);
    }
    return current;
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('fund-policy-offer bundle', () => {
  it.each<[Bidder, number]>([['wpkh', 1], ['wpkh', 3], ['tr', 1], ['tr', 12], ['tr', 100]])(
    'proves and signs a %s bidder’s %i alternatives in one review, funding inputs only',
    // 100 alternatives is the protocol cap: one review, one approval, 100 signatures.
    { timeout: 60_000 }, async (kind, count) => {
      useWallet(kind);
      const prices = Array.from({ length: count }, (_, index) => 100_000 - index * 500);
      const offer = policyOffer(kind, prices, 50 + count + (kind === 'tr' ? 20 : 0));
      const result = await review(offer.items);

      expect(result.decodedInfo.review.blockers).toEqual([]);
      expect(result.decodedInfo.review.status).toBe('caution');
      expect(result.decodedInfo.review.notices[0]?.message).toContain('Digirare');
      expect(result.decodedInfo.policyWarnings?.filter(warning => warning.severity === 'block')).toEqual([]);
      expect(result.policy.blocked).toBe(false);
      // A routine caution: the card states the key holder's authority; no second confirmation.
      expect(result.policy.requiresAcknowledgement).toBe(false);
      for (const item of result.decodedInfo.items) {
        expect(item.marketplaceReview).toMatchObject({ status: 'caution', family: 'fund_policy_offer' });
      }

      const signed = await approve(result);
      expect(signed).toHaveLength(count);
      signed.forEach((hex, index) => {
        expect(parsePSBT(hex).id).toBe(parsePSBT(offer.parents[index]!).id);
        expectSignedFundingOnly(hex, kind);
      });
    },
  );

  it('waits for an unconfirmed funding parent instead of signing it into a TRUC package', async () => {
    const offer = policyOffer('wpkh', [90_000, 80_000], 90);
    state.txStatus.set(offer.funding.id, { confirmed: false });
    const result = await review(offer.items);
    expect(result.decodedInfo.review.status).toBe('retry');
    expect(result.decodedInfo.review.blockers.join()).toMatch(/offer funding transaction .* is unconfirmed/);
    expect(result.policy.blocked).toBe(true);
    await expect(approve(result)).rejects.toThrow();
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('blocks a funding input that carries a Counterparty balance', async () => {
    const offer = policyOffer('wpkh', [90_000], 91);
    state.assets.set(`${offer.funding.id}:0`, [{ asset: 'XCP', quantity: '100', quantity_normalized: '0.000001' }]);
    const result = await review(offer.items);
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.policy.blocked).toBe(true);
  });

  it('blocks the whole set when one alternative names an unpinned market key', async () => {
    const offer = policyOffer('wpkh', [90_000, 80_000], 92);
    const other = { ...(offer.items[1]!.marketplaceIntent as unknown as Record<string, unknown>), marketKey: INTERNAL_KEY };
    offer.items[1] = { ...offer.items[1]!, marketplaceIntent: other as never };
    await expect(review(offer.items)).rejects.toThrow(/must share one bidder, keys/);
  });
});

describe('accept_policy_offer', () => {
  it('proves a P2TR seller’s acceptance child and signs input 1 only, DEFAULT', async () => {
    const offer = policyOffer('wpkh', [100_000], 93);
    const parentHex = offer.parents[0]!;
    const parent = parsePSBT(parentHex);
    const alternative = (offer.claim.alternatives as Array<Record<string, unknown>>)[0]!;
    const asset = fabricate(seller.script, 330n, 94);
    state.assets.set(`${asset.id}:0`, [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }]);
    // The parent is not broadcast, exactly as at acceptance time.
    state.txStatus.set(parent.id, 'missing');

    const price = 100_000;
    const fee = platformFeeSats(price);
    const networkFee = 1_800;
    const proceeds = price + 330 - fee - networkFee;
    const delivery = legacy.address!;
    const child = new Transaction({ version: 3, lockTime: 0, allowUnknownOutputs: true });
    child.addInput({ txid: parent.id, index: 0, sequence: 0xfffffffd,
      witnessUtxo: { script: hexToBytes(alternative.offerScriptPubKey as string), amount: BigInt(price) } });
    child.addInput({ txid: asset.id, index: 0, sequence: 0xfffffffd, witnessUtxo: { script: seller.script, amount: 330n } });
    child.addOutput({ script: hexToBytes(policyDetachScriptHex(delivery, parent.id)), amount: 0n });
    child.addOutput({ script: seller.script, amount: BigInt(proceeds) });
    child.addOutput({ script: feeScript, amount: BigInt(fee) });
    const childHex = bytesToHex(child.toPSBT());

    const intent = parseMarketplaceIntent({
      standard: 'counterparty-marketplace', version: 1, action: 'accept_policy_offer',
      protocolVersion: 'funded_policy_offer_v1', operationId: 'accept-1',
      assets: [{ asset: 'RAREPEPE', quantityRaw: '1', sourceOutpoint: { txid: asset.id, vout: 0 } }],
      offerOutpoint: { parentTxid: parent.id, vout: 0 }, offerValueSats: price, priceSats: price,
      parentRawHex: bytesToHex(parent.toBytes(true, false)), parentInputValuesSats: [150_000, 330],
      parentVsize: alternative.parentVsize, parentFeeSats: 0,
      leafHex: alternative.leafHex, internalKey: INTERNAL_KEY, seller: seller.address,
      utxoValueSats: 330, delivery: { mode: 'detached', address: delivery },
      platformFeeSats: fee, networkFeeSats: networkFee, packageVsize: 600, packageFeeRate: 3,
      sellerProceedsSats: proceeds, expectedTxid: child.id,
    }) as AcceptPolicyOfferIntentClaim;

    const decoded = await decodePsbtForApproval(childHex, [seller.address!], [1], [0x00, 0x00],
      undefined, 'counterparty', undefined, intent, [seller.address!]);
    expect(decoded.marketplaceReview?.blockers).toEqual([]);
    expect(decoded.marketplaceReview?.status).toBe('proved');
    const policy = getPsbtApprovalPolicy({ address: seller.address!, signInputs: { [seller.address!]: [1] }, sighashTypes: [0x00, 0x00] },
      decoded, true, 2);
    expect(policy.blocked).toBe(false);

    // The wallet signs its own key-path input 1 of the v3 child; input 0 stays for the market.
    const verified = await verifyPsbtPrevouts(childHex, { inputIndices: [1] });
    const signed = parsePSBT(signPSBT(verified.hex, bytesToHex(sellerKey), [1], AddressFormat.P2TR, [0x00, 0x00]));
    const scripts = [0, 1].map(index => signed.getInput(index).witnessUtxo!.script);
    const amounts = [0, 1].map(index => signed.getInput(index).witnessUtxo!.amount);
    const signature = signed.getInput(1).tapKeySig!;
    expect(signature.length).toBe(64);
    expect(secp256k1.schnorr.verify(signature, signed.preimageWitnessV1(1, scripts, SigHash.DEFAULT, amounts), seller.tweakedPubkey)).toBe(true);
    expect(signed.getInput(0).tapKeySig).toBeUndefined();
    expect(signed.id).toBe(child.id);
  });
});
