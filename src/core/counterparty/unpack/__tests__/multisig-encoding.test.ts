/**
 * Counterparty payloads carried in bare-multisig outputs.
 *
 * Only the OP_RETURN encoding used to be classified, so a message in any other
 * encoding reached the approval screen unidentified — and an unidentified
 * message skipped the sweep block entirely. These tests build multisig outputs
 * the way counterparty-core's composer does and assert the payload is recovered
 * and classified, so the block applies regardless of encoding.
 */

import { getPublicKey } from '@noble/secp256k1';
import { afterEach, describe, expect, it } from 'vitest';
import { setSourcePubkeyProvider } from '../../sourcePubkey';
import { analyzeTransactionSafety } from '../../transactionSafety';
import { packAddress } from '../address';
import { arc4, bytesToHex, hexToBytes } from '../binary';
import { unpackCounterpartyMessage } from '../index';
import { COUNTERPARTY_PREFIX_HEX } from '../messageTypes';
import { bareMultisigRecoveryPubkey, isBareMultisigDataOutput } from '../multisig';
import { extractCounterpartyPayload, extractPayloadFromOutputs } from '../opReturn';
import { verifyTransaction } from '../verify';

const FIRST_INPUT_TXID = 'a'.repeat(64);
const SWEEP_DESTINATION = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
/** Data bytes one output carries: two fake pubkeys minus their sign and nonce bytes. */
const DATA_BYTES_PER_OUTPUT = 62;
/** Payload bytes per output: the 62 carried bytes minus the length byte and the prefix. */
const CHUNK_SIZE = DATA_BYTES_PER_OUTPUT - 1 - 8;

