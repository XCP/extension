/**
 * Software P2PKH message signing emits the classic 65-byte signed-message signature (BIP-137
 * header, Bitcoin Core `signmessage`), for the P2PKH, Counterwallet and FreeWallet BIP39 formats.
 *
 * Every expected signature here is computed in this file with a second implementation
 * (@noble/secp256k1, a test-only dependency, and a preimage and address encoding built here), not
 * by the code under test, then compared byte for byte. Each is also checked by recovering the
 * public key independently and comparing its hash160 with the address, and by the wallet's own
 * verifier in strict mode.
 */

import { hmac } from '@noble/hashes/hmac.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as secp from '@noble/secp256k1';
import { base64, createBase58check, hex } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { signBIP322P2PKH, verifyBIP322Signature } from '@/core/bitcoin/bip322';
import {
  getSigningCapabilities,
  signClassicMessage,
  signMessage,
  softwareMessageSignatureScheme,
} from '@/core/bitcoin/messageSigner';
import { verifyMessage } from '@/core/bitcoin/messageVerifier/verifier';

if (!secp.hashes.sha256) secp.hashes.sha256 = (msg) => new Uint8Array(sha256(msg));
if (!secp.hashes.hmacSha256) secp.hashes.hmacSha256 = (key, msg) => new Uint8Array(hmac(sha256, key, msg));

const base58check = createBase58check(sha256);
const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** `"\x18Bitcoin Signed Message:\n" || CompactSize(len) || message`, double-SHA256'd. */
function independentDigest(message: string): Uint8Array {
  const magic = new TextEncoder().encode('\x18Bitcoin Signed Message:\n');
  const body = new TextEncoder().encode(message);
  let length: number[];
  if (body.length < 0xfd) length = [body.length];
  else if (body.length <= 0xffff) length = [0xfd, body.length & 0xff, body.length >> 8];
  else throw new Error('test helper handles messages under 64 KiB');
  const preimage = new Uint8Array([...magic, ...length, ...body]);
  return sha256(sha256(preimage));
}

/** The classic signature, made with @noble/secp256k1: header 27 + recid (+4 when compressed). */
function independentSignature(message: string, privateKey: Uint8Array, compressed: boolean): Uint8Array {
  const recovered = secp.sign(independentDigest(message), privateKey, { prehash: false, format: 'recovered' });
  const out = new Uint8Array(65);
  out[0] = 27 + recovered[0]! + (compressed ? 4 : 0);
  out.set(recovered.slice(1), 1);
  return out;
}

function p2pkhAddress(publicKey: Uint8Array): string {
  return base58check.encode(new Uint8Array([0x00, ...ripemd160(sha256(publicKey))]));
}

/** Recover the key from a classic signature with @noble/secp256k1 and return its P2PKH address. */
function independentRecoveredAddress(message: string, signature: Uint8Array): string {
  const header = signature[0]!;
  expect(header).toBeGreaterThanOrEqual(27);
  expect(header).toBeLessThanOrEqual(34);
  const compressed = header >= 31;
  const recoveryId = (header - 27) & 3;
  const recovered = new Uint8Array([recoveryId, ...signature.slice(1)]);
  const publicKey = secp.recoverPublicKey(recovered, independentDigest(message), {
    prehash: false,
    isCompressed: compressed,
  });
  expect(publicKey.length).toBe(compressed ? 33 : 65);
  return p2pkhAddress(publicKey);
}

const KEYS = [
  '0000000000000000000000000000000000000000000000000000000000000001',
  '0000000000000000000000000000000000000000000000000000000000000003',
  // The Bitcoin wiki's WIF example key.
  '0c28fca386c7a227600b2fe50b7cae11ec86d3bf1fbe471be89827e19d72aa1d',
];
const MESSAGES = [
  'Hello Bitcoin!',
  '',
  'line one\r\nline two\r\n',
  '\u{1F680} Unicode! 中文 Ñoño\n\tTabs',
  'x'.repeat(300), // CompactSize 0xfd prefix
];
const LEGACY_FORMATS = [AddressFormat.P2PKH, AddressFormat.Counterwallet, AddressFormat.FreewalletBIP39];

