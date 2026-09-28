/**
 * The platform fee output of a buy or exact-offer transaction and its declared internal key.
 *
 * When the site declares the output's BIP86 internal key and the output script is exactly that
 * key's key-path output, the wallet labels it "Marketplace fee". A declared key the output does not
 * match is a claim that does not hold, and blocks.
 *
 * Network lookups are mocked; the transaction bytes and the local decode are real.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2tr, p2wpkh, Script, Transaction } from '@scure/btc-signer';
import { describe, expect, it, vi } from 'vitest';
import { extractPsbtDetails } from '@/core/bitcoin/psbt';
import { newProofLog, proveKeyPathFeeOutput } from '@/core/counterparty/marketplace/proofs';
import { parseMarketplaceIntent } from '@/core/counterparty/marketplaceIntent';
import { arc4 } from '@/core/counterparty/unpack/binary';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';
import type { ProtocolContext } from '../protocolContext';
import { analyzeSignRequest } from '../signRequestAnalysis';

vi.mock('@/core/zeld/protection', () => ({
  classifyZeldOutpoints: async () => ({ bearing: [], unknown: [], clean: [] }),
}));
vi.mock('@/core/counterparty/transaction', () => ({
  decodeCounterpartyMessage: vi.fn(async () => null),
  resolveMpmaRecipients: vi.fn(async () => []),
  describeMpmaSend: vi.fn(() => 'described locally'),
}));
vi.mock('@/core/counterparty/protocolContext', () => ({
  resolveProtocolContext: vi.fn(async () => ({ context: {} as ProtocolContext, warnings: [] })),
}));
vi.mock('@/core/counterparty/api', () => ({
  fetchTokenBalances: vi.fn(async () => []),
  fetchOwnedAssets: vi.fn(async () => []),
}));

const secret = (fill: number) => new Uint8Array(32).fill(fill);
const bidder = p2wpkh(getPublicKey(secret(1), true));
const seller = p2wpkh(getPublicKey(secret(2), true));
/** The marketplace's fee key, used BIP86-style: x-only internal key, empty script tree. */
const FEE_KEY = bytesToHex(getPublicKey(secret(3), true).slice(1));
const keyPathFee = p2tr(hexToBytes(FEE_KEY));
/** Same internal key, but with a script leaf: not the key-path output the key declares. */
const scriptPathFee = p2tr(hexToBytes(FEE_KEY), { script: Script.encode(['RETURN']) }, undefined, true);

const PRICE = 4_000;
const FEE = 1_000;
const NETWORK_FEE = 398;
const UTXO = 330;
const BID_TXID = '11'.repeat(32);
const ASSET_TXID = '22'.repeat(32);
const CNTRPRTY = hexToBytes('434e545250525459');

function authorization(options: {
  feeScript?: Uint8Array;
  internalKey?: string;
} = {}) {
  const tx = new Transaction({ version: 2, lockTime: 0, allowUnknownOutputs: true });
  tx.addInput({ txid: BID_TXID, index: 0, witnessUtxo: { script: bidder.script, amount: BigInt(PRICE + FEE) } });
  tx.addInput({
    txid: ASSET_TXID, index: 0,
    witnessUtxo: { script: seller.script, amount: BigInt(UTXO) },
  });
  tx.addOutput({
    script: Script.encode(['RETURN', arc4(hexToBytes(BID_TXID), new Uint8Array([
      ...CNTRPRTY, 102, ...new TextEncoder().encode(bidder.address!),
    ]))]),
    amount: 0n,
  });
  tx.addOutput({ script: seller.script, amount: BigInt(PRICE + UTXO - NETWORK_FEE) });
  tx.addOutput({ script: options.feeScript ?? keyPathFee.script, amount: BigInt(FEE) });
  const psbtHex = bytesToHex(tx.toPSBT());
  const details = extractPsbtDetails(psbtHex);
  const intent = parseMarketplaceIntent({
    standard: 'counterparty-marketplace', version: 1, action: 'authorize_exact_offer',
    operationId: 'auth-1', protocolVersion: 'exact_offer_v1',
    assets: [{ asset: 'RAREPEPE', quantityRaw: '1', sourceOutpoint: { txid: ASSET_TXID, vout: 0 } }],
    authorizationId: 'auth-1', bidder: bidder.address, seller: seller.address,
    priceSats: PRICE, utxoValueSats: UTXO, sellerProceedsSats: PRICE + UTXO - NETWORK_FEE,
    networkFeeSats: NETWORK_FEE, platformFeeSats: FEE, sellerPaidFeeSats: FEE,
    ...(options.internalKey === undefined ? {} : { platformFeeInternalKey: options.internalKey }),
    expectedTxid: details.transactionId,
    delivery: { mode: 'detached', address: bidder.address },
    marketplaceExpiresAt: 2_000_003_600, bitcoinExpiresAt: null,
    bitcoinInvalidation: { type: 'spend_funding_outpoint', outpoint: { txid: BID_TXID, vout: 0 } },
  });
  return analyzeSignRequest({
    counterpartyDataHex: extractPayloadFromOutputs(details.outputs.map(output => output.script ?? ''), BID_TXID)
      ?? undefined,
    inputs: details.inputs,
    outputs: details.outputs,
    signerAddresses: [bidder.address!],
    signedInputIndices: [0],
    signedInputs: [{ index: 0, sighashType: 0x01 }],
    transactionId: details.transactionId,
    attachedAssets: Promise.resolve([{
      inputIndex: 1, utxo: `${ASSET_TXID}:0`,
      assets: [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }],
    }]),
    marketplaceIntent: intent,
    ownedAddresses: [bidder.address!],
    transactionVersion: details.transactionVersion,
    lockTime: details.lockTime,
  });
}

