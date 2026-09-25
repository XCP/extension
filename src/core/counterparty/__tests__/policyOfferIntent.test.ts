import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { extractPsbtDetails, resolvePsbtSighashType } from '@/core/bitcoin/psbt';
import { parseConsensusTransaction } from '@/core/bitcoin/rawTransaction';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import {
  type AcceptPolicyOfferIntentClaim,
  analyzeMarketplaceIntent,
  type FundPolicyOfferIntentClaim,
  type MarketplaceAnalysisInput,
  marketplaceTransactionHeaderProblem,
  parseMarketplaceIntent,
} from '@/core/counterparty/marketplaceIntent';
import { policyDetachScriptHex } from '@/core/counterparty/policyOffer';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';
import { POLICY_OFFER_VECTORS } from './policyOfferVectors';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/** The requesting origin as the wallet's provider verified it; never a field of the site's claim. */
const ORIGIN = 'https://digirare.com';
const OTHER_KEY = POLICY_OFFER_VECTORS.fund.wpkh.otherMarketKey;
const NOW = POLICY_OFFER_VECTORS.fund.wpkh.now;

type FundVector = (typeof POLICY_OFFER_VECTORS.fund)[keyof typeof POLICY_OFFER_VECTORS.fund];
type AcceptVector = (typeof POLICY_OFFER_VECTORS.accept)[keyof typeof POLICY_OFFER_VECTORS.accept];

const PSBT_OPTIONS = { allowUnknownOutputs: true, allowUnknownInputs: true } as const;

/** Rebuild an unsigned template with a mutated header, inputs, or outputs. */
function rebuild(psbtHex: string, change: {
  version?: number;
  inputs?: (inputs: ReturnType<Transaction['getInput']>[]) => ReturnType<Transaction['getInput']>[];
  outputs?: (outputs: Array<{ script: Uint8Array; amount: bigint }>) => Array<{ script: Uint8Array; amount: bigint }>;
}): string {
  const source = Transaction.fromPSBT(hexToBytes(psbtHex), PSBT_OPTIONS);
  const tx = new Transaction({ ...PSBT_OPTIONS, version: change.version ?? source.version, lockTime: source.lockTime });
  let inputs = Array.from({ length: source.inputsLength }, (_, index) => source.getInput(index));
  let outputs = Array.from({ length: source.outputsLength }, (_, index) => {
    const output = source.getOutput(index);
    return { script: output.script!, amount: output.amount! };
  });
  if (change.inputs) inputs = change.inputs(inputs);
  if (change.outputs) outputs = change.outputs(outputs);
  for (const input of inputs) tx.addInput(input);
  for (const output of outputs) tx.addOutput(output);
  return bytesToHex(tx.toPSBT());
}

/** One alternative's claim, normalized the way the batch parser hands it to the analyzer. */
const itemClaim = (vector: FundVector, index: number): FundPolicyOfferIntentClaim => {
  const parsed = parseMarketplaceIntent(vector.claim) as FundPolicyOfferIntentClaim;
  return { ...parsed, alternatives: [parsed.alternatives[index]!] };
};

function fundInput(
  vector: FundVector,
  index = 0,
  overrides: { psbtHex?: string; intent?: FundPolicyOfferIntentClaim } & Partial<MarketplaceAnalysisInput> = {},
): MarketplaceAnalysisInput {
  const { psbtHex, intent, ...rest } = overrides;
  const request = vector.requests[index]!;
  const details = extractPsbtDetails(psbtHex ?? request.hex);
  const signed = Object.values(request.signInputs).flat();
  const claim = intent ?? itemClaim(vector, index);
  return {
    intent: claim,
    inputs: details.inputs,
    outputs: details.outputs,
    signedInputs: signed.map(inputIndex => ({
      index: inputIndex,
      sighashType: resolvePsbtSighashType(request.sighashTypes[inputIndex], details.inputs[inputIndex]?.sighashType),
    })),
    signerAddresses: [claim.bidder],
    ownedAddresses: [claim.bidder, claim.delivery.address],
    attachedAssets: [],
    attachedAssetDestination: null,
    hasCounterpartyPayload: false,
    transactionId: details.transactionId,
    transactionVersion: details.transactionVersion,
    lockTime: details.lockTime,
    policyOffer: { origin: ORIGIN, nowSeconds: NOW, fundingSettlement: { status: 'settled' } },
    ...rest,
  };
}

