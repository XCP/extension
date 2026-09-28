/**
 * Taproot envelope and reveal verification, checked against real compose responses.
 *
 * The first fixtures are a genuine `encoding=taproot` broadcast composed by api.counterparty.io —
 * an image/png inscription of "hello" from a P2WPKH source. Rebuilding the envelope locally and
 * getting the server's bytes back proves the mirror is exact; deriving the commit address and
 * getting the transaction's actual output proves the taproot derivation is right. Together they
 * are the same assertion core makes about its own output in `check_transaction_sanity`.
 * `taprootFixtures.ts` adds complete composes for the plain data envelope core uses when there is
 * no inscription, and one more ord inscription; their envelopes are read here.
 *
 * The reveal checks run on composes captured from Core 11.5 (`taproot115Fixtures.ts`), which
 * returns an unsigned reveal the wallet signs with the source key.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Address, OutScript, Transaction, utils } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import {
  envelopeKind,
  type RevealCheckOptions,
  readDataEnvelope,
  revealSpendsTransaction,
  verifyInscriptionEnvelope,
  verifyUnsignedReveal,
} from '../inscriptionEnvelope';
import { readRevealShape } from '../taprootEncoding';
import {
  BROADCAST_P2TR_INTERNAL,
  BROADCAST_P2TR_OUTPUT_KEY,
  BROADCAST_P2WPKH,
  type Compose115Result,
  envelopeClosedBy,
  type Fixture115,
  KEY_TR,
  KEY_WPKH,
  MPMA_P2WPKH,
  ORD_BROADCAST_P2WPKH,
  recompose115,
  tamperedMessage115,
} from './taproot115Fixtures';
import {
  BROADCAST_600_TAPROOT,
  MPMA_TAPROOT,
  ORD_BROADCAST_TAPROOT,
  SEND_TAPROOT,
  type TaprootFixture,
  tamperedTaprootCompose,
} from './taprootFixtures';

/** CNTRPRTY + type 30 + CBOR [timestamp, value, fee_fraction_int, mime_type, content]. */
const DATA = '434e5452505254591e851a66ae50e0fb00000000000000000069696d6167652f706e674568656c6c6f';

const ENVELOPE = '0063036f7264010703786370010109696d6167652f706e6701051284181e1a66ae50e0fb0000'
  + '00000000000000000568656c6c6f6820bbec263aa627fab2cc458b46b4b0193d8dfd7169906b48f5ee12c8bc8'
  + 'bc62693ac';

/** The commit transaction's output 0 pays this P2TR address (875 sats). */
const COMMIT_ADDRESS = 'bc1pk828a69sm0lycjve30m8yhrnuhh4vpks34w2qejtckp28m27pfkqzm0l0a';

describe('rebuilding a real inscription envelope', () => {
  it('reproduces the composed envelope byte for byte and derives its commit address', () => {
    const result = verifyInscriptionEnvelope(ENVELOPE, hexToBytes(DATA));

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    // The address the real commit transaction actually pays.
    expect(result.commitAddress).toBe(COMMIT_ADDRESS);
  });

  it('rejects an envelope carrying different content than the request', () => {
    // "hello" -> "hellp": one byte of the inscribed content.
    const tampered = hexToBytes(DATA.replace('68656c6c6f', '68656c6c70'));
    const result = verifyInscriptionEnvelope(ENVELOPE, tampered);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not match your request/);
  });

  it('rejects an envelope carrying a different mime type', () => {
    // image/png -> image/pnq, changing only the declared content type.
    const tampered = hexToBytes(DATA.replace('696d6167652f706e67', '696d6167652f706e71'));
    const result = verifyInscriptionEnvelope(ENVELOPE, tampered);

    expect(result.ok).toBe(false);
  });

  it('rejects a script that does not end in the expected pubkey and OP_CHECKSIG', () => {
    const result = verifyInscriptionEnvelope('0063036f726468', hexToBytes(DATA));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unexpected structure/);
  });
});

