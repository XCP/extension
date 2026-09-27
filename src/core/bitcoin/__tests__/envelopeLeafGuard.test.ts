/**
 * Script-path signing of Counterparty envelope leaves: the wallet signs a leaf naming one of its
 * keys only when it is the leaf whose message the approval decoded and shows.
 *
 * Every PSBT here is a real one a site could send, built with scure and signed with the real
 * signer. The review side (unshownKeyLeafInputs / withEnvelopeLeafGuard) and the signer side
 * (signPSBT with the leaf the approval shows, exactly as WalletSigner passes it) are both checked.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Address, p2tr, p2wpkh, Script, SigHash, Transaction, taprootNumsKey } from '@scure/btc-signer';
import { taprootTweakPubkey } from '@scure/btc-signer/utils.js';
import { describe, expect, it } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import {
  resolvePsbtCounterpartyPayload,
  shownEnvelopeLeaf,
  unshownKeyLeafInputs,
  walletLeafKeys,
  withEnvelopeLeafGuard,
} from '@/core/bitcoin/envelopeLeafGuard';
import { extractPsbtDetails, signPSBT } from '@/core/bitcoin/psbt';
import { encodeCbor } from '@/core/counterparty/pack/cbor';
import { arc4 } from '@/core/counterparty/unpack/binary';

const USER_KEY = '0b'.repeat(32);
const userPubkey = secp256k1.getPublicKey(hexToBytes(USER_KEY), true);
const userXOnly = userPubkey.slice(1, 33);
const userTaproot = p2tr(userXOnly, undefined, undefined, true);
const userOutputKey = (Address().decode(userTaproot.address!) as { type: 'tr'; pubkey: Uint8Array }).pubkey;
const userSegwit = p2wpkh(userPubkey);
const OTHER_KEY = hexToBytes('c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5');
const MARKER = hexToBytes('6a08434e545250525459');

const taprootUser = walletLeafKeys([{ address: userTaproot.address!, pubKey: bytesToHex(userPubkey) }]);
const segwitUser = walletLeafKeys([{ address: userSegwit.address!, pubKey: bytesToHex(userPubkey) }]);

function push(ops: number[], data: Uint8Array): void {
  if (data.length < 76) ops.push(data.length);
  else if (data.length < 256) ops.push(0x4c, data.length);
  else ops.push(0x4d, data.length & 0xff, (data.length >> 8) & 0xff);
  ops.push(...data);
}

/** A fairminter the local unpacker decodes (the provider inscription suite's fixture). */
const FAIRMINTER = encodeCbor([
  90n, 95428956661682177n, 0n, 100000000n, 1000000000n, 1000000000n, 0n, 100000000000n, 0n,
  900000n, 0n, 10000000000n, 900420n, 0n, false, true, true, true, 5000000000n, 95428956661682178n,
]);

/**
 * `OP_FALSE OP_IF "ord" 07 "xcp" 01 <mime> 05 <metadata> OP_0 <body> OP_ENDIF <key> OP_CHECKSIG`,
 * with `tail` in place of the final `<key> OP_CHECKSIG` when given.
 */
function envelope(key: Uint8Array, metadata: Uint8Array = FAIRMINTER, tail?: number[]): Uint8Array {
  const encoder = new TextEncoder();
  const ops: number[] = [0x00, 0x63];
  push(ops, encoder.encode('ord'));
  push(ops, new Uint8Array([0x07]));
  push(ops, encoder.encode('xcp'));
  push(ops, new Uint8Array([0x01]));
  push(ops, encoder.encode('image/png'));
  push(ops, new Uint8Array([0x05]));
  push(ops, metadata);
  ops.push(0x00);
  push(ops, new Uint8Array(16).fill(9));
  ops.push(0x68);
  if (tail) ops.push(...tail);
  else { push(ops, key); ops.push(0xac); }
  return new Uint8Array(ops);
}

/** An envelope the wallet cannot read: metadata that is not a message. */
const unreadable = (key: Uint8Array) => envelope(key, new Uint8Array([0xff, 0xff]));

