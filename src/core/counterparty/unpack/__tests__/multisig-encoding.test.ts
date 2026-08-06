/**
 * Counterparty payloads carried in bare-multisig outputs.
 *
 * Only the OP_RETURN encoding used to be classified, so a message in any other
 * encoding reached the approval screen unidentified — and an unidentified
 * message skipped the sweep block entirely. These tests build multisig outputs
 * the way counterparty-core's composer does and assert the payload is recovered
 * and classified, so the block applies regardless of encoding.
 */

import { describe, expect, it } from 'vitest';
import { analyzeTransactionSafety } from '../../transactionSafety';
import { packAddress } from '../address';
import { arc4, bytesToHex, hexToBytes } from '../binary';
import { unpackCounterpartyMessage } from '../index';
import { COUNTERPARTY_PREFIX_HEX } from '../messageTypes';
import { extractPayloadFromOutputs } from '../opReturn';
import { verifyTransaction } from '../verify';

const FIRST_INPUT_TXID = 'a'.repeat(64);
const SWEEP_DESTINATION = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
/** Data bytes one output carries: two fake pubkeys minus their sign and nonce bytes. */
const DATA_BYTES_PER_OUTPUT = 62;
/** Payload bytes per output: the 62 carried bytes minus the length byte and the prefix. */
const CHUNK_SIZE = DATA_BYTES_PER_OUTPUT - 1 - 8;

/** Encode one message chunk as a bare-multisig output script, as core's composer does. */
function multisigOutputScript(chunk: Uint8Array, txid: string): string {
  const prefix = hexToBytes(COUNTERPARTY_PREFIX_HEX);
  const content = new Uint8Array([...prefix, ...chunk]);

  // [length byte][CNTRPRTY][chunk][zero padding], ARC4-obfuscated as a whole.
  const plain = new Uint8Array(DATA_BYTES_PER_OUTPUT);
  plain[0] = content.length;
  plain.set(content, 1);
  const obfuscated = arc4(hexToBytes(txid), plain);

  // Sign and nonce bytes only exist to land the fake pubkey on the curve; they are discarded
  // on decode, so their values do not matter here.
  const pubkey = (data: Uint8Array) => new Uint8Array([0x02, ...data, 0x00]);
  const script = new Uint8Array([
    0x51,
    0x21, ...pubkey(obfuscated.slice(0, 31)),
    0x21, ...pubkey(obfuscated.slice(31, 62)),
    0x21, ...new Uint8Array(33).fill(0x03),
    0x53,
    0xae,
  ]);
  return bytesToHex(script);
}

/** Split a message into the chunks core would spread across multisig outputs. */
function multisigScriptsFor(message: Uint8Array, txid: string): string[] {
  const scripts: string[] = [];
  for (let offset = 0; offset < message.length; offset += CHUNK_SIZE) {
    scripts.push(multisigOutputScript(message.slice(offset, offset + CHUNK_SIZE), txid));
  }
  return scripts;
}

/** A legacy sweep message: type id 4, packed destination, flags. */
function sweepMessage(flags = 3): Uint8Array {
  return new Uint8Array([0x04, ...packAddress(SWEEP_DESTINATION), flags]);
}

/** An ARC4-obfuscated OP_RETURN data output carrying `payload`, as core's composer writes one. */
function opReturnScript(payload: Uint8Array, txid: string): string {
  const prefix = hexToBytes(COUNTERPARTY_PREFIX_HEX);
  const obfuscated = arc4(hexToBytes(txid), new Uint8Array([...prefix, ...payload]));
  return bytesToHex(new Uint8Array([0x6a, obfuscated.length, ...obfuscated]));
}

describe('a message split across encodings is read whole', () => {
  // A node accumulates across every data output, whatever its encoding and wherever it sits:
  // counterparty-rs's vout loop appends each `ParseOutput::Data` in output order. Reading only the
  // first data output would leave the rest of the message unexamined.

  it('takes the message type from a multisig chunk placed ahead of the OP_RETURN', () => {
    // The substitution this prevents: an honest-looking enhanced send in the OP_RETURN, with a
    // sweep sitting in front of it supplying the type byte the node actually acts on.
    const sweep = sweepMessage();
    const enhancedSend = new Uint8Array([0x02, 0xcc, 0xdd]);
    const scripts = [
      ...multisigScriptsFor(sweep, FIRST_INPUT_TXID),
      opReturnScript(enhancedSend, FIRST_INPUT_TXID),
    ];

    const payload = extractPayloadFromOutputs(scripts, FIRST_INPUT_TXID);

    expect(payload).toBe(COUNTERPARTY_PREFIX_HEX + bytesToHex(sweep) + bytesToHex(enhancedSend));
    expect(unpackCounterpartyMessage(payload!).messageType).toBe('sweep');
  });

  it('appends a second Counterparty OP_RETURN to the first', () => {
    // Both decrypt to the prefix, so a node takes both; neither is an "invalid OP_RETURN" it would
    // refuse the transaction over.
    const first = new Uint8Array([0x02, 0x11, 0x22]);
    const second = new Uint8Array([0x33, 0x44]);

    const payload = extractPayloadFromOutputs(
      [opReturnScript(first, FIRST_INPUT_TXID), opReturnScript(second, FIRST_INPUT_TXID)],
      FIRST_INPUT_TXID
    );

    expect(payload).toBe(COUNTERPARTY_PREFIX_HEX + bytesToHex(first) + bytesToHex(second));
  });

  it('still reads an ordinary single-OP_RETURN message unchanged', () => {
    const message = new Uint8Array([0x02, 0xcc, 0xdd]);
    const scripts = [
      opReturnScript(message, FIRST_INPUT_TXID),
      '76a914' + '11'.repeat(20) + '88ac',
    ];

    expect(extractPayloadFromOutputs(scripts, FIRST_INPUT_TXID))
      .toBe(COUNTERPARTY_PREFIX_HEX + bytesToHex(message));
  });
});

