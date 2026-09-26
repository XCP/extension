/**
 * Real-shaped Counterparty Taproot commit/reveal pairs, built the way core builds them
 * (`composer.py`, `prepare_taproot_output` / `get_reveal_outputs`): the commit pays a P2TR output
 * whose internal key and single leaf key are one throwaway key, and the reveal spends it by that
 * leaf with the bare CNTRPRTY marker as its only output (plus any `leading`/`trailing` outputs).
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2tr, p2wpkh, TaprootControlBlock, Transaction, utils } from '@scure/btc-signer';
import { encodeCbor } from '@/core/counterparty/pack/cbor';
import { COUNTERPARTY_PREFIX_HEX } from '@/core/counterparty/unpack/messageTypes';

const key = (fill: number) => new Uint8Array(32).fill(fill);

export const USER_KEY = key(1);
export const USER_ADDRESS = p2wpkh(getPublicKey(USER_KEY, true)).address!;
export const OTHER_ADDRESS = p2wpkh(getPublicKey(key(2), true)).address!;
/** The site's throwaway key: it signs the reveal, and nothing about it is the user's. */
export const EPHEMERAL_KEY = key(3);
export const EPHEMERAL_PUBKEY = utils.pubSchnorr(EPHEMERAL_KEY);

export const MARKER_SCRIPT = hexToBytes(`6a08${COUNTERPARTY_PREFIX_HEX}`);

function push(out: number[], data: Uint8Array): void {
  if (data.length < 0x4c) out.push(data.length);
  else if (data.length <= 0xff) out.push(0x4c, data.length);
  else out.push(0x4d, data.length & 0xff, data.length >> 8);
  out.push(...data);
}

/** Core's plain data envelope: the message without its CNTRPRTY prefix, in 520-byte pushes. */
export function dataEnvelope(messageHex: string, pubkey: Uint8Array = EPHEMERAL_PUBKEY): Uint8Array {
  const data = hexToBytes(messageHex.slice(COUNTERPARTY_PREFIX_HEX.length));
  const out: number[] = [0x00, 0x63];
  for (let i = 0; i < data.length; i += 520) push(out, data.slice(i, i + 520));
  out.push(0x68);
  push(out, pubkey);
  out.push(0xac);
  return new Uint8Array(out);
}

/** An ord envelope; `metadata` absent makes it a plain ordinals inscription with no message. */
export function ordEnvelope(options: { metadata?: Uint8Array; body?: Uint8Array; pubkey?: Uint8Array } = {}): Uint8Array {
  const encoder = new TextEncoder();
  const out: number[] = [0x00, 0x63];
  push(out, encoder.encode('ord'));
  push(out, new Uint8Array([0x07]));
  push(out, encoder.encode('xcp'));
  push(out, new Uint8Array([0x01]));
  push(out, encoder.encode('text/plain'));
  if (options.metadata) {
    push(out, new Uint8Array([0x05]));
    push(out, options.metadata);
  }
  out.push(0x00);
  push(out, options.body ?? encoder.encode('gm'));
  out.push(0x68);
  push(out, options.pubkey ?? EPHEMERAL_PUBKEY);
  out.push(0xac);
  return new Uint8Array(out);
}

/** A fairminter's metadata, as core writes it into an ord envelope (type id first). */
export const FAIRMINTER_METADATA = encodeCbor([
  90n, 95428956661682177n, 0n, 100000000n, 1000000000n, 1000000000n, 0n, 100000000000n, 0n,
  900000n, 0n, 10000000000n, 900420n, 0n, false, true, true, true, 5000000000n, 95428956661682178n,
]);

export interface RevealOutputSpec {
  script: Uint8Array;
  amount: bigint;
}

/** A P2WPKH output script for an address the fixtures know: the user's or the other party's. */
export function payTo(address: string, amount: bigint): RevealOutputSpec {
  const secret = address === USER_ADDRESS ? USER_KEY : key(2);
  return { script: p2wpkh(getPublicKey(secret, true)).script, amount };
}

export interface CommitFixture {
  psbtHex: string;
  txid: string;
  commitScript: Uint8Array;
  commitValue: number;
  leaf: Uint8Array;
  /** Every leaf the output commits to; one for core's construction. */
  tapLeafScript: ReturnType<typeof p2tr>['tapLeafScript'];
}

/**
 * A commit funded from `funder` (the user by default) paying 600 sats to the envelope's
 * commit address and the rest back as change.
 */
export function buildCommit(leaf: Uint8Array, options: {
  funder?: string;
  extraLeaf?: Uint8Array;
  prevTxid?: string;
} = {}): CommitFixture {
  const tree = options.extraLeaf ? [{ script: leaf }, { script: options.extraLeaf }] : { script: leaf };
  const payment = p2tr(EPHEMERAL_PUBKEY, tree, undefined, true);
  const funder = options.funder ?? USER_ADDRESS;
  const funderScript = funder === USER_ADDRESS
    ? p2wpkh(getPublicKey(USER_KEY, true)).script
    : p2wpkh(getPublicKey(key(2), true)).script;
  const tx = new Transaction();
  tx.addInput({
    txid: options.prevTxid ?? '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0',
    index: 1,
    witnessUtxo: { script: funderScript, amount: 100_000n },
  });
  tx.addOutput({ script: payment.script, amount: 600n });
  tx.addOutput({ script: funderScript, amount: 98_000n });
  return {
    psbtHex: bytesToHex(tx.toPSBT()),
    txid: tx.id,
    commitScript: payment.script,
    commitValue: 600,
    leaf,
    tapLeafScript: payment.tapLeafScript,
  };
}

/**
 * The reveal, signed with the throwaway key and finalized as core does: [signature, leaf, control
 * block]. `publish` swaps in a different leaf after signing — the tampered-envelope case.
 * `leading` outputs go ahead of the marker (core's destinations), `trailing` after it.
 */
export function buildReveal(commit: CommitFixture, options: {
  txid?: string;
  vout?: number;
  publish?: Uint8Array;
  marker?: boolean;
  leading?: RevealOutputSpec[];
  trailing?: RevealOutputSpec[];
} = {}): string {
  const tx = new Transaction({ allowUnknownOutputs: true });
  const [controlBlock] = commit.tapLeafScript!.find(([, script]) =>
    bytesToHex(script.slice(0, -1)) === bytesToHex(commit.leaf))!;
  tx.addInput({
    txid: options.txid ?? commit.txid,
    index: options.vout ?? 0,
    witnessUtxo: { script: commit.commitScript, amount: BigInt(commit.commitValue) },
    tapLeafScript: [[controlBlock, new Uint8Array([...commit.leaf, 0xc0])]],
  });
  for (const output of options.leading ?? []) tx.addOutput(output);
  tx.addOutput({
    script: options.marker === false ? hexToBytes('6a0474657374') : MARKER_SCRIPT,
    amount: 0n,
  });
  for (const output of options.trailing ?? []) tx.addOutput(output);
  tx.sign(EPHEMERAL_KEY);
  const signature = tx.getInput(0).tapScriptSig![0]![1];
  tx.updateInput(0, {
    finalScriptWitness: [signature, options.publish ?? commit.leaf, TaprootControlBlock.encode(controlBlock)],
  }, true);
  return tx.hex;
}
