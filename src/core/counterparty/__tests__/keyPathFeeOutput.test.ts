/**
 * The platform fee output of a buy or exact-offer transaction and the script-address caution.
 *
 * A Taproot fee address hides its script tree, so an unproven P2TR fee output paid from an
 * address holding assets keeps its caution. When the site declares the output's BIP86 internal key and the output
 * script is exactly that key's key-path output (no script tree), the output has no script path:
 * the wallet labels it "Marketplace fee" and drops the caution for that output, and only for it.
 *
 * Network lookups are mocked; the transaction bytes and the local decode are real.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2tr, p2wpkh, Script, Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const api = await import('@/core/counterparty/api');
const { resolveProtocolContext } = await import('@/core/counterparty/protocolContext');

// The bidder holds Counterparty assets, which is when the caution applies at all.
beforeEach(() => {
  vi.mocked(api.fetchTokenBalances).mockReset().mockResolvedValue([{ asset: 'PEPECASH' }] as never);
  vi.mocked(api.fetchOwnedAssets).mockReset().mockResolvedValue([]);
});

const secret = (fill: number) => new Uint8Array(32).fill(fill);
const bidder = p2wpkh(getPublicKey(secret(1), true));
const seller = p2wpkh(getPublicKey(secret(2), true));
const sellerTaproot = p2tr(getPublicKey(secret(2), true).slice(1));
/** The marketplace's fee key, used BIP86-style: x-only internal key, empty script tree. */
const FEE_KEY = bytesToHex(getPublicKey(secret(3), true).slice(1));
const keyPathFee = p2tr(hexToBytes(FEE_KEY));
/** Same internal key, but with a script leaf: what a hidden Counterparty commit would look like. */
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
  sellerScript?: Uint8Array;
  internalKey?: string;
} = {}) {
  const tx = new Transaction({ version: 2, lockTime: 0, allowUnknownOutputs: true });
  tx.addInput({ txid: BID_TXID, index: 0, witnessUtxo: { script: bidder.script, amount: BigInt(PRICE + FEE) } });
  tx.addInput({
    txid: ASSET_TXID, index: 0,
    witnessUtxo: { script: options.sellerScript ?? seller.script, amount: BigInt(UTXO) },
  });
  tx.addOutput({
    script: Script.encode(['RETURN', arc4(hexToBytes(BID_TXID), new Uint8Array([
      ...CNTRPRTY, 102, ...new TextEncoder().encode(bidder.address!),
    ]))]),
    amount: 0n,
  });
  tx.addOutput({ script: options.sellerScript ?? seller.script, amount: BigInt(PRICE + UTXO - NETWORK_FEE) });
  tx.addOutput({ script: options.feeScript ?? keyPathFee.script, amount: BigInt(FEE) });
  const psbtHex = bytesToHex(tx.toPSBT());
  const details = extractPsbtDetails(psbtHex);
  const sellerAddress = options.sellerScript ? sellerTaproot.address! : seller.address!;
  const intent = parseMarketplaceIntent({
    standard: 'counterparty-marketplace', version: 1, action: 'authorize_exact_offer',
    operationId: 'auth-1', protocolVersion: 'exact_offer_v1',
    assets: [{ asset: 'RAREPEPE', quantityRaw: '1', sourceOutpoint: { txid: ASSET_TXID, vout: 0 } }],
    authorizationId: 'auth-1', bidder: bidder.address, seller: sellerAddress,
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

const codes = (analysis: Awaited<ReturnType<typeof authorization>>) =>
  analysis.safety.warnings.map(warning => warning.code);

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
  it('keeps the script-address caution when the site declares no key (today\'s requests)', async () => {
    const analysis = await authorization();
    expect(analysis.marketplaceReview?.status).toBe('caution');
    expect(analysis.marketplaceReview?.keyPathFeeOutput).toBeUndefined();
    expect(analysis.safety.warnings.find(warning => warning.code === 'unproven_script_output'))
      .toMatchObject({ severity: 'warning', data: { addresses: [keyPathFee.address] } });
  });

  it('labels a proved key-path fee output "Marketplace fee" and drops its caution', async () => {
    const analysis = await authorization({ internalKey: FEE_KEY });
    expect(analysis.marketplaceReview).toMatchObject({
      status: 'caution', blockers: [], keyPathFeeOutput: { index: 2, address: keyPathFee.address },
    });
    expect(analysis.marketplaceReview?.facts).toContainEqual({
      kind: 'address', label: 'Marketplace fee', value: keyPathFee.address,
      description: 'Key-path Taproot address with no scripts: paying it cannot publish a Counterparty message from your address',
    });
    expect(codes(analysis)).not.toContain('unproven_script_output');
    expect(analysis.safety.warnings.some(warning => warning.severity === 'warning')).toBe(false);
    expect(analysis.safety.blocked).toBe(false);
  });

  // Mutation testing: the filter that drops the proved output's caution could drop everything else.
  it("keeps every other warning when it drops the proved output's caution", async () => {
    vi.mocked(resolveProtocolContext).mockResolvedValueOnce({
      context: {} as ProtocolContext,
      warnings: [{ severity: 'warning', title: 'Priced by an oracle', message: 'x' }],
    });
    const analysis = await authorization({ internalKey: FEE_KEY });
    expect(codes(analysis)).not.toContain('unproven_script_output');
    expect(analysis.safety.warnings).toContainEqual(expect.objectContaining({ severity: 'warning', title: 'Priced by an oracle' }));
    expect(analysis.safety.warnings.every(warning => typeof warning.title === 'string')).toBe(true);
  });

  it('blocks a fee output that hides a script behind the declared key', async () => {
    const analysis = await authorization({ internalKey: FEE_KEY, feeScript: scriptPathFee.script });
    expect(analysis.marketplaceReview?.status).toBe('blocked');
    expect(analysis.marketplaceReview?.blockers).toContain(
      'the platform fee output is not the key-path Taproot output of the declared internal key',
    );
    expect(analysis.marketplaceReview?.keyPathFeeOutput).toBeUndefined();
    expect(analysis.safety.blocked).toBe(true);
  });

  it('exempts only the proved fee output: another script address paid keeps the caution', async () => {
    const analysis = await authorization({ internalKey: FEE_KEY, sellerScript: sellerTaproot.script });
    expect(analysis.marketplaceReview?.keyPathFeeOutput).toEqual({ index: 2, address: keyPathFee.address });
    const caution = analysis.safety.warnings.find(warning => warning.code === 'unproven_script_output');
    expect(caution).toMatchObject({
      severity: 'warning', data: { addresses: [sellerTaproot.address], totalSats: PRICE + UTXO - NETWORK_FEE },
    });
    expect(caution?.message).not.toContain(keyPathFee.address);
  });
});

describe('platformFeeInternalKey on the wire', () => {
  it('rejects a key that is not 32-byte hex', () => {
    expect(() => authorization({ internalKey: 'abc' })).toThrow(/platformFeeInternalKey must be 32-byte hex/);
  });
});
