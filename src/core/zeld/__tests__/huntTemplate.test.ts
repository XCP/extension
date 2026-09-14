import { hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { parseConsensusTransaction } from '@/core/bitcoin/rawTransaction';
import {
  assertOnlySequenceChanged,
  assessZeldHunt,
  locateInputSequences,
  messageWithNonce,
  rawTransactionWithSequence,
} from '@/core/zeld/huntTemplate';
import { MutableSha256d } from '@/core/zeld/sha256d';
import {
  enhancedSendRawTx,
  OTHER_ADDRESS,
  opReturnScript,
  PREV_TXID,
  SOURCE_ADDRESS,
  SOURCE_P2WPKH,
  unsignedRawTx,
} from './fixtures';

const otherScript = hexToBytes('0014' + '3'.repeat(40));

describe('locateInputSequences', () => {
  it('finds each sequence field in the non-witness serialization', () => {
    const raw = unsignedRawTx({
      inputs: [{ txid: PREV_TXID, index: 0, sequence: 0xfffffffd }, { txid: PREV_TXID, index: 1 }],
      outputs: [{ script: SOURCE_P2WPKH.script, amount: 1_000n }],
    });
    const bytes = hexToBytes(raw);
    const layout = locateInputSequences(bytes);
    expect(layout.hasScriptSig).toBe(false);
    // version(4) + count(1) + outpoint(36) + scriptSig length(1) = 42; the next input starts 41 later.
    expect(layout.sequenceOffsets).toEqual([42, 83]);
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getUint32(42, true)).toBe(0xfffffffd);
    expect(view.getUint32(83, true)).toBe(0xffffffff);
  });

  it('skips the SegWit marker when a witness serialization is given', () => {
    const raw = enhancedSendRawTx();
    const stripped = hexToBytes(raw);
    // Splice in marker and flag after the version, as a witness serialization would carry.
    const witness = new Uint8Array(stripped.length + 2);
    witness.set(stripped.subarray(0, 4));
    witness[4] = 0x00;
    witness[5] = 0x01;
    witness.set(stripped.subarray(4), 6);
    expect(locateInputSequences(witness).sequenceOffsets).toEqual([44]);
  });

  it('reports inputs that already carry script bytes', () => {
    const raw = hexToBytes(enhancedSendRawTx());
    // Give input 0 a one-byte scriptSig by rewriting its length and inserting a byte.
    const patched = new Uint8Array(raw.length + 1);
    patched.set(raw.subarray(0, 41));
    patched[41] = 0x01;
    patched[42] = 0x51;
    patched.set(raw.subarray(42), 43);
    expect(locateInputSequences(patched).hasScriptSig).toBe(true);
  });
});

describe('assessZeldHunt', () => {
  it('accepts an enhanced send from a Native SegWit address', () => {
    const rawTxHex = enhancedSendRawTx();
    const assessment = assessZeldHunt({ rawTxHex, sourceAddress: SOURCE_ADDRESS, addressFormat: AddressFormat.P2WPKH });
    expect(assessment.eligible).toBe(true);
    if (!assessment.eligible) return;
    expect(assessment.template.nonceOffset).toBe(42);
    expect(assessment.template.originalSequence).toBe(0xffffffff);
    expect(assessment.template.message).toEqual(hexToBytes(rawTxHex));
  });

  it.each([
    AddressFormat.P2TR,
    AddressFormat.CounterwalletSegwit,
    AddressFormat.FreewalletBIP39Segwit,
  ])('accepts the %s format, whose signed txid equals its unsigned txid', (addressFormat) => {
    const assessment = assessZeldHunt({ rawTxHex: enhancedSendRawTx(), sourceAddress: SOURCE_ADDRESS, addressFormat });
    expect(assessment.eligible).toBe(true);
  });

  it.each([
    AddressFormat.P2PKH,
    AddressFormat.P2SH_P2WPKH,
    AddressFormat.Counterwallet,
    AddressFormat.FreewalletBIP39,
  ])('refuses the %s format because signing changes its txid', (addressFormat) => {
    const assessment = assessZeldHunt({ rawTxHex: enhancedSendRawTx(), sourceAddress: SOURCE_ADDRESS, addressFormat });
    expect(assessment).toEqual({ eligible: false, reason: expect.stringContaining('changes the txid') });
  });

  it('refuses when the first spendable output pays someone else', () => {
    const rawTxHex = unsignedRawTx({
      outputs: [
        { script: otherScript, amount: 5_000n },
        { script: SOURCE_P2WPKH.script, amount: 90_000n },
      ],
    });
    const assessment = assessZeldHunt({ rawTxHex, sourceAddress: SOURCE_ADDRESS, addressFormat: AddressFormat.P2WPKH });
    expect(assessment).toEqual({ eligible: false, reason: expect.stringContaining('someone else') });
  });

  it('accepts when change precedes a payment to someone else', () => {
    const rawTxHex = unsignedRawTx({
      outputs: [
        { script: SOURCE_P2WPKH.script, amount: 90_000n },
        { script: otherScript, amount: 5_000n },
      ],
    });
    const assessment = assessZeldHunt({ rawTxHex, sourceAddress: SOURCE_ADDRESS, addressFormat: AddressFormat.P2WPKH });
    expect(assessment.eligible).toBe(true);
  });

  it('refuses a transaction with only data outputs, where ZELD would burn', () => {
    const rawTxHex = unsignedRawTx({ outputs: [{ script: opReturnScript(), amount: 0n }] });
    const assessment = assessZeldHunt({ rawTxHex, sourceAddress: SOURCE_ADDRESS, addressFormat: AddressFormat.P2WPKH });
    expect(assessment).toEqual({ eligible: false, reason: expect.stringContaining('no spendable output') });
  });

  it('accepts the source address in uppercase bech32', () => {
    const assessment = assessZeldHunt({
      rawTxHex: enhancedSendRawTx(),
      sourceAddress: SOURCE_ADDRESS.toUpperCase(),
      addressFormat: AddressFormat.P2WPKH,
    });
    expect(assessment.eligible).toBe(true);
  });

  it('refuses bytes that are not a transaction', () => {
    const assessment = assessZeldHunt({ rawTxHex: 'deadbeef', sourceAddress: SOURCE_ADDRESS, addressFormat: AddressFormat.P2WPKH });
    expect(assessment.eligible).toBe(false);
  });
});