/** Rebuild alternative `index`'s bytes and re-point its claim at them, so the mutation — not a
 * stale txid — is what the wallet must catch. */
function mutatedAlternative(
  vector: FundVector,
  change: Parameters<typeof rebuild>[1],
  claimChange: (alternative: FundPolicyOfferIntentClaim['alternatives'][number]) => void = () => undefined,
  index = 0,
): { psbtHex: string; intent: FundPolicyOfferIntentClaim } {
  const psbtHex = rebuild(vector.requests[index]!.hex, change);
  const intent = clone(itemClaim(vector, index));
  const alternative = intent.alternatives[0]!;
  alternative.expectedParentTxid = extractPsbtDetails(psbtHex).transactionId;
  delete alternative.detachScriptHex;
  claimChange(alternative);
  return { psbtHex, intent };
}

describe('fund_policy_offer proof', () => {
  describe.each(Object.entries(POLICY_OFFER_VECTORS.fund))('%s bidder', (_name, vector) => {
    it.each(vector.claim.alternatives.map((_alternative, index) => index))(
      'proves alternative %i as a routine caution naming the origin and the market key', (index) => {
        const review = analyzeMarketplaceIntent(fundInput(vector, index));
        expect(review.blockers).toEqual([]);
        expect(review.status).toBe('caution');
        expect(review.family).toBe('fund_policy_offer');
        const alternative = vector.claim.alternatives[index]!;
        // No list of approved market keys: the leaf's key is disclosed, not looked up.
        const key = vector.claim.marketKey;
        expect(review.notices).toEqual([{
          severity: 'warning',
          message: `Market key ${key.slice(0, 8)}…${key.slice(-8)}, requested by ${ORIGIN}, can complete this `
            + `offer without you for up to ${alternative.offerValueSats.toLocaleString('en-US')} sats until a `
            + 'funding UTXO is spent. Nothing is broadcast now.',
        }]);
        const facts = Object.fromEntries(review.facts.map(fact => [fact.label, fact]));
        expect(facts['Offer price']?.value).toBe(`${alternative.priceSats.toLocaleString('en-US')} sats`);
        expect(facts['Network fee']).toMatchObject({
          value: 'None now', description: 'The seller who accepts pays the marketplace fee and the network fee',
        });
        expect(facts.Delivery?.value).toBe(vector.claim.delivery.address);
        expect(review.facts.filter(fact => fact.label === 'Funding UTXO')).toHaveLength(vector.claim.fundingInputs.length);
      },
    );

    it('also admits a P2TR bidder’s ALL and refuses DEFAULT only for P2WPKH', () => {
      const taproot = vector.kind === 'tr';
      const base = fundInput(vector);
      const withAll = { ...base, signedInputs: base.signedInputs.map(entry => ({ ...entry, sighashType: 0x01 })) };
      const withDefault = { ...base, signedInputs: base.signedInputs.map(entry => ({ ...entry, sighashType: 0x00 })) };
      expect(analyzeMarketplaceIntent(withAll).status).toBe('caution');
      expect(analyzeMarketplaceIntent(withDefault).status).toBe(taproot ? 'caution' : 'blocked');
    });
  });

  const wpkh = POLICY_OFFER_VECTORS.fund.wpkh;
  const tr = POLICY_OFFER_VECTORS.fund.tr;
  const otherScript = hexToBytes(POLICY_OFFER_VECTORS.accept.trSeller.feeScriptHex);

  it.each<[string, () => MarketplaceAnalysisInput, RegExp]>([
    ['no wallet-verified requesting origin', () => fundInput(wpkh, 0, {
      policyOffer: { nowSeconds: NOW, fundingSettlement: { status: 'settled' } },
    }), /could not establish the requesting site’s origin/],
    // The claimed key must be the one the committed leaf and offer output already name.
    ['a market key other than the one the leaf commits to', () => {
      const intent = clone(itemClaim(wpkh, 0));
      intent.marketKey = OTHER_KEY;
      return fundInput(wpkh, 0, { intent });
    }, /leaf differs from the one rebuilt/],
    ['a foreign internal key', () => {
      const intent = clone(itemClaim(wpkh, 0));
      intent.internalKey = tr.claim.internalKey;
      return fundInput(wpkh, 0, { intent });
    }, /internal key is not the bidder/],
    ['a delivery address this wallet does not own', () => fundInput(wpkh, 0, {
      ownedAddresses: [wpkh.claim.bidder],
    }), /delivery address does not belong/],
    ['a delivery address not in canonical form', () => {
      const intent = clone(itemClaim(wpkh, 0));
      intent.delivery.address = intent.delivery.address.toUpperCase();
      return fundInput(wpkh, 0, { intent, ownedAddresses: [wpkh.claim.bidder, wpkh.claim.delivery.address] });
    }, /canonical form/],
    ['a signer other than the bidder', () => fundInput(wpkh, 0, {
      signerAddresses: [POLICY_OFFER_VECTORS.accept.trSeller.seller],
    }), /signer is not exactly the claimed bidder/],
    ['funding not proven confirmed', () => fundInput(wpkh, 0, {
      policyOffer: { origin: ORIGIN, nowSeconds: NOW },
    }), /not proven confirmed/],
    ['a funding input that already carries assets (settlement)', () => fundInput(wpkh, 0, {
      policyOffer: { origin: ORIGIN, nowSeconds: NOW,
        fundingSettlement: { status: 'blocked', problem: 'offer input 0 already carries attached assets' } },
    }), /already carries attached assets/],
    ['a funding input that carries assets (ledger)', () => fundInput(wpkh, 0, {
      attachedAssets: [{ inputIndex: 0, utxo: 'x:0', assets: [{ asset: 'XCP', quantity: '1', quantity_normalized: '0.00000001' }] }],
    }), /carries attached Counterparty assets/],
    ['an extra output', () => fundInput(wpkh, 0, mutatedAlternative(wpkh, {
      outputs: outputs => [outputs[0]!, outputs[1]!, { ...outputs[2]!, amount: outputs[2]!.amount - 1_000n },
        { script: otherScript, amount: 1_000n }],
    }, alternative => { alternative.changeSats -= 1_000; alternative.parentVsize += 43; })), /expected exactly 3 outputs, got 4/],
    ['a missing anchor return', () => fundInput(wpkh, 0, mutatedAlternative(wpkh, {
      outputs: outputs => [outputs[0]!, outputs[2]!],
    }, alternative => { alternative.parentVsize -= 43; })), /output 1 does not return the anchor/],
    ['a parent fee of 330', () => fundInput(wpkh, 0, mutatedAlternative(wpkh, {
      outputs: outputs => [outputs[0]!, outputs[1]!, { ...outputs[2]!, amount: outputs[2]!.amount - 330n }],
    }, alternative => { alternative.changeSats -= 330; alternative.parentFeeSats = 330; })), /parent fee does not balance or exceeds 329/],
    ['transaction version 2', () => fundInput(wpkh, 0, mutatedAlternative(wpkh, { version: 2 })), /version 3/],
    ['a sequence other than 0xfffffffd', () => fundInput(wpkh, 0, mutatedAlternative(wpkh, {
      inputs: inputs => [{ ...inputs[0]!, sequence: 0xffffffff }, inputs[1]!],
    })), /sequence must be 0xfffffffd/],
    ['change sent to someone else', () => fundInput(wpkh, 0, mutatedAlternative(wpkh, {
      outputs: outputs => [outputs[0]!, outputs[1]!, { ...outputs[2]!, script: otherScript }],
    }, alternative => { alternative.parentVsize += 3; })), /change/],
    ['an offer output that is not the leaf tweak', () => fundInput(wpkh, 0, mutatedAlternative(wpkh, {
      outputs: outputs => [{ ...outputs[0]!, script: otherScript }, outputs[1]!, outputs[2]!],
    })), /output 0 is not the offer output/],
    ['SINGLE|ANYONECANPAY on a funding input', () => {
      const input = fundInput(wpkh);
      return { ...input, signedInputs: [{ index: 0, sighashType: 0x83 }] };
    }, /sign every funding input, and only those/],
    ['a request to sign the anchor', () => {
      const input = fundInput(wpkh);
      return { ...input, signedInputs: [...input.signedInputs, { index: 1, sighashType: 0x01 }] };
    }, /sign every funding input, and only those/],
    ['a policy that differs from its hash', () => {
      const intent = clone(itemClaim(wpkh, 0));
      intent.alternatives[0]!.policy.series = 4;
      return fundInput(wpkh, 0, { intent });
    }, /policy hash does not commit/],
    ['a price that differs from the committed leaf', () => {
      const intent = clone(itemClaim(wpkh, 0));
      intent.alternatives[0]!.priceSats += 1;
      intent.alternatives[0]!.offerValueSats += 1;
      return fundInput(wpkh, 0, { intent });
    }, /leaf differs from the one rebuilt/],
    ['a price below 5,000 sats', () => {
      const intent = clone(itemClaim(wpkh, 0));
      intent.alternatives[0]!.priceSats = 4_999;
      return fundInput(wpkh, 0, { intent });
    }, /below the 5000-sat minimum/],
    ['an expiry under ten minutes away', () => fundInput(wpkh, 0, {
      policyOffer: { origin: ORIGIN, nowSeconds: wpkh.claim.alternatives[0]!.expiresAt - 599,
        fundingSettlement: { status: 'settled' } },
    }), /expiry is not between/],
    ['an expiry over 90 days away', () => fundInput(wpkh, 0, {
      policyOffer: { origin: ORIGIN, nowSeconds: wpkh.claim.alternatives[0]!.expiresAt - 91 * 86_400,
        fundingSettlement: { status: 'settled' } },
    }), /expiry is not between/],
    ['a stale expected txid', () => {
      const intent = clone(itemClaim(wpkh, 0));
      intent.alternatives[0]!.expectedParentTxid = '00'.repeat(32);
      return fundInput(wpkh, 0, { intent });
    }, /not one of the claimed alternatives/],
    ['a substituted anchor script', () => {
      const intent = clone(itemClaim(wpkh, 0));
      intent.anchor.scriptPubKey = bytesToHex(otherScript);
      return fundInput(wpkh, 0, { intent });
    }, /anchor/],
    ['a funding input value that differs from the claim', () => {
      const intent = clone(itemClaim(wpkh, 0));
      intent.fundingInputs[0]!.valueSats += 1;
      return fundInput(wpkh, 0, { intent });
    }, /funding input 0 value differs/],
    ['a claimed parent size that differs from the bytes', () => {
      const intent = clone(itemClaim(wpkh, 0));
      intent.alternatives[0]!.parentVsize += 1;
      return fundInput(wpkh, 0, { intent });
    }, /parent size differs/],
    ['a detach script keyed to another destination', () => {
      const intent = clone(itemClaim(wpkh, 0));
      intent.alternatives[0]!.detachScriptHex = policyDetachScriptHex(wpkh.claim.bidder, intent.alternatives[0]!.expectedParentTxid);
      return fundInput(wpkh, 0, { intent });
    }, /detach script/],
    ['a Counterparty payload', () => fundInput(wpkh, 0, { hasCounterpartyPayload: true }), /Counterparty payload/],
  ])('refuses %s', (_label, build, pattern) => {
    const review = analyzeMarketplaceIntent(build());
    expect(review.status).toBe('blocked');
    expect(review.blockers.join('\n')).toMatch(pattern);
    expect(review.notices).toEqual([]);
  });

  it('asks for a retry, never a signature, when the funding confirmation or asset lookup is unknown', () => {
    const unconfirmed = analyzeMarketplaceIntent(fundInput(wpkh, 0, {
      policyOffer: { origin: ORIGIN, nowSeconds: NOW, fundingSettlement: {
        status: 'retry', problem: 'offer funding transaction ab is unconfirmed; retry after it confirms and Counterparty indexes it',
      } },
    }));
    expect(unconfirmed.status).toBe('retry');
    expect(unconfirmed.blockers.join()).toMatch(/unconfirmed/);
    const lookupFailed: InputAttachedAssets = { inputIndex: 0, utxo: 'x:0', assets: [], lookupFailed: true };
    expect(analyzeMarketplaceIntent(fundInput(wpkh, 0, { attachedAssets: [lookupFailed] })).status).toBe('retry');
  });

  it('pins version 3 with locktime 0 at the provider boundary', () => {
    const intent = { protocolVersion: 'funded_policy_offer_v1', action: 'fund_policy_offer' };
    expect(marketplaceTransactionHeaderProblem(intent, 3, 0)).toBeNull();
    expect(marketplaceTransactionHeaderProblem(intent, 2, 0)).toMatch(/version 3/);
    expect(marketplaceTransactionHeaderProblem(intent, 3, 1)).toMatch(/locktime 0/);
  });
});

