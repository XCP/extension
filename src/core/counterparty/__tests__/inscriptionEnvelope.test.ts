/**
 * Taproot envelope and reveal verification, checked against real compose responses.
 *
 * The first fixtures are a genuine `encoding=taproot` broadcast composed by api.counterparty.io —
 * an image/png inscription of "hello" from a P2WPKH source. Rebuilding the envelope locally and
 * getting the server's bytes back proves the mirror is exact; deriving the commit address and
 * getting the transaction's actual output proves the taproot derivation is right. Together they
 * are the same assertion core makes about its own output in `check_transaction_sanity`. The rest
 * (`taprootFixtures.ts`) are complete composes — commit, envelope and reveal — for the plain data
 * envelope core uses when there is no inscription, and one more ord inscription.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Address, OutScript, p2tr, TaprootControlBlock, Transaction, utils } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import {
  envelopeKind,
  readDataEnvelope,
  revealSpendsTransaction,
  verifyInscriptionEnvelope,
  verifyRevealTransaction,
} from '../inscriptionEnvelope';
import {
  BROADCAST_600_TAPROOT,
  MPMA_TAPROOT,
  ORD_BROADCAST_TAPROOT,
  SEND_TAPROOT,
  TAPROOT_SOURCE,
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

/** The options a real fixture verifies under, as the composer passes them. */
function revealOptions(fixture: TaprootFixture) {
  const kind = envelopeKind(fixture.envelope_script)!;
  const commitAddress = kind === 'data'
    ? readDataEnvelope(fixture.envelope_script).commitAddress!
    : verifyInscriptionEnvelope(fixture.envelope_script, hexToBytes(fixture.data)).commitAddress!;
  return {
    kind,
    ownAddresses: [TAPROOT_SOURCE],
    commitTxHex: fixture.rawtransaction,
    commitAddress,
    envelopeScriptHex: fixture.envelope_script,
    feeRate: fixture.feeRate,
  };
}

const MARKER = '00000000000000000a6a08434e545250525459';