describe('nonce application', () => {
  it('hashes to the txid the wallet parser computes for the patched transaction', () => {
    const rawTxHex = enhancedSendRawTx();
    const assessment = assessZeldHunt({ rawTxHex, sourceAddress: SOURCE_ADDRESS, addressFormat: AddressFormat.P2WPKH });
    if (!assessment.eligible) throw new Error('fixture should be eligible');
    const nonce = 0x8123_4567;
    const hasher = new MutableSha256d(messageWithNonce(assessment.template, nonce));
    hasher.hashLeadingZeroNibbles();
    const patched = rawTransactionWithSequence(rawTxHex, nonce);
    expect(parseRawTransactionLocally(patched)?.txid).toBe(hasher.txid());
    expect(parseConsensusTransaction(patched).getInput(0).sequence).toBe(nonce);
  });

  it('leaves everything but input 0 sequence untouched', () => {
    const rawTxHex = enhancedSendRawTx();
    const patched = rawTransactionWithSequence(rawTxHex, 0x8000_0001);
    expect(() => assertOnlySequenceChanged(rawTxHex, patched)).not.toThrow();
    expect(patched.length).toBe(rawTxHex.length);
    // Only the four sequence bytes at offset 42 differ.
    const before = hexToBytes(rawTxHex);
    const after = hexToBytes(patched);
    const differing = [...before.keys()].filter(i => before[i] !== after[i]);
    expect(differing.every(i => i >= 42 && i < 46)).toBe(true);
  });

  it('rejects a hunted transaction whose outputs moved', () => {
    const rawTxHex = enhancedSendRawTx();
    const tampered = unsignedRawTx({
      inputs: [{ txid: PREV_TXID, index: 0, sequence: 0x8000_0001 }],
      outputs: [
        { script: opReturnScript(), amount: 0n },
        { script: otherScript, amount: 95_160n },
      ],
    });
    expect(() => assertOnlySequenceChanged(rawTxHex, tampered)).toThrow('changed output 1');
  });

  it('rejects a hunted transaction that changed another input', () => {
    const rawTxHex = unsignedRawTx({
      inputs: [{ txid: PREV_TXID, index: 0 }, { txid: PREV_TXID, index: 1 }],
      outputs: [{ script: SOURCE_P2WPKH.script, amount: 1_000n }],
    });
    const tampered = unsignedRawTx({
      inputs: [{ txid: PREV_TXID, index: 0 }, { txid: PREV_TXID, index: 1, sequence: 5 }],
      outputs: [{ script: SOURCE_P2WPKH.script, amount: 1_000n }],
    });
    expect(() => assertOnlySequenceChanged(rawTxHex, tampered)).toThrow('changed input 1');
  });

  it('does not treat the recipient as the reward output', () => {
    // Guards the fixture assumption the eligibility tests rely on.
    expect(OTHER_ADDRESS).not.toBe(SOURCE_ADDRESS);
  });
});