// Live mainnet compose response for a description-only issuance of CUBINAKAMOTO.15. The source
// uses an uncompressed public key, so Core emits 137-byte data scripts with a 65-byte third key.
const UNCOMPRESSED_ISSUANCE_RAW = '02000000014f6d9766e3fd264be529010a41cc4dc3c16eca0d5951d7ee89dd9c9bae6a760b0000000000ffffffff03e803000000000000895121021a398525a97059dd8421bde390e827f3ea541a0ccce4a4c1a2670734105982e721036354980e97242517e0cdae37fdcb2dcda14ef18b271ee40c07e2fa0ebd87d0794104fc476ca68d25d4a1a6e2b7909b8c10458bcdc6862028f30aeb55d6c1189a6515e02434fe65aaeeb259a364c958e9a073d4cfba1298bbfb8bd4f57d92fa43fe0253aee8030000000000008951210303398525a97059dd844456bed75398efa5d5da909d401661a875151e0e74ca6c2102450b80549103527281bbcb1993ae59e2957da9c0787cb57869db997af4d6fdbf4104fc476ca68d25d4a1a6e2b7909b8c10458bcdc6862028f30aeb55d6c1189a6515e02434fe65aaeeb259a364c958e9a073d4cfba1298bbfb8bd4f57d92fa43fe0253aee02e0000000000001976a9147dcd4447c9ec509bcf77ae9ed18e1c9be8271a7588ac00000000';
const UNCOMPRESSED_ISSUANCE_DATA = '434e54525052545916871b2089ee4508eff9a900f4f4f460583f68747470733a2f2f617277656176652e6e65742f3433584b5f6251746e39637449512d736c4667325159476e3935515046546a4a2d426a5938556537756755';

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
  // A node appends each data output's payload in output order, whatever its encoding.

  it('takes the message type from a multisig chunk placed ahead of the OP_RETURN', () => {
    // An honest-looking enhanced send in the OP_RETURN, with a sweep in front supplying the type
    // byte the node acts on.
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
    // Both decrypt to the prefix, so a node takes both.
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
  it('recovers a real issuance whose recovery pubkey is uncompressed', () => {
    const payload = extractCounterpartyPayload(UNCOMPRESSED_ISSUANCE_RAW);

    expect(payload).toBe(UNCOMPRESSED_ISSUANCE_DATA);
    const unpacked = unpackCounterpartyMessage(payload!);
    expect(unpacked.success).toBe(true);
    expect(unpacked.messageType).toBe('issuance');
    expect(unpacked.data).toMatchObject({
      asset: 'A2344667061293152681',
      quantity: 0n,
      divisible: false,
      description: 'https://arweave.net/43XK_bQtn9ctIQ-slFg2QYGn95QPFTjJ-BjY8Ue7ugU',
    });
  });

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

  it('a plaintext CNTRPRTY OP_RETURN is never read as a message', () => {
    // A node ARC4-decrypts every OP_RETURN, so plaintext prefix bytes are not a message it ignores
    // — they are data it cannot read, which fails the whole transaction. Honoring the plaintext
    // form here would bless a message nothing will execute.
    const decoyOpReturn = '6a0d' + COUNTERPARTY_PREFIX_HEX + '0212345678'; // plaintext CNTRPRTY bytes

    expect(extractPayloadFromOutputs([decoyOpReturn], FIRST_INPUT_TXID)).toBeNull();
  });

  it('reads nothing from a transaction whose OP_RETURN fails, whatever else it carries', () => {
    // The sweep in the multisig outputs would never run: `parse_vout` returns `Err` for the
    // unreadable OP_RETURN, which raises `DecodeError` for the transaction as a whole. Surfacing
    // the sweep would describe something the network does not do.
    const scripts = [
      '6a0d' + COUNTERPARTY_PREFIX_HEX + '0212345678',
      ...multisigScriptsFor(sweepMessage(), FIRST_INPUT_TXID),
    ];

    expect(extractPayloadFromOutputs(scripts, FIRST_INPUT_TXID)).toBeNull();
  });

  it('ignores a bare taproot reveal marker rather than failing on it', () => {
    // The one plaintext OP_RETURN a node does accept: exactly the prefix, marking a reveal whose
    // message lives in the witness.
    const scripts = [
      '6a08' + COUNTERPARTY_PREFIX_HEX,
      ...multisigScriptsFor(sweepMessage(), FIRST_INPUT_TXID),
    ];

    expect(extractPayloadFromOutputs(scripts, FIRST_INPUT_TXID))
      .toBe(COUNTERPARTY_PREFIX_HEX + bytesToHex(sweepMessage()));
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

describe('the recovery key rides in the third slot', () => {
  const signerPubkey = '02' + '11'.repeat(32);
  const uncompressedSignerPubkey = '04' + '11'.repeat(64);
  const strangerPubkey = '03' + '22'.repeat(32);

  /** A data script embedding `recovery` where core puts the source pubkey. */
  const scriptWithRecoveryKey = (recovery: string): string =>
    bytesToHex(new Uint8Array([
      0x51,
      0x21, ...new Uint8Array(33).fill(0x02),
      0x21, ...new Uint8Array(33).fill(0x04),
      hexToBytes(recovery).length, ...hexToBytes(recovery),
      0x53,
      0xae,
    ]));

  afterEach(() => setSourcePubkeyProvider(null));

  it('reads the third slot back out of a data script', () => {
    expect(bareMultisigRecoveryPubkey(scriptWithRecoveryKey(signerPubkey))).toBe(signerPubkey);
  });

  it('accepts and returns an uncompressed recovery key', () => {
    const script = scriptWithRecoveryKey(uncompressedSignerPubkey);
    expect(isBareMultisigDataOutput(script)).toBe(true);
    expect(bareMultisigRecoveryPubkey(script)).toBe(uncompressedSignerPubkey);
  });

  it.each([
    ['an OP_RETURN', '6a04deadbeef'],
    ['a P2PKH script', '76a914' + '11'.repeat(20) + '88ac'],
    ['a truncated multisig', ('51' + '21' + '02'.repeat(33) + '53ae')],
  ])('claims nothing about %s', (_label, scriptHex) => {
    expect(bareMultisigRecoveryPubkey(scriptHex)).toBeNull();
  });

  // The gap the old comment on isCounterpartyDataScript documented: compose accepts a
  // multisig_pubkey override, so a hostile composer can point every data output's dust at a key
  // that is not the signer's. Checkable exactly when the wallet holds the signer's key.
  it('warns when a data output embeds a recovery key that is not the signers own', () => {
    setSourcePubkeyProvider((address) => (address === 'bc1qsigner' ? signerPubkey : null));

    const safety = analyzeTransactionSafety('send', [
      { value: 546, type: 'multisig', script: scriptWithRecoveryKey(strangerPubkey) },
    ], 'bc1qsigner');

    expect(safety.warnings.some((w) => w.title === 'Data Outputs Not Recoverable By You')).toBe(true);
  });

  it('stays quiet when the recovery key is the signers own', () => {
    setSourcePubkeyProvider(() => signerPubkey);

    const safety = analyzeTransactionSafety('send', [
      { value: 546, type: 'multisig', script: scriptWithRecoveryKey(signerPubkey) },
    ], 'bc1qsigner');

    expect(safety.warnings.some((w) => w.title === 'Data Outputs Not Recoverable By You')).toBe(false);
  });

  it('recognizes compressed and uncompressed encodings of the same recovery key', () => {
    const privateKey = hexToBytes('01'.repeat(32));
    const compressed = bytesToHex(getPublicKey(privateKey, true));
    const uncompressed = bytesToHex(getPublicKey(privateKey, false));
    setSourcePubkeyProvider(() => uncompressed);

    const safety = analyzeTransactionSafety('send', [
      { value: 546, type: 'multisig', script: scriptWithRecoveryKey(compressed) },
    ], '1legacySigner');

    expect(safety.warnings.some((w) => w.title === 'Data Outputs Not Recoverable By You')).toBe(false);
  });

  // With no key to compare against there is nothing to claim. Silence is the pre-existing
  // behaviour, and a warning built on a guess would cry wolf on every PSBT whose signers this
  // wallet does not hold.
  it('stays quiet when the wallet holds no key for any signer', () => {
    const safety = analyzeTransactionSafety('send', [
      { value: 546, type: 'multisig', script: scriptWithRecoveryKey(strangerPubkey) },
    ], 'bc1qsigner');

    expect(safety.warnings.some((w) => w.title === 'Data Outputs Not Recoverable By You')).toBe(false);
  });
});