describe('fund_policy_offer wire parser', () => {
  const claim = POLICY_OFFER_VECTORS.fund.wpkh.claim;

  it('accepts the reference claim', () => {
    expect(parseMarketplaceIntent(claim)).toMatchObject({ action: 'fund_policy_offer', alternatives: claim.alternatives });
  });

  it.each<[string, (value: ReturnType<typeof clone<typeof claim>>) => unknown, RegExp]>([
    ['attached delivery', value => ({ ...value, delivery: { mode: 'attached', scriptPubKey: '51', utxoValueSats: 330 } }), /attached delivery is not enabled/],
    ['no alternatives', value => ({ ...value, alternatives: [] }), /1\.\.100 alternatives/],
    ['101 alternatives', value => ({ ...value, alternatives: Array.from({ length: 101 }, () => value.alternatives[0]) }), /1\.\.100 alternatives/],
    ['nine funding inputs', value => ({ ...value, fundingInputs: Array.from({ length: 9 }, (_, vout) => ({ ...value.fundingInputs[0], vout })) }), /1\.\.8/],
    ['a repeated funding outpoint', value => ({ ...value, fundingInputs: [value.fundingInputs[0], value.fundingInputs[0]] }), /repeats/],
    ['an anchor that is a funding input', value => ({ ...value, anchor: { ...value.anchor, txid: value.fundingInputs[0]!.txid, vout: value.fundingInputs[0]!.vout } }), /anchor repeats/],
    ['an anchor that is not 330 sats', value => ({ ...value, anchor: { ...value.anchor, valueSats: 546 } }), /330/],
    ['a buyer-paid marketplace fee', value => ({ ...value, marketplaceFee: { payer: 'buyer', bps: 250, minSats: 1000 } }), /marketplaceFee/],
    ['a longname asset policy', value => {
      (value.alternatives[0] as { policy: unknown }).policy = {
        ...value.alternatives[0]!.policy, scope: 'asset', asset: 'PEPE.card', collection: null, series: null,
      };
      return value;
    }, /canonical compact asset id/],
    ['duplicate parents', value => ({ ...value, alternatives: [value.alternatives[0], value.alternatives[0]] }), /repeat a parent/],
    ['an omitted changeSats', value => {
      delete (value.alternatives[0] as Partial<(typeof value.alternatives)[number]>).changeSats;
      return value;
    }, /changeSats/],
  ])('refuses %s', (_label, mutate, pattern) => {
    expect(() => parseMarketplaceIntent(mutate(clone(claim)))).toThrow(pattern);
  });
});

