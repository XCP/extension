import { describe, it, expect } from 'vitest';
import { Transaction, OutScript } from '@scure/btc-signer';
import * as secp from '@noble/secp256k1';
import { getPublicKey } from '@noble/secp256k1';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import {
  parseBareMultisig,
  assertSignableBareMultisig,
  signAndFinalizeBareMultisig,
} from '@/utils/blockchain/bitcoin/multisigSigner';
import {
  bareMultisigScript,
  buildPrevTx,
  counterpartyDataKey,
  derToCompact,
  legacySighashAll,
  offCurveFakeKey,
  parseWireTx,
  txidOf,
} from './helpers/bareMultisigFixtures';

describe('Multisig Signer', () => {
  const privateKey = hexToBytes('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  const compressedPubkey = getPublicKey(privateKey, true);
  const uncompressedPubkey = getPublicKey(privateKey, false);
  const otherKey = getPublicKey(hexToBytes('11'.repeat(32)), true);

  describe('parseBareMultisig', () => {
    it('parses a historical 1-of-2 script whose data slot is not a pubkey', () => {
      const script = bareMultisigScript(1, [compressedPubkey, counterpartyDataKey()]);

      const parsed = parseBareMultisig(script);

      expect(parsed).not.toBeNull();
      expect(parsed!.requiredSignatures).toBe(1);
      expect(parsed!.pubkeys).toHaveLength(2);
      expect(bytesToHex(parsed!.pubkeys[0])).toBe(bytesToHex(compressedPubkey));
    });

    it('parses a current 1-of-3 script with off-curve fake keys', () => {
      const script = bareMultisigScript(1, [offCurveFakeKey(0x02), offCurveFakeKey(0x03), uncompressedPubkey]);

      const parsed = parseBareMultisig(script);

      expect(parsed).not.toBeNull();
      expect(parsed!.requiredSignatures).toBe(1);
      expect(parsed!.pubkeys).toHaveLength(3);
      expect(bytesToHex(parsed!.pubkeys[2])).toBe(bytesToHex(uncompressedPubkey));
    });

    it('agrees with the library encoding of a standard multisig', () => {
      const script = OutScript.encode({ type: 'ms', m: 1, pubkeys: [compressedPubkey, otherKey] });

      const parsed = parseBareMultisig(script);

      expect(parsed).not.toBeNull();
      expect(parsed!.requiredSignatures).toBe(1);
      expect(parsed!.pubkeys.map(bytesToHex)).toEqual([compressedPubkey, otherKey].map(bytesToHex));
    });

    it('parses higher signature thresholds without judging them', () => {
      const script = bareMultisigScript(2, [compressedPubkey, otherKey]);

      expect(parseBareMultisig(script)?.requiredSignatures).toBe(2);
    });

    it.each([
      ['non-multisig script', OutScript.encode({ type: 'pkh', hash: new Uint8Array(20) })],
      ['truncated script', bareMultisigScript(1, [compressedPubkey]).slice(0, -1)],
      ['non-key push length', Uint8Array.of(0x51, 0x20, ...new Uint8Array(32), 0x51, 0xae)],
      ['key count mismatch', Uint8Array.of(0x51, 0x21, ...compressedPubkey, 0x52, 0xae)],
      ['missing CHECKMULTISIG', Uint8Array.of(0x51, 0x21, ...compressedPubkey, 0x51, 0xac)],
      ['empty script', new Uint8Array(0)],
    ])('returns null for %s', (_label, script) => {
      expect(parseBareMultisig(script)).toBeNull();
    });
  });

  describe('assertSignableBareMultisig', () => {
    const ourPubkeys = [compressedPubkey, uncompressedPubkey];

    it('accepts a 1-of-2 with our compressed key', () => {
      const script = bareMultisigScript(1, [compressedPubkey, counterpartyDataKey()]);

      expect(assertSignableBareMultisig(script, ourPubkeys).requiredSignatures).toBe(1);
    });

    it('accepts a 1-of-3 with our uncompressed key', () => {
      const script = bareMultisigScript(1, [offCurveFakeKey(0x02), offCurveFakeKey(0x03), uncompressedPubkey]);

      expect(assertSignableBareMultisig(script, ourPubkeys).pubkeys).toHaveLength(3);
    });

    it('rejects thresholds above one signature even when our key is present', () => {
      const script = bareMultisigScript(2, [compressedPubkey, otherKey]);

      expect(() => assertSignableBareMultisig(script, ourPubkeys))
        .toThrow('unsupported 2-of-2 multisig: only 1-of-N can be signed with a single key');
    });

    it('rejects scripts without our key', () => {
      const script = bareMultisigScript(1, [otherKey, counterpartyDataKey()]);

      expect(() => assertSignableBareMultisig(script, ourPubkeys))
        .toThrow('script does not contain our public key');
    });

    it('rejects non-multisig scripts', () => {
      const script = OutScript.encode({ type: 'pkh', hash: new Uint8Array(20) });

      expect(() => assertSignableBareMultisig(script, ourPubkeys)).toThrow('not a bare multisig script');
    });
  });

  describe('signAndFinalizeBareMultisig', () => {
    // One input per Counterparty layout the recovery API serves, plus one
    // fully-decodable script, signed in a single pass.
    const inputSpecs = [
      {
        label: 'historical 1-of-2, data slot unparseable, our compressed key',
        script: bareMultisigScript(1, [compressedPubkey, counterpartyDataKey()]),
        amount: 40_000n,
        signer: compressedPubkey,
      },
      {
        label: 'current 1-of-3, off-curve fakes, our uncompressed key',
        script: bareMultisigScript(1, [offCurveFakeKey(0x02), offCurveFakeKey(0x03), uncompressedPubkey]),
        amount: 35_000n,
        signer: uncompressedPubkey,
      },
      {
        label: 'fully decodable 1-of-2, both slots real pubkeys',
        script: bareMultisigScript(1, [compressedPubkey, otherKey]),
        amount: 25_000n,
        signer: compressedPubkey,
      },
    ];

    async function buildAndSign() {
      const tx = new Transaction();
      const prevTxids: string[] = [];
      for (const [index, spec] of inputSpecs.entries()) {
        const prevTxid = txidOf(buildPrevTx([{ amount: spec.amount, script: spec.script }], index + 1));
        prevTxids.push(prevTxid);
        tx.addInput({ txid: hexToBytes(prevTxid), index: 0, sequence: 0xfffffffd });
      }
      tx.addOutputAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 99_000n);
      await signAndFinalizeBareMultisig(tx, privateKey, inputSpecs.map((spec) => spec.script));
      return { wire: parseWireTx(hexToBytes(tx.hex)), prevTxids };
    }

    it('produces a cryptographically valid signature for every layout', async () => {
      const { wire, prevTxids } = await buildAndSign();

      expect(wire.inputs).toHaveLength(inputSpecs.length);
      expect(wire.outputs).toHaveLength(1);
      expect(wire.outputs[0].amount).toBe(99_000n);
      // Outpoints serialize little-endian; confirm they reference our prev txs
      wire.inputs.forEach((input, index) => {
        expect(bytesToHex(input.txidLE.slice().reverse())).toBe(prevTxids[index]);
        expect(input.sequence).toBe(0xfffffffd);
      });

      for (const [index, spec] of inputSpecs.entries()) {
        const scriptSig = wire.inputs[index].script;
        expect(scriptSig[0], spec.label).toBe(0x00); // OP_0
        expect(scriptSig[1], spec.label).toBe(scriptSig.length - 2); // single push
        expect(scriptSig[scriptSig.length - 1], spec.label).toBe(0x01); // SIGHASH_ALL

        const der = scriptSig.slice(2, -1);
        // Sighash recomputed by the independent wire-format implementation:
        // a valid signature proves the signer's preimage matched it.
        const sighash = legacySighashAll(wire, index, spec.script);
        expect(
          secp.verify(derToCompact(der), sighash, spec.signer, { prehash: false }),
          spec.label
        ).toBe(true);
        expect(
          secp.verify(derToCompact(der), sighash, otherKey, { prehash: false }),
          `${spec.label} (wrong key must fail)`
        ).toBe(false);
      }
    });

    it('throws on input count mismatch', async () => {
      const tx = new Transaction();
      tx.addInput({ txid: new Uint8Array(32).fill(1), index: 0, sequence: 0xfffffffd });
      tx.addOutputAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 1_000n);

      await expect(signAndFinalizeBareMultisig(tx, privateKey, []))
        .rejects.toThrow('Input count mismatch: tx has 1, provided 0 scripts');
    });
  });
});