interface RevealOptions {
  /** Where the leaf input sits; a plain P2TR input of the user fills index 0 when it is not 0. */
  leafIndex?: number;
  marker?: boolean;
  /** An encrypted Counterparty message in the outputs, so the screen shows that one instead. */
  opReturnMessage?: boolean;
  /** A second leaf in the same tree. */
  secondLeaf?: Uint8Array;
}

/** A site's reveal PSBT: spends a commit whose tree holds `leaf`, pays 546 back to the user. */
function reveal(leaf: Uint8Array, { leafIndex = 0, marker = true, opReturnMessage = false, secondLeaf }: RevealOptions = {}) {
  const tree = secondLeaf
    ? [{ script: leaf, leafVersion: 0xc0 }, { script: secondLeaf, leafVersion: 0xc0 }]
    : { script: leaf, leafVersion: 0xc0 };
  const commit = p2tr(taprootNumsKey(), tree, undefined, true);
  const tx = new Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true });
  const leafInput = {
    txid: '22'.repeat(32), index: 0,
    witnessUtxo: { script: commit.script, amount: 10_000n },
    // Both leaves when the tree has two; otherwise the one under test.
    tapLeafScript: commit.tapLeafScript,
  };
  const plainInput = {
    txid: '33'.repeat(32), index: 1,
    witnessUtxo: { script: userTaproot.script, amount: 10_000n },
  };
  if (leafIndex === 0) tx.addInput(leafInput);
  else { tx.addInput(plainInput); tx.addInput(leafInput); }
  if (opReturnMessage) {
    const payload = new Uint8Array([...hexToBytes('434e545250525459'), 0x1e, ...new Uint8Array(8)]);
    // Encrypted with input 0's txid, as Counterparty reads it.
    tx.addOutput({ script: Script.encode(['RETURN', arc4(tx.getInput(0).txid!, payload)]), amount: 0n });
  }
  if (marker) tx.addOutput({ script: MARKER, amount: 0n });
  tx.addOutputAddress(userTaproot.address!, 546n);
  return bytesToHex(tx.toPSBT());
}

/** Sign as WalletSigner does: the leaf the approval shows, read from the same bytes. */
function signAsWallet(psbtHex: string, format: AddressFormat, indices: number[] = [0]) {
  const shown = shownEnvelopeLeaf(extractPsbtDetails(psbtHex));
  return signPSBT(psbtHex, USER_KEY, indices, format, undefined, true, shown ? { shownEnvelopeLeaf: shown } : {});
}

function scriptSigs(signedHex: string, index = 0) {
  return Transaction.fromPSBT(hexToBytes(signedHex), {
    allowUnknownInputs: true, allowUnknownOutputs: true, disableScriptCheck: true,
  }).getInput(index).tapScriptSig ?? [];
}

describe('the supported reveal: a decoded message the approval shows', () => {
  const leaf = envelope(userOutputKey);

  it('shows the envelope message and names input 0\'s leaf as the one that may be signed', () => {
    const details = extractPsbtDetails(reveal(leaf));
    expect(resolvePsbtCounterpartyPayload(details)?.dataHex.startsWith('434e5452505254595a')).toBe(true);
    expect(shownEnvelopeLeaf(details)).toBe(bytesToHex(leaf));
    expect(unshownKeyLeafInputs(details, taprootUser)).toEqual([]);
  });

  it('still signs, with the output key, through the path WalletSigner uses', () => {
    const sigs = scriptSigs(signAsWallet(reveal(leaf), AddressFormat.P2TR));
    expect(sigs).toHaveLength(1);
    expect(bytesToHex(sigs[0]![0].pubKey)).toBe(bytesToHex(userOutputKey));
  });

  it('leaves the analysis untouched', () => {
    const decoded = { psbtDetails: extractPsbtDetails(reveal(leaf)), safety: { blocked: false, warnings: [] } };
    expect(withEnvelopeLeafGuard(decoded, taprootUser)).toBe(decoded);
  });
});