describe('the pre-signed reveal transaction', () => {
  it.each([
    ['send at 2 sat/vB, raised to the dust floor', SEND_TAPROOT, 330],
    ['MPMA at 10 sat/vB', MPMA_TAPROOT, 1380],
    ['two-chunk broadcast at 3 sat/vB', BROADCAST_600_TAPROOT, 786],
  ] as const)('accepts core\'s data reveal (%s): only the marker, the whole commit output as fee', (_, fixture, fee) => {
    const result = verifyRevealTransaction(fixture.signed_reveal_rawtransaction, revealOptions(fixture));

    expect(result.error).toBeUndefined();
    expect(result.revealFee).toBe(fee);
  });

  it('accepts core\'s ord reveal, which returns dust to the source', () => {
    const result = verifyRevealTransaction(
      ORD_BROADCAST_TAPROOT.signed_reveal_rawtransaction,
      revealOptions(ORD_BROADCAST_TAPROOT),
    );

    expect(result.error).toBeUndefined();
    // 1,291 sats committed, 546 returned.
    expect(result.revealFee).toBe(745);
  });

  it('rejects the ord reveal when the source is not ours', () => {
    const result = verifyRevealTransaction(ORD_BROADCAST_TAPROOT.signed_reveal_rawtransaction, {
      ...revealOptions(ORD_BROADCAST_TAPROOT),
      ownAddresses: ['bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not yours/);
  });

  it('holds each envelope to its own reveal shape', () => {
    // A data reveal has no dust output, an ord reveal has one: neither passes as the other.
    expect(verifyRevealTransaction(SEND_TAPROOT.signed_reveal_rawtransaction,
      { ...revealOptions(SEND_TAPROOT), kind: 'ord' }).ok).toBe(false);
    expect(verifyRevealTransaction(ORD_BROADCAST_TAPROOT.signed_reveal_rawtransaction,
      { ...revealOptions(ORD_BROADCAST_TAPROOT), kind: 'data' }).ok).toBe(false);
  });

  it('rejects a data reveal with any output beyond the marker, even one paying us', () => {
    const own = '160014dc53f17104ec8d1f215d61f92b603c7b2238cadb';
    const extra = SEND_TAPROOT.signed_reveal_rawtransaction
      .replace(`ffffffff01${MARKER}`, `ffffffff02${MARKER}2202000000000000${own}`);
    expect(extra).not.toBe(SEND_TAPROOT.signed_reveal_rawtransaction);

    const result = verifyRevealTransaction(extra, revealOptions(SEND_TAPROOT));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/outputs core does not create/);
  });

  it('rejects a marker that carries value or says something else', () => {
    const valued = SEND_TAPROOT.signed_reveal_rawtransaction.replace(MARKER, `2202000000000000${MARKER.slice(16)}`);
    const other = SEND_TAPROOT.signed_reveal_rawtransaction.replace(MARKER, MARKER.replace('434e5452', '434e5453'));
    for (const reveal of [valued, other]) {
      expect(reveal).not.toBe(SEND_TAPROOT.signed_reveal_rawtransaction);
      expect(verifyRevealTransaction(reveal, revealOptions(SEND_TAPROOT)).ok).toBe(false);
    }
  });

  it('rejects a reveal that spends a different commit', () => {
    const result = verifyRevealTransaction(MPMA_TAPROOT.signed_reveal_rawtransaction, {
      ...revealOptions(MPMA_TAPROOT),
      commitTxHex: SEND_TAPROOT.rawtransaction,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not spend this commit/);
  });

  it('rejects a reveal that publishes a different envelope than the one verified', () => {
    const result = verifyRevealTransaction(SEND_TAPROOT.signed_reveal_rawtransaction, {
      ...revealOptions(SEND_TAPROOT),
      envelopeScriptHex: MPMA_TAPROOT.envelope_script,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a commit output that funds more reveal fee than the user\'s rate', () => {
    // 1,380 sats of reveal fee is right at 10 sat/vB and far too much at 1.
    const result = verifyRevealTransaction(MPMA_TAPROOT.signed_reveal_rawtransaction, {
      ...revealOptions(MPMA_TAPROOT),
      feeRate: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/higher fee/);
  });
});

function reverseHex(hex: string): string {
  return hex.match(/../g)!.reverse().join('');
}

function amountHex(sats: number): string {
  return reverseHex(BigInt(sats).toString(16).padStart(16, '0'));
}

/**
 * A real compose with its commit output 0 funded with `commitValue`, and its reveal re-pointed at
 * that commit, returning `changeValue` in its ord output when given. The reveal's signature goes
 * stale; nothing checked here reads it.
 */
function refunded(fixture: TaprootFixture, commitValue: number, changeValue?: number) {
  const commit = Transaction.fromRaw(hexToBytes(fixture.rawtransaction), { allowUnknownOutputs: true });
  const { amount, script } = commit.getOutput(0);
  const scriptHex = `${(script!.length).toString(16).padStart(2, '0')}${bytesToHex(script!)}`;
  const rawtransaction = fixture.rawtransaction
    .replace(`${amountHex(Number(amount))}${scriptHex}`, `${amountHex(commitValue)}${scriptHex}`);
  const commitId = Transaction.fromRaw(hexToBytes(rawtransaction), { allowUnknownOutputs: true }).id;
  let reveal = fixture.signed_reveal_rawtransaction.replace(reverseHex(commit.id), reverseHex(commitId));
  if (changeValue !== undefined) {
    const change = Transaction.fromRaw(hexToBytes(reveal), { allowUnknownOutputs: true }).getOutput(1);
    const changeScript = `${(change.script!.length).toString(16).padStart(2, '0')}${bytesToHex(change.script!)}`;
    reveal = reveal.replace(`${amountHex(Number(change.amount))}${changeScript}`, `${amountHex(changeValue)}${changeScript}`);
  }
  return { reveal, options: { ...revealOptions(fixture), commitTxHex: rawtransaction } };
}

describe('what the commit output may hold', () => {
  // Core's ord reveal: 1,291 sats committed, 546 returned, 745 fee.
  const ORD_FEE = 745;

  it("rebuilds core's own ord pair unchanged, and accepts it", () => {
    const { reveal, options } = refunded(ORD_BROADCAST_TAPROOT, ORD_FEE + 546, 546);
    expect(options.commitTxHex).toBe(ORD_BROADCAST_TAPROOT.rawtransaction);
    expect(reveal).toBe(ORD_BROADCAST_TAPROOT.signed_reveal_rawtransaction);
    expect(verifyRevealTransaction(reveal, options)).toEqual({ ok: true, revealFee: ORD_FEE });
  });

  it('refuses a large commit whose reveal returns a little and burns the rest as fee', () => {
    const { reveal, options } = refunded(ORD_BROADCAST_TAPROOT, 50_000_000, 1000);
    const result = verifyRevealTransaction(reveal, options);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not accepted/);
  });

  it('refuses a large ord commit even when the reveal returns nearly all of it to the source', () => {
    // The fee is exactly core's, but the commit output holds 0.1 BTC under the envelope key.
    const { reveal, options } = refunded(ORD_BROADCAST_TAPROOT, ORD_FEE + 10_000_000, 10_000_000);
    const result = verifyRevealTransaction(reveal, options);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/more than the dust core sends back/);
  });

  it("refuses an ord reveal returning one sat more than core's dust", () => {
    const { reveal, options } = refunded(ORD_BROADCAST_TAPROOT, ORD_FEE + 547, 547);
    const result = verifyRevealTransaction(reveal, options);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/more than the dust core sends back/);
  });

  it('refuses a data commit holding more than the reveal fee, since its reveal returns nothing', () => {
    // Core's send commit is 330 sats, all of it fee; any more is fee the user never chose.
    const same = refunded(SEND_TAPROOT, 330);
    expect(same.options.commitTxHex).toBe(SEND_TAPROOT.rawtransaction);
    expect(verifyRevealTransaction(same.reveal, same.options)).toEqual({ ok: true, revealFee: 330 });

    for (const value of [1_000, 50_000_000]) {
      const { reveal, options } = refunded(SEND_TAPROOT, value);
      const result = verifyRevealTransaction(reveal, options);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/higher fee/);
    }
  });
});

/**
 * A real compose whose commit output 0 is re-pointed at another script tree, and whose reveal is
 * re-pointed at that commit with the control block for the fixture's envelope in that tree. The
 * reveal's signature goes stale; nothing checked here reads it.
 */
function recommitted(fixture: TaprootFixture, options: { internalKey?: Uint8Array; extraLeaf?: string }) {
  const envelope = hexToBytes(fixture.envelope_script);
  const envelopeKey = envelope.slice(-33, -1);
  const tree = options.extraLeaf
    ? [{ script: envelope }, { script: hexToBytes(options.extraLeaf) }]
    : { script: envelope };
  const payment = p2tr(options.internalKey ?? envelopeKey, tree, undefined, true);
  const [controlBlock] = payment.tapLeafScript!.find(([, script]) =>
    bytesToHex(script.slice(0, -1)) === fixture.envelope_script)!;
  const control = bytesToHex(TaprootControlBlock.encode(controlBlock));

  const original = Transaction.fromRaw(hexToBytes(fixture.rawtransaction), { allowUnknownOutputs: true });
  const rawtransaction = fixture.rawtransaction.replace(bytesToHex(original.getOutput(0).script!), bytesToHex(payment.script));
  const commitId = Transaction.fromRaw(hexToBytes(rawtransaction), { allowUnknownOutputs: true }).id;
  const originalControl = fixture.signed_reveal_rawtransaction.slice(-8 - 66, -8);
  const reveal = fixture.signed_reveal_rawtransaction
    .replace(reverseHex(original.id), reverseHex(commitId))
    .replace(`21${originalControl}00000000`, `${(control.length / 2).toString(16).padStart(2, '0')}${control}00000000`);
  return { rawtransaction, reveal, outputAddress: payment.address! };
}

describe("the commit output's script tree", () => {
  it("accepts core's pair: the output commits to the verified envelope alone, under its own key", () => {
    for (const fixture of [SEND_TAPROOT, MPMA_TAPROOT, ORD_BROADCAST_TAPROOT]) {
      expect(verifyRevealTransaction(fixture.signed_reveal_rawtransaction, revealOptions(fixture)).ok).toBe(true);
    }
    // Rebuilding the same single-leaf tree reproduces core's commit exactly.
    const same = recommitted(SEND_TAPROOT, {});
    expect(same.rawtransaction).toBe(SEND_TAPROOT.rawtransaction);
    expect(same.reveal).toBe(SEND_TAPROOT.signed_reveal_rawtransaction);
  });

  it('refuses a commit output that hides a second leaf, even at the address that output pays', () => {
    const { rawtransaction, reveal, outputAddress } = recommitted(SEND_TAPROOT, { extraLeaf: MPMA_TAPROOT.envelope_script });
    const options = { ...revealOptions(SEND_TAPROOT), commitTxHex: rawtransaction };
    expect(rawtransaction).not.toBe(SEND_TAPROOT.rawtransaction);

    expect(verifyRevealTransaction(reveal, options).ok).toBe(false);
    const result = verifyRevealTransaction(reveal, { ...options, commitAddress: outputAddress });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/commit to exactly the verified envelope/);
  });

  it('refuses a commit output under a different internal key, even at the address that output pays', () => {
    const otherKey = utils.pubSchnorr(new Uint8Array(32).fill(7));
    const { rawtransaction, reveal, outputAddress } = recommitted(SEND_TAPROOT, { internalKey: otherKey });
    const options = { ...revealOptions(SEND_TAPROOT), commitTxHex: rawtransaction };
    expect(rawtransaction).not.toBe(SEND_TAPROOT.rawtransaction);

    expect(verifyRevealTransaction(reveal, options).ok).toBe(false);
    const result = verifyRevealTransaction(reveal, { ...options, commitAddress: outputAddress });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/commit to exactly the verified envelope/);
  });

  it('refuses a commit output to a different leaf than the one the reveal publishes', () => {
    // The commit pays for the MPMA's envelope; the reveal shows the send's.
    const mpmaCommit = MPMA_TAPROOT.rawtransaction;
    const mpmaOutput = commitOutputAddress(MPMA_TAPROOT);
    const commitId = Transaction.fromRaw(hexToBytes(mpmaCommit), { allowUnknownOutputs: true }).id;
    const sendId = Transaction.fromRaw(hexToBytes(SEND_TAPROOT.rawtransaction), { allowUnknownOutputs: true }).id;
    const reveal = SEND_TAPROOT.signed_reveal_rawtransaction.replace(reverseHex(sendId), reverseHex(commitId));
    expect(reveal).not.toBe(SEND_TAPROOT.signed_reveal_rawtransaction);

    const result = verifyRevealTransaction(reveal, {
      ...revealOptions(SEND_TAPROOT),
      commitTxHex: mpmaCommit,
      commitAddress: mpmaOutput,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/commit to exactly the verified envelope/);
  });
});

describe('the reveal against the signed commit', () => {
  it('matches the commit it was composed with', () => {
    expect(revealSpendsTransaction(SEND_TAPROOT.signed_reveal_rawtransaction, SEND_TAPROOT.rawtransaction)).toBe(true);
  });

  it('no longer matches once anything changed the commit, such as a ZELD nonce in nLockTime', () => {
    const hunted = `${SEND_TAPROOT.rawtransaction.slice(0, -8)}2a000000`;
    expect(revealSpendsTransaction(SEND_TAPROOT.signed_reveal_rawtransaction, hunted)).toBe(false);
  });
});
