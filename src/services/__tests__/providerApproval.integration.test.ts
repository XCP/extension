/** Real PSBT decoding, background execution, prevout verification and software signing.
 * Only wallet/session state and remote ledger responses are simulated. No broadcast. */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2pkh, p2wpkh, Script, Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AddressFormat } from '@/core/bitcoin/address';
import { parsePSBT, signPSBT } from '@/core/bitcoin/psbt';
import type { PsbtBundleApprovalInput } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import { verifyPsbtPrevouts } from '@/core/bitcoin/psbtPrevouts';
import { parseAcceptanceCpfpBundleIntents } from '@/core/counterparty/marketplaceBundle';
import { parseMarketplaceIntent } from '@/core/counterparty/marketplaceIntent';
import { arc4 } from '@/core/counterparty/unpack/binary';
import { beginSignFlow, getSignFlow } from '@/platform/provider/signFlow';
import { createProviderSigningService } from '@/services/providerSigningService';

const state = vi.hoisted(() => ({
  address: '', zeld: false,
  assets: new Map<string, Array<{asset: string; quantity: string; quantity_normalized: string}>>(),
  lookupFailed: false,
  /** Previous transactions the simulated node knows, and how deep each is buried (0 = mempool). */
  parents: new Map<string, {hex: string; confirmations: number}>(),
  wallet: {
    isKeychainUnlocked: vi.fn(async () => true), getActiveWallet: vi.fn(),
    getActiveAddress: vi.fn(), getSettings: vi.fn(async () => ({strictTransactionVerification: true})),
    signPsbt: vi.fn(), getPairedAddresses: vi.fn(),
  },
}));
vi.mock('@/services/walletService', () => ({getWalletService: () => state.wallet}));
vi.mock('@/platform/auth/sessionManager', () => ({getSessionGeneration: () => 0, assertSessionGeneration: () => {}}));
vi.mock('@/services/connectionService', () => ({ getConnectionService: () => ({
  hasPermission: async () => true, hasPairedAddressPermission: async () => false,
}) }));
vi.mock('@/services/eventEmitterService', () => ({eventEmitterService: {emit: vi.fn()}}));
vi.mock('@/platform/walletManager', () => ({walletManager: {
  getSettings: () => ({connectedWebsites: ['https://audit.invalid']}),
  getActiveWallet: () => ({id: 'audit', addresses: [{address: state.address}]}),
}}));
vi.mock('@/core/settings', () => ({getActiveSettings: () => ({zeldHuntSeconds: 15})}));
vi.mock('@/core/counterparty/api', () => ({
  fetchUtxoBalances: async (utxo: string) => {
    if (state.lookupFailed) throw new Error('Indexer unavailable');
    return {result: state.assets.get(utxo) ?? []};
  },
  fetchBackendTransaction: async (txid: string) => {
    const parent = state.parents.get(txid);
    if (!parent) throw new Error('No such transaction');
    return parent;
  },
  fetchLedgerHeights: async () => ({backendHeight: 900_000, counterpartyHeight: 900_000}),
}));
// The explorer fallback knows nothing the simulated node does not.
vi.mock('@/core/bitcoin/utxo', async importOriginal => ({
  ...(await importOriginal<typeof import('@/core/bitcoin/utxo')>()),
  fetchPreviousRawTransaction: async () => null,
  fetchTransactionChainStatus: async () => null,
}));
vi.mock('@/core/counterparty/transaction', () => ({decodeCounterpartyMessage: async () => undefined}));
vi.mock('@/core/counterparty/sourcePubkey', () => ({getSourcePubkey: () => undefined}));
vi.mock('@/core/bitcoin/feeRate', () => ({getFeeRates: async () => ({fastestFee: 2})}));
vi.mock('@/core/zeld/protection', () => ({classifyZeldOutpoints: async (inputs: unknown[]) => ({
  bearing: state.zeld ? inputs : [], unknown: [], clean: state.zeld ? [] : inputs,
})}));

/** A confirmed-looking coin, created by a transaction the tests never need to fetch. */
function funding(script: Uint8Array, amount: bigint, seed: number) {
  const tx = new Transaction();
  tx.addInput({txid: new Uint8Array(32).fill(seed), index: 0});
  tx.addOutput({script, amount});
  return known(tx);
}