// ---------------------------------------------------------------------------------------------
// accept_policy_offer
// ---------------------------------------------------------------------------------------------

const RAREPEPE_ONE: InputAttachedAssets['assets'] = [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }];

function acceptInput(
  vector: AcceptVector,
  overrides: { psbtHex?: string; intent?: AcceptPolicyOfferIntentClaim } & Partial<MarketplaceAnalysisInput> = {},
): MarketplaceAnalysisInput {
  const { psbtHex, intent, ...rest } = overrides;
  const details = extractPsbtDetails(psbtHex ?? vector.request.hex);
  const claim = intent ?? (parseMarketplaceIntent(vector.claim) as AcceptPolicyOfferIntentClaim);
  const payload = extractPayloadFromOutputs(details.outputs.map(output => output.script), details.inputs[0]!.txid);
  return {
    intent: claim,
    inputs: details.inputs,
    outputs: details.outputs,
    signedInputs: [{
      index: 1, sighashType: resolvePsbtSighashType(vector.request.sighashTypes[1], details.inputs[1]?.sighashType),
    }],
    signerAddresses: [claim.seller],
    ownedAddresses: [claim.seller],
    attachedAssets: [{ inputIndex: 1, utxo: `${claim.assets[0].sourceOutpoint.txid}:0`, assets: RAREPEPE_ONE }],
    attachedAssetDestination: null,
    hasCounterpartyPayload: payload !== null,
    transactionId: details.transactionId,
    transactionVersion: details.transactionVersion,
    lockTime: details.lockTime,
    ...rest,
  };
}