describe('proveKeyPathFeeOutput', () => {
  const output = { index: 2, type: 'p2tr', address: keyPathFee.address!, value: FEE, script: bytesToHex(keyPathFee.script) };

  it('proves the key-path output of the declared key', () => {
    const log = newProofLog();
    expect(proveKeyPathFeeOutput(log, output, FEE_KEY)).toEqual({ index: 2, address: keyPathFee.address });
    expect(log.blockers).toEqual([]);
  });

  it('says nothing when no key is declared', () => {
    const log = newProofLog();
    expect(proveKeyPathFeeOutput(log, output, undefined)).toBeNull();
    expect(log.blockers).toEqual([]);
  });

  it.each([
    ['a script-tree output of the same internal key', { ...output, address: scriptPathFee.address!, script: bytesToHex(scriptPathFee.script) }, FEE_KEY],
    ['another key', output, bytesToHex(getPublicKey(secret(4), true).slice(1))],
    ['a key that is not a curve point', output, 'ff'.repeat(32)],
    ['a data output', { ...output, type: 'op_return' }, FEE_KEY],
    ['a missing output', undefined, FEE_KEY],
  ])('blocks %s', (_label, candidate, key) => {
    const log = newProofLog();
    expect(proveKeyPathFeeOutput(log, candidate, key)).toBeNull();
    expect(log.blockers).toEqual(['the platform fee output is not the key-path Taproot output of the declared internal key']);
  });
});

describe('the fee output on an exact-offer authorization', () => {
  it('names the fee recipient when the site declares no key', async () => {
    const analysis = await authorization();
    expect(analysis.marketplaceReview?.status).toBe('caution');
    expect(analysis.marketplaceReview?.keyPathFeeOutput).toBeUndefined();
    expect(analysis.marketplaceReview?.facts).toContainEqual({
      kind: 'address', label: 'Fee recipient', value: keyPathFee.address,
    });
    expect(analysis.safety.blocked).toBe(false);
  });

  it('labels a proved key-path fee output "Marketplace fee"', async () => {
    const analysis = await authorization({ internalKey: FEE_KEY });
    expect(analysis.marketplaceReview).toMatchObject({
      status: 'caution', blockers: [], keyPathFeeOutput: { index: 2, address: keyPathFee.address },
    });
    expect(analysis.marketplaceReview?.facts).toContainEqual({
      kind: 'address', label: 'Marketplace fee', value: keyPathFee.address,
    });
    expect(analysis.safety.warnings.some(warning => warning.severity === 'warning')).toBe(false);
    expect(analysis.safety.blocked).toBe(false);
  });

  it('blocks a fee output that is not the key-path output of the declared key', async () => {
    const analysis = await authorization({ internalKey: FEE_KEY, feeScript: scriptPathFee.script });
    expect(analysis.marketplaceReview?.status).toBe('blocked');
    expect(analysis.marketplaceReview?.blockers).toContain(
      'the platform fee output is not the key-path Taproot output of the declared internal key',
    );
    expect(analysis.marketplaceReview?.keyPathFeeOutput).toBeUndefined();
    expect(analysis.safety.blocked).toBe(true);
  });
});

describe('platformFeeInternalKey on the wire', () => {
  it('rejects a key that is not 32-byte hex', () => {
    expect(() => authorization({ internalKey: 'abc' })).toThrow(/platformFeeInternalKey must be 32-byte hex/);
  });
});
