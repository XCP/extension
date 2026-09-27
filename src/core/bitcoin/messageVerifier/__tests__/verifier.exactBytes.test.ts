/**
 * Message verification hashes the exact message bytes, and says which scheme it checked.
 *
 * Bitcoin Core's `signmessage` / `verifymessage` hash the message as given. The verifier used to
 * rewrite CRLF to LF before hashing, so a genuine Core signature over CRLF text was refused, and a
 * signature over the LF text passed for the CRLF text even in strict mode. The Core-style
 * signatures here are made by a preimage built in this file, not by the code under test.
 *
 * It also used to report every BIP-322 simple signature as "BIP-322 Full", having run the simple
 * verifier twice; full-format signatures were never checked at all.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64, hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { bip322MessageHash, createToSpendTransaction, verifyBIP322Signature } from '@/core/bitcoin/bip322';
import { signMessage } from '@/core/bitcoin/messageSigner';
import { verifyBIP322 } from '../specs/bip322';
import { verifyMessage } from '../verifier';

const PRIV = hex.decode('0000000000000000000000000000000000000000000000000000000000000003');
const PUB = secp256k1.getPublicKey(PRIV, true);
const P2PKH = btc.p2pkh(PUB).address!;
const P2WPKH = btc.p2wpkh(PUB).address!;

/** `"\x18Bitcoin Signed Message:\n" || CompactSize(len) || message`, double-SHA256'd, as Core does. */
function coreMessageDigest(message: string): Uint8Array {
  const magic = new TextEncoder().encode('\x18Bitcoin Signed Message:\n');
  const body = new TextEncoder().encode(message);
  if (body.length >= 0xfd) throw new Error('test helper handles short messages only');
  const preimage = new Uint8Array(magic.length + 1 + body.length);
  preimage.set(magic, 0);
  preimage[magic.length] = body.length;
  preimage.set(body, magic.length + 1);
  return sha256(sha256(preimage));
}

/** A 65-byte recoverable signature with a BIP-137 header: 31 for compressed P2PKH, 39 for P2WPKH. */
function coreSign(message: string, headerBase: number): string {
  const recovered = secp256k1.sign(coreMessageDigest(message), PRIV, { prehash: false, format: 'recovered' });
  const out = new Uint8Array(65);
  out[0] = headerBase + recovered[0]!;
  out.set(recovered.slice(1), 1);
  return base64.encode(out);
}

const CRLF = 'line one\r\nline two\r\n';
const LF = 'line one\nline two\n';

describe('legacy / BIP-137 verification hashes the exact bytes', () => {
  it.each([
    ['P2PKH', 31, P2PKH],
    ['P2WPKH', 39, P2WPKH],
  ] as const)('accepts a Core-style %s signature over CRLF text, in strict mode', async (_type, header, address) => {
    const result = await verifyMessage(CRLF, coreSign(CRLF, header), address, { strict: true });
    expect(result.valid).toBe(true);
    expect(result.method).not.toContain('normalized');
  });

  it('refuses a signature over the LF text for the CRLF text in strict mode', async () => {
    const lfSignature = coreSign(LF, 31);
    expect((await verifyMessage(LF, lfSignature, P2PKH, { strict: true })).valid).toBe(true);
    expect((await verifyMessage(CRLF, lfSignature, P2PKH, { strict: true })).valid).toBe(false);
  });

  it('refuses a signature over the CRLF text for the LF text in strict mode', async () => {
    expect((await verifyMessage(LF, coreSign(CRLF, 31), P2PKH, { strict: true })).valid).toBe(false);
  });

  it('tolerates a line-ending change only outside strict mode, and says so', async () => {
    const fromLf = await verifyMessage(CRLF, coreSign(LF, 31), P2PKH);
    expect(fromLf.valid).toBe(true);
    expect(fromLf.method).toContain('(normalized)');
    expect(fromLf.details).toContain('message');

    // A textarea hands back LF only, so a CRLF signature pasted into the verify page arrives as LF.
    const fromCrlf = await verifyMessage(LF, coreSign(CRLF, 31), P2PKH);
    expect(fromCrlf.valid).toBe(true);
    expect(fromCrlf.method).toContain('(normalized)');
  });

  it('still refuses a signature over different words, whatever the line endings', async () => {
    expect((await verifyMessage(CRLF, coreSign('line one\r\nline 2\r\n', 31), P2PKH)).valid).toBe(false);
  });
});