const walletKey = new Uint8Array(32).fill(7);
const wallet = p2pkh(getPublicKey(walletKey));
const paired = p2wpkh(getPublicKey(walletKey));
const outsider = p2wpkh(getPublicKey(new Uint8Array(32).fill(9)));

/** Make a transaction known to the simulated node, confirmed unless said otherwise. */
function known<T extends Transaction>(tx: T, confirmations = 6): T {
  state.parents.set(tx.id, {hex: bytesToHex(tx.toBytes(true, false)), confirmations});
  return tx;
}

function preparation(destination: { address: string; script: Uint8Array } = wallet, fee = 1000, seed = 1) {
  return preparationAttach(destination, fee, seed).item;
}

/** A marketplace prepare_asset attach: asset output 0, encrypted attach OP_RETURN, change last. */
function preparationAttach(
  destination: { address: string; script: Uint8Array } = wallet, fee = 1000, seed = 1,
  spend?: {tx: Transaction; vout: number; value: bigint},
) {
  const prev = spend?.tx ?? funding(wallet.script, 1_000_000n, seed);
  const vout = spend?.vout ?? 0;
  const value = spend?.value ?? 1_000_000n;
  const tx = new Transaction({version: 2, lockTime: 0, allowUnknownOutputs: true});
  tx.addInput({txid: prev.id, index: vout, nonWitnessUtxo: prev.toBytes(true, false),
    sighashType: 1});
  tx.addOutput({script: destination.script, amount: 546n});
  const payload = new Uint8Array([...hexToBytes('434e54525052545965'), ...new TextEncoder().encode('RAREPEPE|1|0')]);
  tx.addOutput({script: Script.encode(['RETURN', arc4(hexToBytes(prev.id), payload)]), amount: 0n});
  tx.addOutput({script: wallet.script, amount: value - 546n - BigInt(fee)});
  const marketplaceIntent = parseMarketplaceIntent({
    standard: 'counterparty-marketplace', version: 1, action: 'prepare_asset',
    operationId: 'audit-operation', protocolVersion: 'counterparty_prepare_assets_v1',
    assets: [{asset: 'RAREPEPE', quantityRaw: '1'}], assetSource: wallet.address,
    utxoOwner: destination.address, expectedAttachedOutpoint: {txid: tx.id, vout: 0},
    utxoValueSats: 546, networkFeeSats: fee,
    protocolFee: {asset: 'XCP', quotedAmountRaw: '25000000', actualAmountRaw: null,
      observedBlock: 900000, variableUntilConfirmed: true}, operationExpiresAt: 2000000000,
  });
  return {tx, item: {psbtHex: bytesToHex(tx.toPSBT()), signInputs: {[wallet.address]: [0]}, sighashTypes: [1], marketplaceIntent}};
}

async function review(items: PsbtBundleApprovalInput['items'], batch: boolean, bundleKind: PsbtBundleApprovalInput['bundleKind'] = 'prepare-assets') {
  const id = crypto.randomUUID();
  await beginSignFlow({id, walletId: 'audit', address: state.address, origin: 'https://audit.invalid',
    timestamp: Date.now(), requestKey: id, ...(batch
      ? {kind: 'sign-psbts' as const, bundleKind, items}
      : {kind: 'sign-psbt' as const, ...items[0]}),
  } as Parameters<typeof beginSignFlow>[0]);
  return createProviderSigningService().getReview(id);
}

beforeEach(() => {
  fakeBrowser.reset(); vi.stubGlobal('chrome', fakeBrowser); state.address = wallet.address; state.zeld = false;
  state.assets.clear(); state.lookupFailed = false; state.parents.clear();
  state.wallet.getActiveWallet.mockResolvedValue({id: 'audit', type: 'mnemonic', addressFormat: 'p2pkh'});
  state.wallet.getActiveAddress.mockResolvedValue({address: wallet.address});
  state.wallet.getPairedAddresses.mockResolvedValue({legacy: wallet, segwit: paired});
  state.wallet.signPsbt.mockClear();
  state.wallet.signPsbt.mockImplementation(async (hex, inputs, sighashes) => {
    const verified = await verifyPsbtPrevouts(hex, {inputIndices: inputs[state.address]});
    return signPSBT(verified.hex, bytesToHex(walletKey), inputs[state.address],
      state.address === wallet.address ? AddressFormat.P2PKH : AddressFormat.P2WPKH, sighashes);
  });
});

