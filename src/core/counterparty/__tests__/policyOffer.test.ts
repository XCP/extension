import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { extractPsbtDetails } from '@/core/bitcoin/psbt';
import { parseConsensusTransaction } from '@/core/bitcoin/rawTransaction';
import {
  type CanonicalPolicy,
  canonicalPolicyJson,
  decodePolicyDetachScript,
  decodePolicyLeaf,
  encodePolicyLeaf,
  parseWitnessStrippedParent,
  platformFeeSats,
  policyDetachScriptHex,
  policyHashHex,
  policyInternalKeyAddresses,
  policyOfferTaproot,
  policyTapLeafHash,
  unsignedPolicyParentVsize,
  validateCanonicalPolicy,
} from '@/core/counterparty/policyOffer';
import { POLICY_OFFER_VECTORS } from './policyOfferVectors';

const fundVectors = Object.entries(POLICY_OFFER_VECTORS.fund);
const acceptVectors = Object.entries(POLICY_OFFER_VECTORS.accept);

describe('funded_policy_offer_v1 port, cross-checked against the marketplace reference', () => {
  describe.each(fundVectors)('%s funding vector', (_name, vector) => {
    const { claim, derived, requests } = vector;

    it.each(claim.alternatives.map((alternative, index) => [index, alternative] as const))(
      'alternative %i: canonical policy, hash, leaf, tweak, detach, and size match byte for byte',
      (index, alternative) => {
        const expected = derived[index]!;
        const policy = alternative.policy as CanonicalPolicy;
        expect(canonicalPolicyJson(policy)).toBe(expected.canonicalPolicyJson);
        expect(policyHashHex(policy)).toBe(alternative.policyHash);

        const leaf = encodePolicyLeaf({
          priceSats: alternative.priceSats,
          expiresAt: alternative.expiresAt,
          deliveryAddress: claim.delivery.address,
          policyHash: alternative.policyHash,
          marketKey: claim.marketKey,
        });
        expect(bytesToHex(leaf)).toBe(alternative.leafHex);
        expect(leaf.length).toBe(114 + new TextEncoder().encode(claim.delivery.address).length);

        const taproot = policyOfferTaproot(claim.internalKey, leaf);
        expect(bytesToHex(taproot.leafHash)).toBe(expected.leafHash);
        expect(bytesToHex(taproot.outputKey)).toBe(expected.outputKey);
        expect(taproot.parity).toBe(expected.parity);
        expect(taproot.scriptPubKeyHex).toBe(alternative.offerScriptPubKey);
        expect(`${(0xc0 | taproot.parity).toString(16)}${claim.internalKey}`).toBe(expected.controlBlock);

        const detach = policyDetachScriptHex(claim.delivery.address, alternative.expectedParentTxid);
        expect(detach).toBe(expected.detachScriptHex);
        expect(detach).toBe(alternative.detachScriptHex);
        expect(decodePolicyDetachScript(detach, alternative.expectedParentTxid)).toBe(claim.delivery.address);

        const details = extractPsbtDetails(requests[index]!.hex);
        expect(details.transactionId).toBe(alternative.expectedParentTxid);
        expect(unsignedPolicyParentVsize(
          details.inputs.map(input => input.scriptType),
          details.outputs.map(output => output.script),
        )).toBe(expected.measuredVsize);
        expect(expected.measuredVsize).toBe(alternative.parentVsize);
      },
    );

    it('decodes each leaf back to exactly the committed terms', () => {
      for (const alternative of claim.alternatives) {
        expect(decodePolicyLeaf(hexToBytes(alternative.leafHex))).toEqual({
          priceSats: alternative.priceSats,
          expiresAt: alternative.expiresAt,
          deliveryAddress: claim.delivery.address,
          policyHash: alternative.policyHash,
          marketKey: claim.marketKey,
        });
      }
    });

    it('recognizes the bidder address as the internal key’s own', () => {
      expect(policyInternalKeyAddresses(claim.internalKey)).toContain(claim.bidder);
    });
  });

  it('builds the 148-byte leaf for a legacy 1… destination', () => {
    const { claim } = POLICY_OFFER_VECTORS.fund.legacyDelivery;
    expect(claim.delivery.address.startsWith('1')).toBe(true);
    expect(hexToBytes(claim.alternatives[0]!.leafHex).length).toBe(148);
  });

  it.each(acceptVectors)('%s acceptance: the child output 0 is the detach keyed by the parent txid', (_name, vector) => {
    const details = extractPsbtDetails(vector.request.hex);
    const parentTxid = vector.claim.offerOutpoint.parentTxid;
    expect(details.outputs[0]!.script).toBe(vector.detachScriptHex);
    expect(policyDetachScriptHex(vector.claim.delivery.address, parentTxid)).toBe(vector.detachScriptHex);
    expect(decodePolicyDetachScript(vector.detachScriptHex, parentTxid)).toBe(vector.claim.delivery.address);
    // Keyed by any other txid it is noise, never an address.
    expect(decodePolicyDetachScript(vector.detachScriptHex, vector.claim.expectedTxid)).toBeNull();
  });

  it.each(acceptVectors)('%s acceptance: parses the witness-stripped parent', (_name, vector) => {
    const parent = parseWitnessStrippedParent(vector.claim.parentRawHex);
    expect(parent.txid).toBe(vector.claim.offerOutpoint.parentTxid);
    expect(parent.version).toBe(3);
    expect(parent.inputCount).toBe(vector.claim.parentInputValuesSats.length);
    expect(parent.outputs[0]).toEqual({
      scriptHex: policyOfferTaproot(vector.claim.internalKey, hexToBytes(vector.claim.leafHex)).scriptPubKeyHex,
      valueSats: vector.claim.offerValueSats,
    });
  });

  it('refuses a parent serialized with witnesses', () => {
    const tx = parseConsensusTransaction(POLICY_OFFER_VECTORS.accept.trSeller.claim.parentRawHex);
    tx.updateInput(0, { finalScriptWitness: [new Uint8Array(64)] }, true);
    expect(() => parseWitnessStrippedParent(bytesToHex(tx.toBytes(true, true)))).toThrow(/without witnesses/);
  });

  describe('ord.net specimen (spec §2.1)', () => {
    const child = parseConsensusTransaction(POLICY_OFFER_VECTORS.ordnet.childHex);
    const witness = child.getInput(1).finalScriptWitness ?? [];

    it('reproduces their leaf hash, output key, and parity with this wallet’s tweak', () => {
      const leaf = witness[5]!;
      const controlBlock = witness[6]!;
      expect(leaf.length).toBe(311);
      const internalKey = bytesToHex(controlBlock.subarray(1));
      expect(internalKey).toBe('f3555e171a897d725b64486ce80923186761dd917085351775cc16fe5d673ceb');
      expect(bytesToHex(policyTapLeafHash(leaf))).toMatch(/^713e0af9[0-9a-f]{52}330b$/);
      const taproot = policyOfferTaproot(internalKey, leaf);
      expect(bytesToHex(taproot.outputKey)).toBe('8a57b54f8a74bab1118b3449f450a9b1a3c42e1b7839c2fca7a463fc23daa717');
      expect(taproot.parity).toBe(1);
      expect(controlBlock[0]).toBe(0xc0 | taproot.parity);
    });
  });
});