describe('a Taproot user: leaves naming the output key whose message is not shown', () => {
  const cases: Array<[string, string, number]> = [
    ['an envelope that does not decode', reveal(unreadable(userOutputKey)), 0],
    ['a decodable envelope without the CNTRPRTY marker', reveal(envelope(userOutputKey), { marker: false }), 0],
    ['a decodable envelope while the outputs carry another message',
      reveal(envelope(userOutputKey), { opReturnMessage: true }), 0],
    ['a decodable envelope on input 1', reveal(envelope(userOutputKey), { leafIndex: 1 }), 1],
    ['a decodable envelope declared beside a second leaf',
      reveal(envelope(userOutputKey), { secondLeaf: envelope(OTHER_KEY) }), 0],
  ];

  it.each(cases)('blocks the review for %s', (_name, psbtHex, index) => {
    const details = extractPsbtDetails(psbtHex);
    expect(unshownKeyLeafInputs(details, taprootUser)).toEqual([index]);
    const guarded = withEnvelopeLeafGuard({ psbtDetails: details, safety: { blocked: false, warnings: [] } }, taprootUser);
    expect(guarded.safety.blocked).toBe(true);
    expect(guarded.safety.warnings[0]).toMatchObject({
      code: 'unshown_envelope_signature', severity: 'block', data: { inputs: [index] },
    });
  });

  it.each(cases)('never signs %s', (_name, psbtHex, index) => {
    expect(() => signAsWallet(psbtHex, AddressFormat.P2TR, [index]))
      .toThrow(/approval did not show/);
  });

  it("shows the outputs' message, not the leaf's, when both are present", () => {
    const payload = resolvePsbtCounterpartyPayload(extractPsbtDetails(reveal(envelope(userOutputKey), { opReturnMessage: true })));
    expect(payload?.dataHex.startsWith('434e5452505254591e')).toBe(true);
    expect(payload?.revealLeaf).toBeUndefined();
  });

  it('refuses a leaf naming the internal key', () => {
    const psbtHex = reveal(unreadable(userXOnly));
    expect(unshownKeyLeafInputs(extractPsbtDetails(psbtHex), taprootUser)).toEqual([0]);
    expect(() => signAsWallet(psbtHex, AddressFormat.P2TR)).toThrow(/approval did not show/);
  });

  it('refuses a multi-key leaf that needs the user\'s signature before another key', () => {
    // ... OP_ENDIF <user> OP_CHECKSIGVERIFY <other> OP_CHECKSIG: not the exact shape, so not shown.
    const tail = [0x20, ...userOutputKey, 0xad, 0x20, ...OTHER_KEY, 0xac];
    const psbtHex = reveal(envelope(userOutputKey, FAIRMINTER, tail));
    expect(unshownKeyLeafInputs(extractPsbtDetails(psbtHex), taprootUser)).toEqual([0]);
    expect(() => signAsWallet(psbtHex, AddressFormat.P2TR)).toThrow(/approval did not show/);
  });

  it('refuses a decodable multi-key leaf ending in the user\'s key', () => {
    // ... OP_ENDIF <other> OP_CHECKSIGVERIFY <user> OP_CHECKSIG: decodes, but is not the exact shape.
    const tail = [0x20, ...OTHER_KEY, 0xad, 0x20, ...userOutputKey, 0xac];
    const psbtHex = reveal(envelope(userOutputKey, FAIRMINTER, tail));
    expect(unshownKeyLeafInputs(extractPsbtDetails(psbtHex), taprootUser)).toEqual([0]);
    expect(() => signAsWallet(psbtHex, AddressFormat.P2TR)).toThrow(/approval did not show/);
  });

  it('refuses when the caller vouches for a different leaf', () => {
    const psbtHex = reveal(unreadable(userOutputKey));
    expect(() => signPSBT(psbtHex, USER_KEY, [0], AddressFormat.P2TR, undefined, true,
      { shownEnvelopeLeaf: bytesToHex(envelope(userOutputKey)) })).toThrow(/approval did not show/);
  });
});