afterEach(() => vi.unstubAllGlobals());

async function signs(result: Awaited<ReturnType<typeof review>>, risksAcknowledged = false) {
  await createProviderSigningService().approveAndSign(result.request.id, {
    reviewKey: result.reviewKey, risksAcknowledged,
  });
  const completed = await getSignFlow(result.request.id);
  expect(completed?.status).toBe('completed');
  if (completed?.status !== 'completed') throw new Error('Signing did not complete');
  const output = completed.result as {signedPsbtHex?: string; signedPsbtHexes?: string[]};
  const signed = output.signedPsbtHexes ?? [output.signedPsbtHex!];
  for (const hex of signed) {
    const tx = parsePSBT(hex);
    expect(tx.getInput(0).partialSig?.length).toBe(1);
    tx.finalize();
    expect(tx.extract().length).toBeGreaterThan(0);
  }
}


it('requires the same high-fee acknowledgment for single and batch approvals', async () => {
  for (const batch of [false, true]) {
    const result = await review(batch ? [preparation(wallet, 500_000), preparation(wallet, 500_000, 2)] : [preparation(wallet, 500_000)], batch);
    expect(result.policy).toMatchObject({blocked: false, requiresAcknowledgement: true});
    await expect(signs(result)).rejects.toThrow(/acknowledge/);
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
    await signs(result, true);
    state.wallet.signPsbt.mockClear();
  }
});

it.each([false, true])('blocks an unrelated preparation recipient (batch=%s) before key use', async batch => {
  const result = await review(batch ? [preparation(outsider), preparation(outsider, 1000, 2)] : [preparation(outsider)], batch);
  expect(result.policy.blocked).toBe(true);
  await expect(signs(result, true)).rejects.toThrow(/did not pass/);
  expect(state.wallet.signPsbt).not.toHaveBeenCalled();
});

it.each([false, true])('signs Legacy-to-paired-SegWit preparation without a paired signing grant (batch=%s)', async batch => {
  const result = await review(batch ? [preparation(paired), preparation(paired, 1000, 2)] : [preparation(paired)], batch);
  expect(result.policy).toMatchObject({blocked: false, requiresAcknowledgement: false});
  await signs(result);
});

it('retains a ZELD safety block in an otherwise proved acceptance/CPFP bundle', async () => {
  state.zeld = true;
  const bundle = await review(acceptance(), true, 'acceptance-cpfp');
  if (bundle.kind !== 'sign-psbts') throw new Error('wrong kind');
  expect(bundle.decodedInfo.review.status).toBe('proved');
  expect(bundle.decodedInfo.review.blockers).toEqual([]);
  expect(bundle.decodedInfo.policyWarnings).toEqual(expect.arrayContaining([
    expect.objectContaining({severity: 'block', title: expect.stringContaining('ZELD Would Leave')}),
  ]));
  expect(bundle.policy.blocked).toBe(true);
  await expect(signs(bundle, true)).rejects.toThrow(/did not pass/);
  expect(state.wallet.signPsbt).not.toHaveBeenCalled();
});