describe('extractPayloadFromOutputs, over multisig data outputs', () => {
  it('recovers a single-output payload', () => {
    const message = sweepMessage();
    const payload = extractPayloadFromOutputs(
      multisigScriptsFor(message, FIRST_INPUT_TXID),
      FIRST_INPUT_TXID
    );

    expect(payload).toBe(COUNTERPARTY_PREFIX_HEX + bytesToHex(message));
  });

  it('reassembles a payload spread across several outputs', () => {
    // An issuance with a long description needs more than one output.
    const message = new Uint8Array([20, ...new Uint8Array(120).map((_, i) => (i * 7) & 0xff)]);
    const scripts = multisigScriptsFor(message, FIRST_INPUT_TXID);
    expect(scripts.length).toBeGreaterThan(1);

    const payload = extractPayloadFromOutputs(scripts, FIRST_INPUT_TXID);
    expect(payload).toBe(COUNTERPARTY_PREFIX_HEX + bytesToHex(message));
  });

  it('ignores ordinary payment outputs alongside the data outputs', () => {
    const message = sweepMessage();
    const scripts = [
      ...multisigScriptsFor(message, FIRST_INPUT_TXID),
      '76a914' + '11'.repeat(20) + '88ac',
      '0014' + '22'.repeat(20),
    ];

    expect(extractPayloadFromOutputs(scripts, FIRST_INPUT_TXID))
      .toBe(COUNTERPARTY_PREFIX_HEX + bytesToHex(message));
  });

  it('a plaintext CNTRPRTY OP_RETURN decoy does not shadow a multisig sweep', () => {
    // The attack: a benign plaintext CNTRPRTY OP_RETURN (which the node ignores, since it
    // ARC4-decrypts every OP_RETURN) paired with a real sweep spread across multisig outputs. If
    // extraction honored the plaintext decoy, the wallet would bless it while the network ran the
    // sweep. extractPayloadFromOutputs must decrypt-or-skip the OP_RETURN and surface the sweep.
    const sweep = sweepMessage();
    const decoyOpReturn = '6a0d' + COUNTERPARTY_PREFIX_HEX + '0212345678'; // plaintext CNTRPRTY bytes
    const scripts = [decoyOpReturn, ...multisigScriptsFor(sweep, FIRST_INPUT_TXID)];

    const payload = extractPayloadFromOutputs(scripts, FIRST_INPUT_TXID);
    expect(payload).toBe(COUNTERPARTY_PREFIX_HEX + bytesToHex(sweep));
    expect(unpackCounterpartyMessage(payload!).messageType).toBe('sweep');
  });

  it('returns null for a transaction with no data outputs', () => {
    const scripts = ['76a914' + '11'.repeat(20) + '88ac', '0014' + '22'.repeat(20)];
    expect(extractPayloadFromOutputs(scripts, FIRST_INPUT_TXID)).toBeNull();
  });

  it('returns null when the key does not match', () => {
    const scripts = multisigScriptsFor(sweepMessage(), FIRST_INPUT_TXID);
    expect(extractPayloadFromOutputs(scripts, 'b'.repeat(64))).toBeNull();
  });

  it('reads the whole payload when a payment output is placed between data outputs', () => {
    // Splitting the payload around an ordinary output must not truncate what we read, or the
    // screen would classify a different message from the one the network parses.
    const message = new Uint8Array([20, ...new Uint8Array(120).map((_, i) => (i * 7) & 0xff)]);
    const [first, ...rest] = multisigScriptsFor(message, FIRST_INPUT_TXID);
    const interleaved = [first!, '76a914' + '11'.repeat(20) + '88ac', ...rest];

    expect(extractPayloadFromOutputs(interleaved, FIRST_INPUT_TXID))
      .toBe(COUNTERPARTY_PREFIX_HEX + bytesToHex(message));
  });
});

