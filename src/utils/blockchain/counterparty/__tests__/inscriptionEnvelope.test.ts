/**
 * Inscription envelope verification, checked against a real compose response.
 *
 * The fixtures below are a genuine `encoding=taproot` broadcast composed by api.counterparty.io —
 * an image/png inscription of "hello" from a P2WPKH source. Rebuilding the envelope locally and
 * getting the server's bytes back proves the mirror is exact; deriving the commit address and
 * getting the transaction's actual output proves the taproot derivation is right. Together they
 * are the same assertion core makes about its own output in `check_transaction_sanity`.
 */

import { describe, it, expect } from 'vitest';
import { hexToBytes } from '@noble/hashes/utils.js';
import { verifyInscriptionEnvelope, verifyRevealTransaction } from '../inscriptionEnvelope';

const SOURCE = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

/** CNTRPRTY + type 30 + CBOR [timestamp, value, fee_fraction_int, mime_type, content]. */
const DATA = '434e5452505254591e851a66ae50e0fb00000000000000000069696d6167652f706e674568656c6c6f';

const ENVELOPE = '0063036f7264010703786370010109696d6167652f706e6701051284181e1a66ae50e0fb0000'
  + '00000000000000000568656c6c6f6820bbec263aa627fab2cc458b46b4b0193d8dfd7169906b48f5ee12c8bc8'
  + 'bc62693ac';

/** The commit transaction's output 0 pays this P2TR address (875 sats). */
const COMMIT_ADDRESS = 'bc1pk828a69sm0lycjve30m8yhrnuhh4vpks34w2qejtckp28m27pfkqzm0l0a';

const REVEAL = '02000000000101a6511addc5e6d2135ef26767f4f81555d5cbbf68aabc09753fa72f3e6c859b8c00'
  + '00000000ffffffff0200000000000000000a6a08434e5452505254592202000000000000160014751e76e8199'
  + '196d454941c45d1b3a323f1433bd603400e7730b94c4fa3029b93f7347e365b6d1279e80b85cf1ed23ab041a5'
  + '8c294de9ec1a0731924221b27af39b90b49e763e4cb20083277e07c3a236a778c253f0c6570063036f7264010'
  + '703786370010109696d6167652f706e6701051284181e1a66ae50e0fb000000000000000000000568656c6c6f'
  + '6820bbec263aa627fab2cc458b46b4b0193d8dfd7169906b48f5ee12c8bc8bc62693ac21c1bbec263aa627fab'
  + '2cc458b46b4b0193d8dfd7169906b48f5ee12c8bc8bc6269300000000';

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

describe('the pre-signed reveal transaction', () => {
  it('accepts the real reveal, which returns value to the source', () => {
    const result = verifyRevealTransaction(REVEAL, [SOURCE]);

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it('rejects the same reveal when the source is not ours', () => {
    const result = verifyRevealTransaction(REVEAL, ['bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq']);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not yours/);
  });
});