/** Rebuild the child and re-point the claim's txid at it. */
function mutatedChild(
  vector: AcceptVector,
  change: Parameters<typeof rebuild>[1],
  claimChange: (claim: AcceptPolicyOfferIntentClaim) => void = () => undefined,
): { psbtHex: string; intent: AcceptPolicyOfferIntentClaim } {
  const psbtHex = rebuild(vector.request.hex, change);
  const intent = clone(parseMarketplaceIntent(vector.claim) as AcceptPolicyOfferIntentClaim);
  intent.expectedTxid = extractPsbtDetails(psbtHex).transactionId;
  claimChange(intent);
  return { psbtHex, intent };
}

describe('accept_policy_offer proof', () => {
  it.each(Object.entries(POLICY_OFFER_VECTORS.accept))('proves the %s child and shows the seller’s economics', (_name, vector) => {
    const review = analyzeMarketplaceIntent(acceptInput(vector));
    expect(review.blockers).toEqual([]);
    expect(review.status).toBe('proved');
    const claim = vector.claim;
    const grouped = (value: number) => `${value.toLocaleString('en-US')} sats`;
    expect(review.paymentSummary?.map(fact => [fact.label, fact.value])).toEqual([
      ['You receive', grouped(claim.sellerProceedsSats)],
      ['Offer price', grouped(claim.priceSats)],
      ['Platform fee', grouped(claim.platformFeeSats)],
      ['Network fee', grouped(claim.networkFeeSats)],
      ['UTXO returned', grouped(claim.utxoValueSats)],
    ]);
    expect(review.paymentSummary?.[3]?.description).toBe(`Pays for 2 transactions, ${claim.packageVsize} vB`);
    expect(review.facts.at(-1)).toMatchObject({ label: 'Delivery', value: claim.delivery.address });
    expect(review.title).toBe(`Accept ${grouped(claim.priceSats)} for 1 RAREPEPE`);
  });

  const trSeller = POLICY_OFFER_VECTORS.accept.trSeller;
  const wpkhSeller = POLICY_OFFER_VECTORS.accept.wpkhSeller;
  const parsedTr = () => clone(parseMarketplaceIntent(trSeller.claim) as AcceptPolicyOfferIntentClaim);
  const foreign = hexToBytes(trSeller.feeScriptHex);

  const withWitness = (): string => {
    const tx = parseConsensusTransaction(trSeller.claim.parentRawHex);
    tx.updateInput(0, { finalScriptWitness: [new Uint8Array(72), new Uint8Array(33)] }, true);
    return bytesToHex(tx.toBytes(true, true));
  };

  it.each<[string, () => MarketplaceAnalysisInput, RegExp]>([
    ['a parent carrying the bidder’s witnesses', () => {
      const intent = parsedTr();
      intent.parentRawHex = withWitness();
      return acceptInput(trSeller, { intent });
    }, /without witnesses/],
    ['a parent that does not hash to the offer outpoint', () => {
      const intent = parsedTr();
      intent.parentRawHex = POLICY_OFFER_VECTORS.accept.wpkhSeller.claim.parentRawHex;
      return acceptInput(trSeller, { intent });
    }, /do not hash to the offer outpoint/],
    ['a leaf committing to another price', () => {
      const intent = parsedTr();
      intent.priceSats += 1;
      return acceptInput(trSeller, { intent });
    }, /leaf commits to a different price/],
    ['a leaf committing to another delivery', () => {
      const intent = parsedTr();
      intent.delivery.address = trSeller.seller;
      return acceptInput(trSeller, { intent });
    }, /leaf commits to a different delivery address/],
    ['a foreign internal key', () => {
      const intent = parsedTr();
      intent.internalKey = POLICY_OFFER_VECTORS.fund.tr.claim.internalKey;
      return acceptInput(trSeller, { intent });
    }, /parent output 0 is not the claimed offer/],
    ['a parent fee that does not balance', () => {
      const intent = parsedTr();
      intent.parentFeeSats = 1;
      return acceptInput(trSeller, { intent });
    }, /parent fee does not balance/],
    ['incomplete parent input values', () => {
      const intent = parsedTr();
      intent.parentInputValuesSats = intent.parentInputValuesSats.slice(0, 1);
      return acceptInput(trSeller, { intent });
    }, /cover every parent input/],
    ['a detach to someone else', () => acceptInput(trSeller, mutatedChild(trSeller, {
      outputs: outputs => [
        { script: hexToBytes(policyDetachScriptHex(trSeller.seller, trSeller.claim.offerOutpoint.parentTxid)), amount: 0n },
        outputs[1]!, outputs[2]!,
      ],
    })), /output 0 does not detach to the claimed delivery address/],
    ['a detach keyed by the wrong txid', () => acceptInput(trSeller, mutatedChild(trSeller, {
      outputs: outputs => [
        { script: hexToBytes(policyDetachScriptHex(trSeller.claim.delivery.address, trSeller.claim.expectedTxid)), amount: 0n },
        outputs[1]!, outputs[2]!,
      ],
    })), /output 0 does not detach/],
    ['proceeds paid to someone else', () => acceptInput(trSeller, mutatedChild(trSeller, {
      outputs: outputs => [outputs[0]!, { ...outputs[1]!, script: foreign }, outputs[2]!],
    })), /output 1 does not pay the seller/],
    ['a marketplace fee one sat high', () => acceptInput(trSeller, mutatedChild(trSeller, {
      outputs: outputs => [outputs[0]!, { ...outputs[1]!, amount: outputs[1]!.amount - 1n }, { ...outputs[2]!, amount: outputs[2]!.amount + 1n }],
    }, claim => { claim.platformFeeSats += 1; claim.sellerProceedsSats -= 1; })), /not the published fee/],
    ['a network fee that does not conserve', () => {
      const intent = parsedTr();
      intent.networkFeeSats += 1;
      return acceptInput(trSeller, { intent });
    }, /do not equal the proceeds/],
    ['an extra input', () => acceptInput(trSeller, mutatedChild(trSeller, {
      inputs: inputs => [...inputs, { ...inputs[1]!, index: 7 }],
    })), /2 inputs and 3 outputs/],
    ['transaction version 2', () => acceptInput(trSeller, mutatedChild(trSeller, { version: 2 })), /version 3/],
    ['an input that is not the offer outpoint', () => acceptInput(trSeller, mutatedChild(trSeller, {
      inputs: inputs => [{ ...inputs[0]!, index: 1 }, inputs[1]!],
    })), /input 0 is not the offer outpoint/],
    ['a request to sign the offer input', () => {
      const input = acceptInput(trSeller);
      return { ...input, signedInputs: [{ index: 0, sighashType: 0x00 }, ...input.signedInputs] };
    }, /sign only input 1/],
    ['DEFAULT on a P2WPKH seller', () => {
      const input = acceptInput(wpkhSeller);
      return { ...input, signedInputs: [{ index: 1, sighashType: 0x00 }] };
    }, /sign only input 1 with ALL/],
    ['SINGLE|ANYONECANPAY', () => {
      const input = acceptInput(trSeller);
      return { ...input, signedInputs: [{ index: 1, sighashType: 0x83 }] };
    }, /sign only input 1/],
    ['a signer other than the seller', () => acceptInput(trSeller, {
      signerAddresses: [POLICY_OFFER_VECTORS.fund.wpkh.claim.bidder],
    }), /not exactly the claimed seller/],
    ['an asset UTXO holding a second asset', () => acceptInput(trSeller, {
      attachedAssets: [{ inputIndex: 1, utxo: 'x:0', assets: [...RAREPEPE_ONE, { asset: 'XCP', quantity: '1', quantity_normalized: '0.00000001' }] }],
    }), /exactly one attached asset/],
    ['an asset UTXO holding two units', () => acceptInput(trSeller, {
      attachedAssets: [{ inputIndex: 1, utxo: 'x:0', assets: [{ asset: 'RAREPEPE', quantity: '2', quantity_normalized: '2' }] }],
    }), /raw attached quantity differs/],
    ['an asset UTXO holding another asset', () => acceptInput(trSeller, {
      attachedAssets: [{ inputIndex: 1, utxo: 'x:0', assets: [{ asset: 'PEPECASH', quantity: '1', quantity_normalized: '1' }] }],
    }), /attached asset differs/],
  ])('refuses %s', (_label, build, pattern) => {
    const review = analyzeMarketplaceIntent(build());
    expect(review.status).toBe('blocked');
    expect(review.blockers.join('\n')).toMatch(pattern);
    expect(review.paymentSummary).toBeUndefined();
  });

  it('asks for a retry when the asset lookup fails', () => {
    const review = analyzeMarketplaceIntent(acceptInput(trSeller, {
      attachedAssets: [{ inputIndex: 1, utxo: 'x:0', assets: [], lookupFailed: true }],
    }));
    expect(review.status).toBe('retry');
  });

  it('labels a sold-or-moved asset UTXO as a ledger change', () => {
    const review = analyzeMarketplaceIntent(acceptInput(trSeller, { attachedAssets: [] }));
    expect(review).toMatchObject({ status: 'blocked', blockKind: 'ledger' });
  });

  it.each<[string, (value: ReturnType<typeof clone<typeof trSeller.claim>>) => unknown, RegExp]>([
    ['attached delivery', value => ({ ...value, delivery: { mode: 'attached', address: value.seller } }), /attached delivery is not enabled/],
    ['an offer outpoint other than output 0', value => ({ ...value, offerOutpoint: { ...value.offerOutpoint, vout: 1 } }), /output 0/],
    ['a non-finite package rate', value => ({ ...value, packageFeeRate: 'fast' }), /packageFeeRate/],
    ['a single parent input value', value => ({ ...value, parentInputValuesSats: [1] }), /parentInputValuesSats/],
  ])('refuses to parse %s', (_label, mutate, pattern) => {
    expect(() => parseMarketplaceIntent(mutate(clone(trSeller.claim)))).toThrow(pattern);
  });
});