describe('a sweep is classified in either encoding', () => {
  it('unpacks a multisig-encoded sweep to the sweep message type', () => {
    const payload = extractPayloadFromOutputs(
      multisigScriptsFor(sweepMessage(), FIRST_INPUT_TXID),
      FIRST_INPUT_TXID
    );

    const result = unpackCounterpartyMessage(payload!);
    expect(result.success).toBe(true);
    expect(result.messageType).toBe('sweep');
    expect((result.data as { destination: string }).destination).toBe(SWEEP_DESTINATION);
  });

  it('blocks signing once the message type is resolved', () => {
    const payload = extractPayloadFromOutputs(
      multisigScriptsFor(sweepMessage(), FIRST_INPUT_TXID),
      FIRST_INPUT_TXID
    );
    const messageType = unpackCounterpartyMessage(payload!).messageType;

    const safety = analyzeTransactionSafety(messageType, [], 'bc1qsigner');
    expect(safety.blocked).toBe(true);
    expect(safety.warnings[0]?.title).toBe('Blocked: Sweep Transaction');
  });
});

describe('every message type counterparty-core can compose is decodable', () => {
  // Blocking an undecodable message only stays workable while the set of decodable types matches
  // what core can produce. Burn is absent because it carries no message — it is a plain BTC send
  // to the unspendable address — and rps/rpsresolve have no compose endpoint.
  const COMPOSABLE_TYPE_IDS = [
    0, 2, 3, 4, 10, 11, 12, 13, 20, 21, 22, 23, 30, 40, 50, 70, 90, 91, 100, 101, 102, 110, 120, 121,
  ];

  it.each(COMPOSABLE_TYPE_IDS)('dispatches message type %i', (typeId) => {
    // A deliberately malformed payload: the point is that dispatch reaches an unpacker, so the
    // error is about the payload rather than the type being unsupported.
    const result = unpackCounterpartyMessage(
      new Uint8Array([...hexToBytes(COUNTERPARTY_PREFIX_HEX), typeId, 0, 0, 0, 0])
    );

    expect(result.messageTypeId).toBe(typeId);
    expect(result.error ?? '').not.toMatch(/unsupported message type/i);
  });
});

describe('a message type with no unpacker is not a successful decode', () => {
  // Type id 200 is unassigned, standing in for a protocol message this build predates. The
  // raw bytes come back for display, but reporting success would render the approval screen's
  // "verified locally, no tampering" badge over a message nothing had actually read.
  const undecodable = COUNTERPARTY_PREFIX_HEX + 'c8' + 'deadbeef';

  it('reports failure and keeps the raw payload', () => {
    const result = unpackCounterpartyMessage(undecodable);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unsupported message type/i);
    expect(result.data).toBeDefined();
  });

  it('still reports success for a type it can decode', () => {
    const payload = extractPayloadFromOutputs(
      multisigScriptsFor(sweepMessage(), FIRST_INPUT_TXID),
      FIRST_INPUT_TXID
    );

    expect(unpackCounterpartyMessage(payload!).success).toBe(true);
  });
});

describe('compose types with no field-level verifier', () => {
  // A broadcast message: type id 30, then the CBOR body. Only the type id matters here.
  const _broadcastPayload = COUNTERPARTY_PREFIX_HEX + '1e' + '850001006040';

  it('accepts a response whose message type is the one requested', () => {
    // Dispense has no field-level verifier, so it exercises the type-only path. (Broadcast used to
    // serve this purpose and now has one.)
    const dispensePayload = COUNTERPARTY_PREFIX_HEX + '0d' + '00';
    const result = verifyTransaction(dispensePayload, 'dispense', {});

    expect(result.valid).toBe(true);
    // The absence of field checks is recorded as coverage, not presented as a clean verification —
    // and not pushed into `warnings`, which the review screen shows as detected differences.
    expect(result.fieldVerification).toBe('type-only');
    expect(result.warnings).toEqual([]);
  });

  it('rejects a response carrying a different message type than requested', () => {
    // The user asked to broadcast; the response is a sweep, which no verifier would have compared.
    const sweepPayload = COUNTERPARTY_PREFIX_HEX + bytesToHex(sweepMessage());
    const result = verifyTransaction(sweepPayload, 'broadcast', {});

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Message type mismatch');
  });
});

describe('unclassified transactions fail toward unknown', () => {
  // Each output type that can hide a payload, in both decoders' vocabularies.
  it.each(['unknown', 'multisig', 'nonstandard', 'op_return'])(
    'warns when a %s output carries a payload that could not be read',
    (type) => {
      const safety = analyzeTransactionSafety(
        undefined,
        [{ value: 546, address: 'bc1qother', type }],
        'bc1qsigner'
      );

      expect(safety.warnings.some((w) => w.title === 'Unrecognized Transaction')).toBe(true);
    }
  );

  it('stays quiet for an ordinary transfer carrying no protocol data', () => {
    const safety = analyzeTransactionSafety(
      undefined,
      [{ value: 50_000, address: 'bc1qsigner', type: 'p2wpkh' }],
      'bc1qsigner'
    );

    expect(safety.warnings).toEqual([]);
    expect(safety.blocked).toBe(false);
  });
});