describe('a SegWit user: a leaf naming the x-only form of the address key', () => {
  it.each([
    ['an envelope that does not decode', reveal(unreadable(userXOnly))],
    ['a decodable envelope without the marker', reveal(envelope(userXOnly), { marker: false })],
  ])('blocks the review and never signs %s', (_name, psbtHex) => {
    expect(unshownKeyLeafInputs(extractPsbtDetails(psbtHex), segwitUser)).toEqual([0]);
    expect(() => signAsWallet(psbtHex, AddressFormat.P2WPKH)).toThrow(/approval did not show/);
    expect(() => signAsWallet(psbtHex, AddressFormat.P2SH_P2WPKH)).toThrow(/approval did not show/);
  });

  it('counts the key whichever parity it has', () => {
    const odd = secp256k1.getPublicKey(hexToBytes(USER_KEY), true);
    const flipped = new Uint8Array(odd);
    flipped[0] = odd[0] === 0x02 ? 0x03 : 0x02;
    const keys = walletLeafKeys([{ address: userSegwit.address!, pubKey: bytesToHex(flipped) }]);
    expect(unshownKeyLeafInputs(extractPsbtDetails(reveal(unreadable(userXOnly))), keys)).toEqual([0]);
  });
});

describe('what the rule leaves alone', () => {
  it('a leaf naming only someone else\'s key', () => {
    const psbtHex = reveal(unreadable(OTHER_KEY));
    expect(unshownKeyLeafInputs(extractPsbtDetails(psbtHex), taprootUser)).toEqual([]);
    expect(unshownKeyLeafInputs(extractPsbtDetails(psbtHex), segwitUser)).toEqual([]);
    // The signer finds no key of its own there, as before: no signature, and not this refusal.
    expect(() => signAsWallet(psbtHex, AddressFormat.P2TR)).toThrow(/No taproot scripts signed/);
  });

  it('a key-path spend of the user\'s own Taproot output', () => {
    const tx = new Transaction();
    tx.addInput({ txid: '44'.repeat(32), index: 0, witnessUtxo: { script: userTaproot.script, amount: 50_000n } });
    tx.addOutputAddress(userTaproot.address!, 49_000n);
    const psbtHex = bytesToHex(tx.toPSBT());
    expect(unshownKeyLeafInputs(extractPsbtDetails(psbtHex), taprootUser)).toEqual([]);
    const signed = Transaction.fromPSBT(hexToBytes(signAsWallet(psbtHex, AddressFormat.P2TR)));
    expect(signed.getInput(0).tapKeySig).toBeDefined();
  });

  it('a SegWit spend that carries no leaves', () => {
    const tx = new Transaction();
    tx.addInput({ txid: '55'.repeat(32), index: 0, witnessUtxo: { script: userSegwit.script, amount: 50_000n },
      sighashType: SigHash.ALL });
    tx.addOutputAddress(userSegwit.address!, 49_000n);
    const psbtHex = bytesToHex(tx.toPSBT());
    expect(unshownKeyLeafInputs(extractPsbtDetails(psbtHex), segwitUser)).toEqual([]);
    expect(Transaction.fromPSBT(hexToBytes(signAsWallet(psbtHex, AddressFormat.P2WPKH))).getInput(0).partialSig)
      .toHaveLength(1);
  });
});

describe('walletLeafKeys', () => {
  it('holds the x-only key for every format and the output key for Taproot', () => {
    const hex = (keys: Uint8Array[]) => keys.map(bytesToHex).sort((a, b) => a.localeCompare(b));
    expect(hex(taprootUser.keys)).toEqual(hex([userXOnly, userOutputKey]));
    expect(hex(segwitUser.keys)).toEqual([bytesToHex(userXOnly)]);
    expect(bytesToHex(taprootTweakPubkey(userXOnly, new Uint8Array(0))[0])).toBe(bytesToHex(userOutputKey));
  });

  it('refuses every leaf when an address\'s key cannot be read', () => {
    const unknown = walletLeafKeys([{ address: userSegwit.address!, pubKey: '' }]);
    expect(unknown.complete).toBe(false);
    expect(unshownKeyLeafInputs(extractPsbtDetails(reveal(unreadable(OTHER_KEY))), unknown)).toEqual([0]);
    // The shown leaf is still the shown leaf.
    expect(unshownKeyLeafInputs(extractPsbtDetails(reveal(envelope(userOutputKey))), unknown)).toEqual([]);
  });
});