describe('reading a real plain data envelope', () => {
  it.each([
    ['an enhanced send', SEND_TAPROOT],
    ['an MPMA', MPMA_TAPROOT],
    ['a broadcast split over two 520-byte pushes', BROADCAST_600_TAPROOT],
  ] as const)('%s: reads core\'s message back and derives the address the commit pays', (_, fixture) => {
    expect(envelopeKind(fixture.envelope_script)).toBe('data');
    const read = readDataEnvelope(fixture.envelope_script);

    expect(read.error).toBeUndefined();
    expect(read.messageHex).toBe(fixture.data);
    expect(read.commitAddress).toBe(commitOutputAddress(fixture));
  });

  it('decodes to what the request asked for, recipient, amount, asset and memo included', () => {
    const read = readDataEnvelope(SEND_TAPROOT.envelope_script);
    const unpacked = unpackCounterpartyMessage(read.messageHex!);

    expect(unpacked.success).toBe(true);
    expect(unpacked.data).toMatchObject({
      asset: 'PEPEMEMECOIN',
      quantity: 100000000n,
      destination: SEND_TAPROOT.request.destination,
    });
  });

  it.each([
    ['recipient', (m: string) => m.replace('a37c3903', 'a37c3904')],
    ['amount', (m: string) => m.replace('1a05f5e100', '1a05f5e101')],
    ['asset', (m: string) => m.replace('1b00c5e4ddb67f67e5', '1b00c5e4ddb67f67e6')],
  ])('a hostile envelope with an altered %s reads as a different message than the request packs', (_, tamper) => {
    const hostile = tamperedTaprootCompose(SEND_TAPROOT, tamper);
    const read = readDataEnvelope(hostile.envelope_script);
    expect(read.ok).toBe(true);
    // Structurally sound — the hostile commit even pays the address its envelope commits to…
    expect(read.commitAddress).toBe(commitOutputAddress(hostile));
    // …so what refuses it is the message: the request's own bytes differ.
    const expected = packComposeMessage('send', SEND_TAPROOT.request);
    expect(read.messageHex).not.toBe(bytesToHex(expected!.bytes));
    expect(bytesToHex(expected!.bytes)).toBe(SEND_TAPROOT.data);
  });

  it('refuses a data envelope whose pushes are not core\'s chunking', () => {
    // The same 88 bytes pushed as 44 + 44 instead of one push: the same message, but not the
    // script core builds, so the commit address would not be the one core reports.
    const pubkeyTail = SEND_TAPROOT.envelope_script.slice(-70);
    const message = SEND_TAPROOT.data.slice(16);
    const rechunked = `0063${'2c'}${message.slice(0, 88)}${'2c'}${message.slice(88)}68${pubkeyTail}`;

    expect(readDataEnvelope(rechunked).ok).toBe(false);
  });

  it('refuses a truncated script and an ord envelope', () => {
    expect(readDataEnvelope(SEND_TAPROOT.envelope_script.slice(0, -2)).ok).toBe(false);
    expect(readDataEnvelope(ORD_BROADCAST_TAPROOT.envelope_script).ok).toBe(false);
    expect(envelopeKind(ORD_BROADCAST_TAPROOT.envelope_script)).toBe('ord');
    expect(envelopeKind('6a')).toBeNull();
  });
});

/** The address a fixture's commit output 0 pays, decoded with btc-signer rather than the code under test. */
function commitOutputAddress(fixture: TaprootFixture): string {
  const commit = Transaction.fromRaw(hexToBytes(fixture.rawtransaction), { allowUnknownOutputs: true });
  return Address().encode(OutScript.decode(commit.getOutput(0).script!));
}

/** The commit address the composer derives for an 11.5 compose, from its verified envelope. */
function commitAddress115(result: Compose115Result, data = result.data): string {
  return envelopeKind(result.envelope_script) === 'data'
    ? readDataEnvelope(result.envelope_script).commitAddress!
    : verifyInscriptionEnvelope(result.envelope_script, hexToBytes(data)).commitAddress!;
}

/** The unsigned reveal and options an 11.5 compose verifies under, as the composer passes them. */
function check115(fixture: Fixture115, result: Compose115Result = fixture.result, overrides: Partial<RevealCheckOptions> = {}) {
  const shape = readRevealShape(result);
  if (shape.kind !== 'unsigned') throw new Error(`not an unsigned reveal: ${shape.kind}`);
  return verifyUnsignedReveal(shape.reveal, {
    kind: envelopeKind(result.envelope_script)!,
    ownAddresses: [fixture.key.address],
    sourceAddress: fixture.key.address,
    commitTxHex: result.rawtransaction,
    commitAddress: commitAddress115(result),
    envelopeScriptHex: result.envelope_script,
    feeRate: fixture.feeRate,
    ...overrides,
  });
}

const FIXTURES_115 = [
  ['an MPMA from P2WPKH at 3 sat/vB', MPMA_P2WPKH, 408],
  ['a two-chunk broadcast from P2WPKH at 2 sat/vB', BROADCAST_P2WPKH, 526],
  ['the broadcast from P2TR, closed by its internal key', BROADCAST_P2TR_INTERNAL, 526],
  ['the broadcast from P2TR, closed by its output key', BROADCAST_P2TR_OUTPUT_KEY, 526],
  ['an ord inscription from P2WPKH, returning dust', ORD_BROADCAST_P2WPKH, 1291 - 546],
] as const;