describe('canonical policy', () => {
  const collection: CanonicalPolicy = {
    scope: 'collection', asset: null, collection: 'rare-pepe', max_supply_units: null,
    min_supply_units: null, issued_year: null, series: 3, artist: null,
  };

  it('serializes with the version first and every key in order', () => {
    expect(canonicalPolicyJson(collection)).toBe(
      '{"v":1,"scope":"collection","asset":null,"collection":"rare-pepe","max_supply_units":null,'
      + '"min_supply_units":null,"issued_year":null,"series":3,"artist":null}',
    );
  });

  it.each<[string, unknown, RegExp]>([
    ['an unknown key', { ...collection, rarity: 'rare' }, /unknown policy key/],
    ['a missing key', (({ artist: _artist, ...rest }) => rest)(collection), /required/],
    ['a subasset longname', { ...collection, scope: 'asset', collection: null, series: null, asset: 'PEPE.card' }, /canonical compact asset id/],
    ['BTC', { ...collection, scope: 'asset', collection: null, series: null, asset: 'BTC' }, /canonical compact asset id/],
    ['traits on an asset policy', { ...collection, scope: 'asset', collection: null, asset: 'RAREPEPE' }, /trait predicates/],
    ['an uppercase collection', { ...collection, collection: 'Rare-Pepe' }, /lowercase/],
    ['a non-NFC artist', { ...collection, artist: 'Pépe' }, /NFC/],
    ['a control character', { ...collection, artist: 'a\u0007b' }, /control characters/],
    ['a negative trait', { ...collection, series: -1 }, /non-negative/],
    ['min above max supply', { ...collection, min_supply_units: 10, max_supply_units: 5 }, /exceeds/],
  ])('refuses %s', (_label, policy, pattern) => {
    expect(() => validateCanonicalPolicy(policy)).toThrow(pattern);
  });
});

describe('leaf decoding refusals', () => {
  const leafHex = POLICY_OFFER_VECTORS.fund.wpkh.claim.alternatives[0]!.leafHex;
  const leaf = hexToBytes(leafHex);

  it('refuses trailing bytes, a foreign tag, and attached delivery', () => {
    expect(() => decodePolicyLeaf(new Uint8Array([...leaf, 0x00]))).toThrow(/trailing/);
    const foreignTag = leaf.slice();
    foreignTag[3] = foreignTag[3]! ^ 0x01;
    expect(() => decodePolicyLeaf(foreignTag)).toThrow(/tag/);
    const attached = leaf.slice();
    attached[2 + 1 + 24 + 1 + 16] = 1;
    expect(() => decodePolicyLeaf(attached)).toThrow(/detached/);
  });
});

describe('platformFeeSats', () => {
  it.each([[5_000, 1_000], [39_999, 1_000], [40_000, 1_000], [40_001, 1_001], [100_000, 2_500]])(
    'charges %i sats %i', (price, fee) => {
      expect(platformFeeSats(price)).toBe(fee);
    },
  );
});