describe('classic P2PKH message signatures, byte for byte', () => {
  it.each(LEGACY_FORMATS)('%s: matches an independent signer for every key, message and compression', async (format) => {
    for (const keyHex of KEYS) {
      for (const compressed of [true, false]) {
        const privateKey = hex.decode(keyHex);
        const expectedAddress = p2pkhAddress(secp.getPublicKey(privateKey, compressed));
        for (const message of MESSAGES) {
          const { signature, address } = await signMessage(message, keyHex, format, compressed);
          const bytes = base64.decode(signature);

          expect(address).toBe(expectedAddress);
          expect(hex.encode(bytes)).toBe(hex.encode(independentSignature(message, privateKey, compressed)));
          expect(independentRecoveredAddress(message, bytes)).toBe(address);
          expect(await verifyMessage(message, signature, address, { strict: true })).toMatchObject({
            valid: true,
            method: 'BIP-137 (P2PKH)',
          });
        }
      }
    }
  });

  it('pins one exact vector', () => {
    // Private key 1 (address 1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH), message "Hello Bitcoin!".
    const signature = signClassicMessage('Hello Bitcoin!', hex.decode(KEYS[0]!), true);
    expect(signature).toBe(base64.encode(independentSignature('Hello Bitcoin!', hex.decode(KEYS[0]!), true)));
    expect(independentRecoveredAddress('Hello Bitcoin!', base64.decode(signature))).toBe('1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
  });

  it('is 65 bytes, low-S and deterministic', async () => {
    for (const message of MESSAGES) {
      const first = await signMessage(message, KEYS[2]!, AddressFormat.P2PKH);
      const again = await signMessage(message, KEYS[2]!, AddressFormat.P2PKH);
      expect(first.signature).toBe(again.signature);
      const bytes = base64.decode(first.signature);
      expect(bytes.length).toBe(65);
      const s = BigInt(`0x${hex.encode(bytes.slice(33))}`);
      expect(s <= CURVE_ORDER / 2n).toBe(true);
    }
  });

  it('uses header 31-34 for compressed keys and 27-30 for uncompressed keys', async () => {
    const recoveryIds = new Set<number>();
    for (let i = 0; i < 24; i++) {
      const message = `header probe ${i}`;
      const compressed = base64.decode((await signMessage(message, KEYS[1]!, AddressFormat.P2PKH, true)).signature);
      const uncompressed = base64.decode((await signMessage(message, KEYS[1]!, AddressFormat.P2PKH, false)).signature);
      expect(compressed[0]).toBeGreaterThanOrEqual(31);
      expect(compressed[0]).toBeLessThanOrEqual(34);
      expect(uncompressed[0]).toBeGreaterThanOrEqual(27);
      expect(uncompressed[0]).toBeLessThanOrEqual(30);
      // Same key, same digest: only the header's compression offset differs.
      expect(compressed[0]! - uncompressed[0]!).toBe(4);
      expect(hex.encode(compressed.slice(1))).toBe(hex.encode(uncompressed.slice(1)));
      recoveryIds.add(compressed[0]! - 31);
    }
    // Both common recovery ids appear, so the offset is exercised rather than a constant.
    expect(recoveryIds.has(0) && recoveryIds.has(1)).toBe(true);
  });

  it('a header with the wrong compression flag does not verify for the address', async () => {
    const message = 'compression flag';
    for (const compressed of [true, false]) {
      const { signature, address } = await signMessage(message, KEYS[0]!, AddressFormat.P2PKH, compressed);
      const bytes = base64.decode(signature);
      bytes[0] = bytes[0]! + (compressed ? -4 : 4);
      expect((await verifyMessage(message, base64.encode(bytes), address, { strict: true })).valid).toBe(false);
    }
  });

  it('signs the exact bytes: the LF text is a different message', async () => {
    const crlf = 'line one\r\nline two\r\n';
    const { signature, address } = await signMessage(crlf, KEYS[0]!, AddressFormat.P2PKH);
    expect((await verifyMessage(crlf.replace(/\r\n/g, '\n'), signature, address, { strict: true })).valid).toBe(false);
  });
});

describe('older P2PKH signatures (two-item BIP-322 stack) still verify', () => {
  it.each([true, false])('compressed %s', async (compressed) => {
    const message = 'issued before the classic signer';
    const privateKey = hex.decode(KEYS[2]!);
    const address = p2pkhAddress(secp.getPublicKey(privateKey, compressed));
    const stack = await signBIP322P2PKH(message, privateKey, compressed);
    expect([107, 108, 139, 140]).toContain(base64.decode(stack).length);
    expect(await verifyMessage(message, stack, address, { strict: true })).toMatchObject({
      valid: true,
      method: 'BIP-322 Simple (P2PKH)',
    });
  });
});

describe('SegWit and Taproot stay BIP-322 simple', () => {
  it.each([
    AddressFormat.P2WPKH,
    AddressFormat.P2SH_P2WPKH,
    AddressFormat.P2TR,
    AddressFormat.CounterwalletSegwit,
    AddressFormat.FreewalletBIP39Segwit,
  ])('%s', async (format) => {
    const { signature, address } = await signMessage('Hello Bitcoin!', KEYS[0]!, format);
    expect(base64.decode(signature).length).not.toBe(65);
    expect(await verifyBIP322Signature('Hello Bitcoin!', signature, address)).toBe(true);
  });
});

describe('the scheme reported alongside a software signature', () => {
  it.each(LEGACY_FORMATS)('%s: BIP-137 legacy_recoverable, as a Trezor reports', (format) => {
    expect(softwareMessageSignatureScheme(format)).toEqual({ method: 'BIP-137', format: 'legacy_recoverable' });
    expect(getSigningCapabilities(format).method).toBe('BIP-137');
  });

  it.each([
    AddressFormat.P2WPKH,
    AddressFormat.P2SH_P2WPKH,
    AddressFormat.P2TR,
    AddressFormat.CounterwalletSegwit,
    AddressFormat.FreewalletBIP39Segwit,
  ])('%s: BIP-322 with the address format', (format) => {
    expect(softwareMessageSignatureScheme(format)).toEqual({ method: 'BIP-322', format });
    expect(getSigningCapabilities(format).method).toBe('BIP-322');
  });
});