function acceptance(childFee = 1000): PsbtBundleApprovalInput['items'] {
  state.address = paired.address;
  state.wallet.getActiveWallet.mockResolvedValue({id: 'audit', type: 'privateKey', addressFormat: 'p2wpkh'});
  state.wallet.getActiveAddress.mockResolvedValue({address: paired.address});
  const buyerFunding = funding(outsider.script, 250_546n, 3);
  const sellerFunding = funding(paired.script, 546n, 4);
  state.assets.set(`${sellerFunding.id}:0`, [{asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1'}]);
  const parent = new Transaction({version: 2, lockTime: 0});
  for (const tx of [buyerFunding, sellerFunding]) parent.addInput({
    txid: tx.id, index: 0, nonWitnessUtxo: tx.toBytes(true, false), sighashType: 1,
  });
  parent.addOutput({script: outsider.script, amount: 546n});
  parent.addOutput({script: paired.script, amount: 250_046n});
  parent.signIdx(new Uint8Array(32).fill(9), 0, [1]);
  const child = new Transaction({version: 2, lockTime: 0});
  child.addInput({txid: parent.id, index: 1, nonWitnessUtxo: parent.toBytes(true, false), sighashType: 1});
  child.addOutput({script: paired.script, amount: BigInt(250_046 - childFee)});
  const common = {standard: 'counterparty-marketplace', version: 1, operationId: 'offer',
    authorizationId: 'offer', protocolVersion: 'exact_offer_v1', seller: paired.address,
    assets: [{asset: 'RAREPEPE', quantityRaw: '1', sourceOutpoint: {txid: sellerFunding.id, vout: 0}}]};
  const parsed = parseAcceptanceCpfpBundleIntents({
    ...common, action: 'accept_exact_offer', bidder: outsider.address, priceSats: 250_000,
    utxoValueSats: 546, sellerProceedsSats: 250_046, networkFeeSats: 500, platformFeeSats: 0,
    expectedTxid: parent.id, delivery: {mode: 'attached', address: outsider.address, utxoValueSats: 546},
    marketplaceExpiresAt: 2000003600, bitcoinExpiresAt: null,
    bitcoinInvalidation: {type: 'spend_funding_outpoint', outpoint: {txid: buyerFunding.id, vout: 0}},
  }, {
    ...common, action: 'bump_acceptance_fee', parentExpectedTxid: parent.id, childExpectedTxid: child.id,
    parentSellerProceedsVout: 1, parentSellerProceedsSats: 250_046, parentNetworkFeeSats: 500,
    childNetworkFeeSats: childFee, packageFeeSats: 500 + childFee, packageFeeRate: 5,
    finalSellerProceedsSats: 250_046 - childFee,
  });
  return [
    {psbtHex: bytesToHex(parent.toPSBT()), signInputs: {[paired.address]: [1]}, sighashTypes: [1, 1], marketplaceIntent: parsed.parent},
    {psbtHex: bytesToHex(child.toPSBT()), signInputs: {[paired.address]: [0]}, sighashTypes: [1], marketplaceIntent: parsed.child},
  ];
}

it('signs a valid acceptance and linked CPFP child without an extra prompt', async () => {
  const result = await review(acceptance(), true, 'acceptance-cpfp');
  expect(result.policy).toMatchObject({blocked: false, requiresAcknowledgement: false});
  await signs(result);
});

it('requires acknowledgment for an excessive child fee even when its site quote is low', async () => {
  const result = await review(acceptance(100_000), true, 'acceptance-cpfp');
  expect(result.policy).toMatchObject({blocked: false, requiresAcknowledgement: true});
  await expect(signs(result)).rejects.toThrow(/acknowledge/);
  expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  await signs(result, true);
});

it('still signs a proved same-wallet fan-out without Counterparty data', async () => {
  const prev = funding(wallet.script, 100_000n, 5);
  const tx = new Transaction({version: 2, lockTime: 0});
  tx.addInput({txid: prev.id, index: 0, nonWitnessUtxo: prev.toBytes(true, false), sighashType: 1});
  for (const amount of [10_000n, 10_000n, 79_000n]) tx.addOutput({script: wallet.script, amount});
  const intent = parseMarketplaceIntent({
    standard: 'counterparty-marketplace', version: 1, action: 'prepare_bulk_fanout',
    operationId: 'fanout', protocolVersion: 'counterparty_bulk_attach_v1', assets: [], batchIndex: 0,
    seller: wallet.address, fundingOutpoint: {txid: prev.id, vout: 0}, fundingValueSats: 100_000,
    slotCount: 2, slotValueSats: 10_000, networkFeeSats: 1000, changeSats: 79_000,
    expectedTxid: tx.id, operationExpiresAt: 2000000000,
  });
  const result = await review([{psbtHex: bytesToHex(tx.toPSBT()), signInputs: {[wallet.address]: [0]},
    sighashTypes: [1], marketplaceIntent: intent}], true, 'bulk-fanout');
  expect(result.policy).toMatchObject({blocked: false, requiresAcknowledgement: false});
  await signs(result);
});

function offerFunding(
  source: {tx: Transaction; vout: number} = {tx: funding(wallet.script, 50_000n, 8), vout: 0},
): PsbtBundleApprovalInput['items'][number] {
  const prev = source.tx;
  const tx = new Transaction({version: 2, lockTime: 0});
  tx.addInput({txid: prev.id, index: source.vout, nonWitnessUtxo: prev.toBytes(true, false), sighashType: 1});
  for (const amount of [9_000n, 9_000n, 31_500n]) tx.addOutput({script: wallet.script, amount});
  const item = {psbtHex: bytesToHex(tx.toPSBT()), signInputs: {[wallet.address]: [0]}, sighashTypes: [1]};
  return {...item, marketplaceIntent: parseMarketplaceIntent({
    standard: 'counterparty-marketplace', version: 1, action: 'fund_offers',
    operationId: `offer-funding:${tx.id}`, protocolVersion: 'exact_offer_v1', assets: [],
    bidder: wallet.address, target: {scope: 'asset', asset: 'RAREPEPE'},
    priceSats: 8_000, platformFeeSats: 1_000, delivery: {mode: 'detached'},
    fundingInputs: [{txid: prev.id, vout: source.vout, valueSats: 50_000}], fundingValueSats: 50_000,
    slotCount: 2, slotValueSats: 9_000, networkFeeSats: 500, changeSats: 31_500,
    expectedTxid: tx.id, marketplaceExpiresAt: 2000000000,
  })};
}

it('signs a proved single offer funding without Counterparty data', async () => {
  const result = await review([offerFunding()], false);
  expect(result.policy).toMatchObject({blocked: false, requiresAcknowledgement: false});
  await signs(result);
});

it('keeps the Counterparty-only gate for the same self-send without an offer intent', async () => {
  const {marketplaceIntent: _intent, ...plain} = offerFunding();
  const id = crypto.randomUUID();
  await beginSignFlow({id, walletId: 'audit', address: state.address, origin: 'https://audit.invalid',
    timestamp: Date.now(), requestKey: id, kind: 'sign-psbt', ...plain,
  } as Parameters<typeof beginSignFlow>[0]);
  const result = await createProviderSigningService().getReview(id);
  expect(result.policy.blocked).toBe(true);
  await expect(signs(result, true)).rejects.toThrow();
  expect(state.wallet.signPsbt).not.toHaveBeenCalled();
});

it('refuses a batch when the asset indexer cannot check its funding inputs', async () => {
  state.lookupFailed = true;
  const result = await review([preparation()], true);
  expect(result.policy.blocked).toBe(true);
  await expect(signs(result, true)).rejects.toMatchObject({ reviewCode: 'retry_required' });
  expect(state.wallet.signPsbt).not.toHaveBeenCalled();
});

it('keeps a valid unfunded listing authorization signable and usable by its buyer', async () => {
  const prev = funding(wallet.script, 546n, 6);
  state.assets.set(`${prev.id}:0`, [{asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1'}]);
  const listing = new Transaction({version: 2, lockTime: 0});
  listing.addInput({txid: new Uint8Array(32), index: 0});
  listing.addInput({txid: prev.id, index: 0, nonWitnessUtxo: prev.toBytes(true, false), sighashType: 0x83});
  listing.addOutput({script: wallet.script, amount: 546n});
  listing.addOutput({script: wallet.script, amount: 250_546n});
  const marketplaceIntent = parseMarketplaceIntent({
    standard: 'counterparty-marketplace', version: 1, action: 'create_listing', operationId: 'listing',
    protocolVersion: 'counterparty_attach_listing_v1', seller: wallet.address,
    assets: [{asset: 'RAREPEPE', quantityRaw: '1', sourceOutpoint: {txid: prev.id, vout: 0}}],
    priceSats: 250_000, utxoValueSats: 546, guaranteedSellerPaymentSats: 250_546,
    delivery: {mode: 'buyer_selected_detach'}, signingRequestExpiresAt: 2000000000,
    marketplaceExpiresAt: 2000003600, bitcoinExpiresAt: null,
  });
  const result = await review([{psbtHex: bytesToHex(listing.toPSBT()), signInputs: {[wallet.address]: [1]},
    sighashTypes: [1, 0x83], marketplaceIntent}], true, 'bulk-listing');
  expect(result.policy).toMatchObject({blocked: false, requiresAcknowledgement: false});
  await createProviderSigningService().approveAndSign(result.request.id, {reviewKey: result.reviewKey, risksAcknowledged: false});
  const completed = await getSignFlow(result.request.id);
  if (completed?.status !== 'completed' || !('signedPsbtHexes' in completed.result)) throw new Error('Missing signed listing');
  const signed = parsePSBT(completed.result.signedPsbtHexes[0]!);
  expect(signed.getInput(1).partialSig).toHaveLength(1);
  // SINGLE|ANYONECANPAY permits a buyer to supply funding and delivery while fixing the seller's payout.
  const buyer = funding(outsider.script, 251_046n, 7);
  const purchase = new Transaction({version: 2, lockTime: 0});
  purchase.addOutput({script: outsider.script, amount: 546n});
  purchase.addOutput(signed.getOutput(1));
  purchase.addInput({txid: buyer.id, index: 0, nonWitnessUtxo: buyer.toBytes(true, false), sighashType: 1});
  purchase.addInput(signed.getInput(1));
  purchase.signIdx(new Uint8Array(32).fill(9), 0, [1]);
  purchase.finalize();
  expect(purchase.extract().length).toBeGreaterThan(0);
});

// --- Unconfirmed parents (pending attachments) -------------------------------------------------
// The ledger cannot show an attach until its block is parsed. These cover the marketplace chain
// shapes that must keep working before confirmation, and the spends that must wait for it.

const attachChange = (value = 1_000_000n, fee = 1000n) => value - 546n - fee;

it("signs the next attach in a chain funded by an unconfirmed attach's change", async () => {
  const first = preparationAttach(wallet, 1000, 21);
  known(first.tx, 0);
  const next = preparationAttach(wallet, 1000, 22, {tx: first.tx, vout: 2, value: attachChange()});
  for (const batch of [false, true]) {
    const result = await review([next.item], batch);
    expect(result.policy).toMatchObject({blocked: false, requiresAcknowledgement: false});
  }
  await signs(await review([next.item], false));
});

it("signs offer funding from an unconfirmed plain fan-out's first slot", async () => {
  const root = funding(wallet.script, 120_000n, 23);
  const fanout = new Transaction({version: 2, lockTime: 0});
  fanout.addInput({txid: root.id, index: 0, nonWitnessUtxo: root.toBytes(true, false)});
  for (const amount of [50_000n, 50_000n, 19_000n]) fanout.addOutput({script: wallet.script, amount});
  known(fanout, 0);
  for (const vout of [0, 1]) {
    const result = await review([offerFunding({tx: fanout, vout})], false);
    expect(result.policy).toMatchObject({blocked: false, requiresAcknowledgement: false});
  }
});

function paymentFrom(prev: Transaction, vout: number, value: bigint) {
  const tx = new Transaction({version: 2, lockTime: 0});
  tx.addInput({txid: prev.id, index: vout, nonWitnessUtxo: prev.toBytes(true, false), sighashType: 1});
  tx.addOutput({script: outsider.script, amount: 1_000n});
  tx.addOutput({script: wallet.script, amount: value - 1_500n});
  return {
    psbtHex: bytesToHex(tx.toPSBT()), signInputs: {[wallet.address]: [0]}, sighashTypes: [1],
    signingPurpose: 'bitcoin-payment' as const,
    bitcoinPaymentIntent: {standard: 'xcp-wallet/bitcoin-payment', version: 1, action: 'pay',
      outputs: [{address: outsider.address, amountSats: 1_000}]},
  };
}

async function reviewPayment(item: ReturnType<typeof paymentFrom>) {
  const id = crypto.randomUUID();
  await beginSignFlow({id, walletId: 'audit', address: state.address, origin: 'https://audit.invalid',
    timestamp: Date.now(), requestKey: id, kind: 'sign-psbt', ...item,
  } as Parameters<typeof beginSignFlow>[0]);
  return createProviderSigningService().getReview(id);
}

it("refuses a payment that spends an unconfirmed attach's asset output until it confirms", async () => {
  const attach = preparationAttach(wallet, 1000, 24);
  known(attach.tx, 0);
  const result = await reviewPayment(paymentFrom(attach.tx, 0, 546n + 2_000n));
  if (result.kind !== 'sign-psbt') throw new Error('wrong kind');
  expect(result.decodedInfo.attachedAssets).toEqual([expect.objectContaining({
    inputIndex: 0, lookupFailed: true, pendingParentTxid: attach.tx.id,
  })]);
  expect(result.policy.blocked).toBe(true);
  await expect(signs(result, true)).rejects.toMatchObject({ reviewCode: 'retry_required' });
  expect(state.wallet.signPsbt).not.toHaveBeenCalled();
});

it("still allows a payment from the same unconfirmed attach's change", async () => {
  const attach = preparationAttach(wallet, 1000, 25);
  known(attach.tx, 0);
  const result = await reviewPayment(paymentFrom(attach.tx, 2, attachChange()));
  if (result.kind !== 'sign-psbt') throw new Error('wrong kind');
  expect(result.decodedInfo.attachedAssets).toEqual([]);
  expect(result.policy.blocked).toBe(false);
});

it('refuses the first output of an unconfirmed plain spend of an attached UTXO', async () => {
  // No Counterparty payload, but it spends an attached UTXO: Core moves the asset to output 0.
  const attached = funding(wallet.script, 546n, 26);
  state.assets.set(`${attached.id}:0`, [{asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1'}]);
  const cash = funding(wallet.script, 50_000n, 27);
  const mover = new Transaction({version: 2, lockTime: 0});
  mover.addInput({txid: attached.id, index: 0});
  mover.addInput({txid: cash.id, index: 0});
  mover.addOutput({script: wallet.script, amount: 10_000n});
  mover.addOutput({script: wallet.script, amount: 40_000n});
  known(mover, 0);
  const exposed = await reviewPayment(paymentFrom(mover, 0, 10_000n));
  expect(exposed.policy.blocked).toBe(true);
  // Its second output is not Core's move destination.
  const change = await reviewPayment(paymentFrom(mover, 1, 40_000n));
  expect(change.policy.blocked).toBe(false);
});

it('reads the ledger again once an attach has confirmed and been parsed', async () => {
  const attach = preparationAttach(wallet, 1000, 28);
  known(attach.tx, 1);
  state.assets.set(`${attach.tx.id}:0`, [{asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1'}]);
  const result = await reviewPayment(paymentFrom(attach.tx, 0, 546n + 2_000n));
  if (result.kind !== 'sign-psbt') throw new Error('wrong kind');
  expect(result.decodedInfo.attachedAssets[0]?.assets).toHaveLength(1);
  expect(result.policy.blocked).toBe(true);
});

// --- Durable sell authorizations -----------------------------------------------------------------

function sellAuthorization(sighashType: number, seed: number) {
  const prev = funding(wallet.script, 546n, seed);
  state.assets.set(`${prev.id}:0`, [{asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1'}]);
  const tx = new Transaction({version: 2, lockTime: 0});
  tx.addInput({txid: prev.id, index: 0, nonWitnessUtxo: prev.toBytes(true, false), sighashType});
  tx.addOutput({script: wallet.script, amount: 1_000n});
  return {psbtHex: bytesToHex(tx.toPSBT()), signInputs: {[wallet.address]: [0]}, sighashTypes: [sighashType]};
}

async function reviewPlain(item: ReturnType<typeof sellAuthorization>) {
  const id = crypto.randomUUID();
  await beginSignFlow({id, walletId: 'audit', address: state.address, origin: 'https://audit.invalid',
    timestamp: Date.now(), requestKey: id, kind: 'sign-psbt', ...item,
  } as Parameters<typeof beginSignFlow>[0]);
  return createProviderSigningService().getReview(id);
}

it('refuses a SINGLE|ANYONECANPAY signature over an attached asset outside a proved listing, acknowledged or not', async () => {
  const result = await reviewPlain(sellAuthorization(0x83, 31));
  if (result.kind !== 'sign-psbt') throw new Error('wrong kind');
  expect(result.decodedInfo.safety.warnings[0]).toMatchObject({code: 'durable_sell_authorization', severity: 'block'});
  expect(result.policy.blocked).toBe(true);
  await expect(signs(result, true)).rejects.toThrow(/did not pass/);
  expect(state.wallet.signPsbt).not.toHaveBeenCalled();
});

it('leaves ALL|ANYONECANPAY over an attached asset to the acknowledged destination warning', async () => {
  const result = await reviewPlain(sellAuthorization(0x81, 32));
  if (result.kind !== 'sign-psbt') throw new Error('wrong kind');
  expect(result.decodedInfo.safety.warnings.map(warning => warning.code)).not.toContain('durable_sell_authorization');
  expect(result.policy.blocked).toBe(false);
});