describe('the unsigned reveal Core 11.5 returns', () => {
  it.each(FIXTURES_115)('accepts core\'s own compose: %s', (_, fixture, fee) => {
    const result = check115(fixture);
    expect(result.error).toBeUndefined();
    expect(result.revealFee).toBe(fee);
  });

  it('closes each envelope with a key of the source: the same key for every compose from one address', () => {
    expect(MPMA_P2WPKH.result.reveal_pubkey).toBe(KEY_WPKH.publicKeyHex.slice(2));
    expect(BROADCAST_P2TR_INTERNAL.result.reveal_pubkey).toBe(KEY_TR.publicKeyHex.slice(2));
    expect(BROADCAST_P2TR_OUTPUT_KEY.result.reveal_pubkey).toBe(KEY_TR.scriptHex.slice(4));
  });

  it('rebuilds each fixture byte for byte, so the rebuilt composes below differ only as asked', () => {
    for (const [, fixture] of FIXTURES_115) {
      const rebuilt = recompose115(fixture);
      for (const field of ['rawtransaction', 'envelope_script', 'reveal_rawtransaction', 'reveal_control_block',
        'reveal_pubkey'] as const) {
        expect(rebuilt[field], field).toBe(fixture.result[field]);
      }
      expect(rebuilt.reveal_lock_scripts).toEqual(fixture.result.reveal_lock_scripts);
      expect(rebuilt.reveal_inputs_values).toEqual(fixture.result.reveal_inputs_values);
    }
  });

  it('refuses an envelope closed by a key that is not the source\'s, however consistent the rest', () => {
    const other = utils.pubSchnorr(new Uint8Array(32).fill(9));
    const tampered = recompose115(BROADCAST_P2WPKH, { envelope: envelopeClosedBy(BROADCAST_P2WPKH, other) });
    const result = check115(BROADCAST_P2WPKH, tampered);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not closed by your address/);
    // Nor the other address's key: a P2TR key closing a P2WPKH source's envelope.
    const trKey = recompose115(BROADCAST_P2WPKH, { envelope: envelopeClosedBy(BROADCAST_P2WPKH, hexToBytes(KEY_TR.publicKeyHex.slice(2))) });
    expect(check115(BROADCAST_P2WPKH, trKey).ok).toBe(false);
  });

  it('refuses a reveal_pubkey that is not the key closing the envelope', () => {
    const result = check115(BROADCAST_P2WPKH, { ...BROADCAST_P2WPKH.result, reveal_pubkey: KEY_TR.publicKeyHex.slice(2) });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not closed by the key the reveal is signed with/);
  });

  it('refuses a control block with the wrong parity, a merkle path, or another internal key', () => {
    const control = BROADCAST_P2WPKH.result.reveal_control_block;
    const flipped = (Number.parseInt(control.slice(0, 2), 16) ^ 1).toString(16) + control.slice(2);
    for (const reveal_control_block of [flipped, `${control}${'11'.repeat(32)}`, `c0${KEY_TR.publicKeyHex.slice(2)}`]) {
      const result = check115(BROADCAST_P2WPKH, { ...BROADCAST_P2WPKH.result, reveal_control_block });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/commit to exactly the verified envelope/);
    }
  });

  it('refuses a commit output that hides a second leaf, or sits under another internal key', () => {
    const hidden = recompose115(BROADCAST_P2WPKH, { extraLeaf: MPMA_P2WPKH.result.envelope_script });
    expect(check115(BROADCAST_P2WPKH, hidden, { commitAddress: commitOutputAddress115(hidden) }).error)
      .toMatch(/commit to exactly the verified envelope/);
    const otherInternal = recompose115(BROADCAST_P2WPKH, { internalKey: utils.pubSchnorr(new Uint8Array(32).fill(7)) });
    expect(check115(BROADCAST_P2WPKH, otherInternal, { commitAddress: commitOutputAddress115(otherInternal) }).error)
      .toMatch(/commit to exactly the verified envelope/);
  });

  it('refuses a commit that pays a different address than the verified envelope derives', () => {
    const result = check115(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, { commitTxHex: MPMA_P2WPKH.result.rawtransaction });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not fund the reveal/);
  });

  it('refuses reveal lock scripts or values that are not the commit output', () => {
    const { result } = BROADCAST_P2WPKH;
    for (const change of [
      { reveal_lock_scripts: MPMA_P2WPKH.result.reveal_lock_scripts },
      { reveal_lock_scripts: [...result.reveal_lock_scripts, ...result.reveal_lock_scripts] },
      { reveal_inputs_values: [result.reveal_inputs_values[0]! + 1] },
    ]) {
      const check = check115(BROADCAST_P2WPKH, { ...result, ...change });
      expect(check.ok).toBe(false);
      expect(check.error).toMatch(/does not spend the commit output it names/);
    }
  });

  it('refuses a reveal that spends another transaction, or more than the commit output', () => {
    const elsewhere = check115(BROADCAST_P2WPKH, { ...BROADCAST_P2WPKH.result, reveal_rawtransaction: MPMA_P2WPKH.result.reveal_rawtransaction });
    expect(elsewhere.error).toMatch(/does not spend this commit/);
    const reveal = Transaction.fromRaw(hexToBytes(BROADCAST_P2WPKH.result.reveal_rawtransaction), { allowUnknownOutputs: true });
    reveal.addInput({ txid: new Uint8Array(32).fill(1), index: 0 });
    const twoInputs = check115(BROADCAST_P2WPKH, { ...BROADCAST_P2WPKH.result, reveal_rawtransaction: bytesToHex(reveal.unsignedTx) });
    expect(twoInputs.error).toMatch(/does not spend this commit/);
  });

  it('refuses a reveal that arrives with a witness already', () => {
    const reveal = Transaction.fromRaw(hexToBytes(BROADCAST_P2WPKH.result.reveal_rawtransaction), { allowUnknownOutputs: true });
    reveal.updateInput(0, { finalScriptWitness: [new Uint8Array(64), hexToBytes(BROADCAST_P2WPKH.result.envelope_script)] }, true);
    const result = check115(BROADCAST_P2WPKH, { ...BROADCAST_P2WPKH.result, reveal_rawtransaction: reveal.hex });
    expect(result.error).toMatch(/already signed/);
  });

  it('refuses a data reveal with any output beyond the marker, even one paying the source', () => {
    const tampered = recompose115(BROADCAST_P2WPKH, {
      editReveal: (reveal) => reveal.addOutput({ script: hexToBytes(KEY_WPKH.scriptHex), amount: 100n }),
    });
    expect(check115(BROADCAST_P2WPKH, tampered).error).toMatch(/outputs core does not create/);
  });

  it('refuses an ord reveal whose dust goes elsewhere or exceeds core\'s', () => {
    expect(check115(ORD_BROADCAST_P2WPKH, ORD_BROADCAST_P2WPKH.result, { ownAddresses: [KEY_TR.address] }).error)
      .toMatch(/not yours/);
    const more = recompose115(ORD_BROADCAST_P2WPKH, {
      commitValue: 1291 + 1,
      editReveal: (reveal) => reveal.updateOutput(1, { amount: 547n }),
    });
    expect(check115(ORD_BROADCAST_P2WPKH, more).error).toMatch(/more than the dust core sends back/);
  });

  it('refuses a commit output funding more reveal fee than the user\'s rate', () => {
    expect(check115(MPMA_P2WPKH, MPMA_P2WPKH.result, { feeRate: 1 }).error).toMatch(/higher fee/);
    const rich = recompose115(BROADCAST_P2WPKH, { commitValue: 50_000 });
    expect(check115(BROADCAST_P2WPKH, rich).error).toMatch(/higher fee/);
  });

  it('holds each envelope to its own reveal shape', () => {
    expect(check115(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, { kind: 'ord' }).ok).toBe(false);
    expect(check115(ORD_BROADCAST_P2WPKH, ORD_BROADCAST_P2WPKH.result, { kind: 'data' }).ok).toBe(false);
  });

  it('reads the message a tampered envelope carries, so the request comparison refuses it', () => {
    const tampered = tamperedMessage115(BROADCAST_P2WPKH, (m) => m.replace('54686520717569636b', '54686520717569636c'));
    // Structurally sound and closed by the source's key…
    expect(check115(BROADCAST_P2WPKH, tampered).ok).toBe(true);
    // …but it is not the message this request packs.
    const read = readDataEnvelope(tampered.envelope_script);
    expect(read.messageHex).toBe(tampered.data);
    expect(read.messageHex).not.toBe(BROADCAST_P2WPKH.result.data);
  });
});

/** The address a rebuilt compose's commit output 0 pays, decoded with btc-signer. */
function commitOutputAddress115(result: Compose115Result): string {
  const commit = Transaction.fromRaw(hexToBytes(result.rawtransaction), { allowUnknownOutputs: true });
  return Address().encode(OutScript.decode(commit.getOutput(0).script!));
}

describe('the reveal against the signed commit', () => {
  it('matches the commit it was composed with', () => {
    expect(revealSpendsTransaction(BROADCAST_P2WPKH.result.reveal_rawtransaction, BROADCAST_P2WPKH.result.rawtransaction)).toBe(true);
  });

  it('no longer matches once anything changed the commit, such as a ZELD nonce in nLockTime', () => {
    const hunted = `${BROADCAST_P2WPKH.result.rawtransaction.slice(0, -8)}2a000000`;
    expect(revealSpendsTransaction(BROADCAST_P2WPKH.result.reveal_rawtransaction, hunted)).toBe(false);
  });
});