describe('BIP-322 labelling', () => {
  // bips/bip-0322/basic-test-vectors.json
  const SPEC_ADDRESS = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';
  const SPEC_HELLO =
    'AkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=';

  it('labels a spec P2WPKH simple vector as BIP-322 Simple', async () => {
    const result = await verifyMessage('Hello World', SPEC_HELLO, SPEC_ADDRESS, { strict: true });
    expect(result).toMatchObject({ valid: true, method: 'BIP-322 Simple (P2WPKH)' });
  });

  it('labels a P2TR simple signature as BIP-322 Simple', async () => {
    const result = await verifyMessage(
      'Hello World',
      'AUHd69PrJQEv+oKTfZ8l+WROBHuy9HKrbFCJu7U1iK2iiEy1vMU5EfMtjc+VSHM7aU0SDbak5IUZRVno2P5mjSafAQ==',
      'bc1ppv609nr0vr25u07u95waq5lucwfm6tde4nydujnu8npg4q75mr5sxq8lt3',
      { strict: true },
    );
    expect(result).toMatchObject({ valid: true, method: 'BIP-322 Simple (P2TR)' });
  });

  it('refuses a full-format signature with a reason, rather than claiming to have checked it', async () => {
    // The same valid spec signature, re-encoded in the full format: the whole `to_sign`
    // transaction, witness included. It is genuine; it is refused because it is not verified here.
    const scriptPubKey = btc.OutScript.encode(btc.Address(btc.NETWORK).decode(SPEC_ADDRESS));
    const toSpend = createToSpendTransaction(bip322MessageHash('Hello World'), scriptPubKey);
    const witness = base64.decode(SPEC_HELLO);
    const full = new Uint8Array([
      0, 0, 0, 0,                          // nVersion 0
      0x00, 0x01,                          // segwit marker and flag
      0x01,                                // one input
      ...sha256(sha256(toSpend)), 0, 0, 0, 0,
      0x00,                                // empty scriptSig
      0, 0, 0, 0,                          // nSequence 0
      0x01,                                // one output
      0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0x6a,  // 0 sats to OP_RETURN
      ...witness,
      0, 0, 0, 0,                          // nLockTime 0
    ]);
    const fullB64 = base64.encode(full);

    expect(await verifyBIP322Signature('Hello World', fullB64, SPEC_ADDRESS)).toBe(false);
    const spec = await verifyBIP322('Hello World', fullB64, SPEC_ADDRESS);
    expect(spec.valid).toBe(false);
    expect(spec.details).toContain('full-format');
    expect((await verifyMessage('Hello World', fullB64, SPEC_ADDRESS)).valid).toBe(false);
  });
});

describe('sign -> verify round trip for every software-wallet address format', () => {
  const PRIV_HEX = hex.encode(PRIV);
  const MESSAGE = 'Round trip\r\nwith a CRLF and a tab\t.';

  it.each([
    [AddressFormat.P2PKH, 'P2PKH'],
    [AddressFormat.Counterwallet, 'P2PKH'],
    [AddressFormat.FreewalletBIP39, 'P2PKH'],
    [AddressFormat.P2WPKH, 'P2WPKH'],
    [AddressFormat.CounterwalletSegwit, 'P2WPKH'],
    [AddressFormat.FreewalletBIP39Segwit, 'P2WPKH'],
    [AddressFormat.P2SH_P2WPKH, 'P2SH'],
    [AddressFormat.P2TR, 'P2TR'],
  ])('%s', async (format, type) => {
    const { signature, address } = await signMessage(MESSAGE, PRIV_HEX, format);
    const result = await verifyMessage(MESSAGE, signature, address, { strict: true });
    expect(result).toMatchObject({ valid: true, method: `BIP-322 Simple (${type})` });
    // The signer hashes the exact bytes too: the LF text is a different message.
    expect((await verifyMessage(MESSAGE.replace(/\r\n/g, '\n'), signature, address, { strict: true })).valid).toBe(false);
  });

  it('uncompressed P2PKH', async () => {
    const { signature, address } = await signMessage(MESSAGE, PRIV_HEX, AddressFormat.P2PKH, false);
    expect((await verifyMessage(MESSAGE, signature, address, { strict: true })).valid).toBe(true);
  });
});

describe('P2PKH signatures already issued keep verifying', () => {
  // Signed by this wallet before this change and pinned: the two-item `[signature, pubkey]` witness
  // stack over the BIP-322 legacy sighash. Anything that changes how P2PKH is signed must keep these.
  const MESSAGE = 'XCP Wallet P2PKH proof';
  const ISSUED = [
    {
      address: '1CUNEBjYrCn2y1SdiUMohaKUi4wpP326Lb',
      signature: 'AkgwRQIhAP+WQr31OjmVlanu92BiaJF95Sw0Yf3IkkmSVMzYtd07AiAE5ih56BU+oVEG4H8e8WGhF/JMmR54WJuU/jddLhGIsAEhAvkwigGSWMMQSTRPhfidUim1MchFg2+ZsIYB8RO84Db5',
    },
    {
      address: '1NZUP3JAc9JkmbvmoTv7nVgZGtyJjirKV1',
      signature: 'AkcwRAIge1cT62yamu36v04WXZT3slKYtdzkPiNIsW/Guw8nylwCIE9aXrAWHDqqQ5p0XC/F3MN2gPpbfrpDnumJ5e9vRRR6AUEE+TCKAZJYwxBJNE+F+J1SKbUxyEWDb5mwhgHxE7zgNvk4j3sPYy3oFA/jN+YqN/NWZQCpmTTCIxtsuf11hLjmcg==',
    },
  ];

  it.each(ISSUED)('$address', async ({ address, signature }) => {
    expect((await verifyMessage(MESSAGE, signature, address, { strict: true }))).toMatchObject({
      valid: true,
      method: 'BIP-322 Simple (P2PKH)',
    });
    expect((await verifyMessage(`${MESSAGE}.`, signature, address)).valid).toBe(false);
  });
});
