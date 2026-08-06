/**
 * Executable record of the gaps found by comparing this wallet against counterparty-core's own
 * CLI client (core PR #3127) and, more importantly, against core's parser.
 *
 * Each test states what counterparty-core actually does, cited to the parser source. They are
 * written with `it.fails` because the wallet does *not* do these things today: the suite stays
 * green while the gap is open, and the moment someone closes one the test starts failing and has
 * to be flipped to a plain `it`. That is the intended tripwire — these are not permanent
 * `it.fails` tests, they are a to-do list that runs.
 *
 * Delete this file as the gaps close, moving each case into the suite that owns the fixed code.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { AddressFormat, encodeAddress } from '@/core/bitcoin/address';
import { checkOutputPolicy } from '../outputPolicy';
import { arc4 } from '../unpack/binary';
import { extractCounterpartyPayload } from '../unpack/opReturn';

const OWNER_KEY = hexToBytes('11'.repeat(32));
const OWNER_PUBKEY = getPublicKey(OWNER_KEY, true);
const OWNER = encodeAddress(OWNER_PUBKEY, AddressFormat.P2WPKH);

const DISPENSER = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const NEW_OWNER = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

/** First input txid, display order — the ARC4 key core uses. */
const INPUT_TXID = '33'.repeat(32);
const PREFIX = new TextEncoder().encode('CNTRPRTY');

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

/** An ARC4-obfuscated OP_RETURN data output carrying `payload` (the bytes after the prefix). */
function opReturnDataOutput(payload: Uint8Array): Uint8Array {
  const encrypted = arc4(hexToBytes(INPUT_TXID), concat(PREFIX, payload));
  return concat(new Uint8Array([0x6a, encrypted.length]), encrypted);
}

/**
 * A bare-multisig data output carrying `payload`, in the 1-of-3 shape core parses:
 * OP_1 <data pubkey> <data pubkey> <source pubkey> OP_3 OP_CHECKMULTISIG.
 * Cleartext per output is [length][CNTRPRTY][chunk][zero padding] across 62 data bytes.
 */
function multisigDataOutput(payload: Uint8Array): Uint8Array {
  const cleartext = new Uint8Array(62);
  cleartext[0] = PREFIX.length + payload.length;
  cleartext.set(PREFIX, 1);
  cleartext.set(payload, 1 + PREFIX.length);
  const encrypted = arc4(hexToBytes(INPUT_TXID), cleartext);

  const pubkey = (half: Uint8Array) => concat(new Uint8Array([0x02]), half, new Uint8Array([0x01]));
  return concat(
    new Uint8Array([0x51, 0x21]), pubkey(encrypted.slice(0, 31)),
    new Uint8Array([0x21]), pubkey(encrypted.slice(31, 62)),
    new Uint8Array([0x21]), new Uint8Array(33).fill(0x03),
    new Uint8Array([0x53, 0xae])
  );
}

function rawTxWith(outputs: Array<Uint8Array | { address: string; value: bigint }>): string {
  // disableScriptCheck: the data pubkeys are byte carriers, not curve points, and @scure would
  // otherwise reject the multisig script before it is ever written.
  const tx = new Transaction({
    allowUnknownOutputs: true,
    allowLegacyWitnessUtxo: true,
    disableScriptCheck: true,
  });
  tx.addInput({
    txid: hexToBytes(INPUT_TXID),
    index: 0,
    witnessUtxo: { script: p2wpkh(OWNER_PUBKEY).script, amount: 1_000_000n },
  });
  for (const output of outputs) {
    if (output instanceof Uint8Array) tx.addOutput({ script: output, amount: 0n });
    else tx.addOutputAddress(output.address, output.value);
  }
  return bytesToHex(tx.unsignedTx);
}

describe('gap: a message spread across more than one data output', () => {
  // counterparty-core appends the payload of *every* data output, in output order — the
  // `ParseOutput::Data` arm of the vout loop in counterparty-rs/src/indexer/bitcoin_client.rs does
  // `data.append(&mut new_data)`, over OP_RETURN and bare-multisig outputs alike. Reading only one
  // of them verifies a different message from the one the network executes.

  it.fails('reads a multisig chunk that precedes the OP_RETURN, as core does', () => {
    // The full substitution: core sees `attacker || benign` and takes the message *type* from the
    // attacker's chunk — here type 0x04, a sweep — while this wallet reads and displays only the
    // benign type-0x02 enhanced send that follows it.
    const attacker = new Uint8Array([0x04, 0xaa, 0xbb]);
    const benign = new Uint8Array([0x02, 0xcc, 0xdd]);

    const payload = extractCounterpartyPayload(
      rawTxWith([
        multisigDataOutput(attacker),
        opReturnDataOutput(benign),
        { address: OWNER, value: 900_000n },
      ])
    );

    expect(payload).toBe(bytesToHex(concat(PREFIX, attacker, benign)));
  });

  it.fails('reads a second Counterparty OP_RETURN appended after the first, as core does', () => {
    // Both decrypt to the prefix, so core takes both; neither is an "invalid OP_RETURN".
    const first = new Uint8Array([0x02, 0x11, 0x22]);
    const second = new Uint8Array([0x33, 0x44]);

    const payload = extractCounterpartyPayload(
      rawTxWith([
        opReturnDataOutput(first),
        opReturnDataOutput(second),
        { address: OWNER, value: 900_000n },
      ])
    );

    expect(payload).toBe(bytesToHex(concat(PREFIX, first, second)));
  });
});

describe('gap: BTC paid to an address the request named, in an amount it did not', () => {
  it.fails('rejects a dispense that pays the dispenser more than the requested quantity', () => {
    // A dispense pays BTC to the dispenser, and that amount *is* the transaction's meaning:
    // core's dispense.compose returns `[(destination, quantity)]`. The type-13 payload is a bare
    // marker byte, so byte-equality verification proves nothing about the amount.
    const result = checkOutputPolicy({
      rawTransaction: rawTxWith([
        { address: DISPENSER, value: 500_000n }, // the request asked for 50_000
        { address: OWNER, value: 400_000n },
      ]),
      ownAddresses: [OWNER],
      // What composer-context builds today: every address the request named, no amount pinned.
      intendedDestinations: [{ address: DISPENSER }],
    });

    expect(result.ok).toBe(false);
  });
});

describe('gap: destinations are positional, and the position is not checked', () => {
  it.fails('rejects an ownership transfer with change ahead of the data output', () => {
    // core credits the *join* of every non-data output preceding the data output:
    // `destinations = "-".join(destinations)` (parser/gettxinfo.py) and then, for an issuance,
    // `issuer = tx["destination"]` (messages/issuance.py). Two outputs ahead of the OP_RETURN
    // therefore hand the asset to the pseudo-address "ownerchange-newowner", which nobody can
    // spend — the asset's ownership is destroyed rather than transferred.
    //
    // Nothing catches this today: the issuance message carries no destination, so byte equality
    // passes, and both outputs are individually explainable (one is change, one is named).
    const result = checkOutputPolicy({
      rawTransaction: rawTxWith([
        { address: OWNER, value: 400_000n }, // change, placed ahead of the data output
        { address: NEW_OWNER, value: 546n },
        opReturnDataOutput(new Uint8Array([20, 0x01, 0x02])),
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: [{ address: NEW_OWNER }],
    });

    expect(result.ok).toBe(false);
  });
});
