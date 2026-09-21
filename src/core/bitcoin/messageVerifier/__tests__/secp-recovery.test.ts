/**
 * Public key recovery, specifically the compressed/uncompressed distinction.
 *
 * BIP-137 header flags 27-30 mean "P2PKH, uncompressed key" and 31-34 mean
 * "P2PKH, compressed key". The two encodings of the same point hash to
 * different addresses, so recovery has to honour the request: returning a
 * compressed key when the caller asked for an uncompressed one silently
 * derives the wrong address and fails every otherwise-valid signature.
 *
 * These tests build signatures from a known key rather than using wallet
 * fixtures, because the point is the encoding, not any wallet's behaviour.
 */

import * as secp from '@noble/secp256k1';
import { base64 } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { verifyLooseBIP137 } from '../compatibility/loose-bip137';
import { verifyBIP137 } from '../specs/bip137';
import { hashMessage, recoverPublicKey } from '../utils';
import { verifyMessage } from '../verifier';

const PRIVATE_KEY = new Uint8Array(32).fill(7);
const MESSAGE = 'Hello World';

function signBIP137(baseFlag: number) {
  const hash = hashMessage(MESSAGE);
  const recovered = secp.sign(hash, PRIVATE_KEY, { prehash: false, format: 'recovered' });
  const recoveryId = recovered[0]!;
  const raw = recovered.slice(1);

  const signature = new Uint8Array(65);
  signature[0] = baseFlag + recoveryId;
  signature.set(raw, 1);

  return { raw, recoveryId, signature: base64.encode(signature), hash };
}

describe('recoverPublicKey encoding', () => {
  const point = secp.Point.fromBytes(secp.getPublicKey(PRIVATE_KEY, true));
  const compressedKey = point.toBytes(true);
  const uncompressedKey = point.toBytes(false);

  it('returns 33 bytes when a compressed key is requested', () => {
    const { raw, recoveryId, hash } = signBIP137(31);

    const key = recoverPublicKey({ raw, recoveryId, compressed: true }, hash);

    expect(key).toEqual(compressedKey);
    expect(key).toHaveLength(33);
  });

  it('returns 65 bytes when an uncompressed key is requested', () => {
    const { raw, recoveryId, hash } = signBIP137(27);

    const key = recoverPublicKey({ raw, recoveryId, compressed: false }, hash);

    // Regression: this used to return the 33-byte compressed key regardless,
    // so uncompressed signatures derived the compressed address and never
    // verified. Truncating 65 bytes to 33 is not compression either.
    expect(key).toEqual(uncompressedKey);
    expect(key).toHaveLength(65);
  });

  it('derives different addresses from the two encodings', () => {
    expect(btc.p2pkh(uncompressedKey).address).not.toBe(btc.p2pkh(compressedKey).address);
  });
});

describe('BIP-137 uncompressed signatures', () => {
  const point = secp.Point.fromBytes(secp.getPublicKey(PRIVATE_KEY, true));

  it('verifies a flag 27-30 signature against its uncompressed address', async () => {
    const { signature } = signBIP137(27);
    const address = btc.p2pkh(point.toBytes(false)).address!;

    const result = await verifyMessage(MESSAGE, signature, address);

    expect(result.valid).toBe(true);
  });

  it('verifies a flag 31-34 signature against its compressed address', async () => {
    const { signature } = signBIP137(31);
    const address = btc.p2pkh(point.toBytes(true)).address!;

    const result = await verifyMessage(MESSAGE, signature, address);

    expect(result.valid).toBe(true);
  });

  it('rejects an uncompressed-flag signature against the compressed address under strict BIP-137', async () => {
    const { signature } = signBIP137(27);
    const address = btc.p2pkh(point.toBytes(true)).address!;

    // Strict BIP-137 honours the flag, so the uncompressed flag must derive
    // the uncompressed address and therefore miss this one.
    const strict = await verifyBIP137(MESSAGE, signature, address);

    expect(strict.valid).toBe(false);
  });

  it('accepts that same pair loosely, because loose verification ignores the flag', async () => {
    const { signature } = signBIP137(27);
    const address = btc.p2pkh(point.toBytes(true)).address!;

    // The loose layer tries both point encodings. That branch only does
    // anything now that recovery honours the compressed flag - before the fix
    // both iterations produced the same compressed key.
    const loose = await verifyLooseBIP137(MESSAGE, signature, address);

    expect(loose.valid).toBe(true);
  });
});
