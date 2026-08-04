/**
 * Deny-by-default output accounting.
 *
 * The point of these tests is the *default*: an output nobody asked for is rejected, without anyone
 * having enumerated the field or message type that produced it.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { AddressFormat, encodeAddress } from '@/utils/blockchain/bitcoin/address';
import { checkOutputPolicy } from '../outputPolicy';

const OWNER_KEY = hexToBytes('11'.repeat(32));
const OWNER_PUBKEY = getPublicKey(OWNER_KEY, true);
const OWNER = encodeAddress(OWNER_PUBKEY, AddressFormat.P2WPKH);

const RECIPIENT = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const STRANGER = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

/** Build a raw transaction with the given outputs, plus an optional OP_RETURN data output. */
function rawTxWith(
  outputs: Array<{ address: string; value: bigint }>,
  options: { opReturn?: boolean } = {}
): string {
  const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
  tx.addInput({
    txid: hexToBytes('33'.repeat(32)),
    index: 0,
    witnessUtxo: { script: p2wpkh(OWNER_PUBKEY).script, amount: 200_000n },
  });
  if (options.opReturn) {
    tx.addOutput({ script: new Uint8Array([0x6a, 0x04, 0xde, 0xad, 0xbe, 0xef]), amount: 0n });
  }
  for (const output of outputs) tx.addOutputAddress(output.address, output.value);
  return bytesToHex(tx.unsignedTx);
}

describe('checkOutputPolicy', () => {
  it('accepts a message-carrying transaction whose only value output is change', () => {
    // The shape of most Counterparty composes: the recipient lives inside the payload, so the only
    // outputs are the data output and change.
    const result = checkOutputPolicy({
      rawTransaction: rawTxWith([{ address: OWNER, value: 190_000n }], { opReturn: true }),
      ownAddresses: [OWNER],
      intendedDestinations: [],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects an output to a stranger that the request never asked for', () => {
    // This is the whole point: nobody enumerated a field for this output, and it is still caught.
    const result = checkOutputPolicy({
      rawTransaction: rawTxWith(
        [{ address: STRANGER, value: 50_000n }, { address: OWNER, value: 140_000n }],
        { opReturn: true }
      ),
      ownAddresses: [OWNER],
      intendedDestinations: [],
    });

    expect(result.ok).toBe(false);
    expect(result.unexplained).toHaveLength(1);
    expect(result.unexplained[0]!.address).toBe(STRANGER);
    expect(result.error).toMatch(/does not account for/i);
  });

  it('accepts an output to an address the user asked to pay', () => {
    const result = checkOutputPolicy({
      rawTransaction: rawTxWith([
        { address: RECIPIENT, value: 50_000n },
        { address: OWNER, value: 140_000n },
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: [{ address: RECIPIENT }],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects a pinned destination paid the wrong amount', () => {
    const result = checkOutputPolicy({
      rawTransaction: rawTxWith([
        { address: RECIPIENT, value: 10_000n },
        { address: OWNER, value: 180_000n },
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: [{ address: RECIPIENT, value: 50_000 }],
    });

    expect(result.ok).toBe(false);
    expect(result.unexplained[0]!.address).toBe(RECIPIENT);
  });

  it('consumes each intended destination once, so a duplicated payout is caught', () => {
    // Paying the requested recipient twice is not "two matches" — the second output is unexplained.
    const result = checkOutputPolicy({
      rawTransaction: rawTxWith([
        { address: RECIPIENT, value: 50_000n },
        { address: RECIPIENT, value: 50_000n },
        { address: OWNER, value: 90_000n },
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: [{ address: RECIPIENT }],
    });

    expect(result.ok).toBe(false);
    expect(result.unexplained).toHaveLength(1);
  });

  /**
   * Assemble a raw transaction by hand. @scure refuses to *build* bare-multisig outputs (it parses
   * them fine), and Counterparty's multisig data encoding is exactly that shape.
   */
  function rawTxWithScripts(outputs: Array<{ scriptHex: string; value: bigint }>): string {
    const littleEndian = (value: bigint, byteCount: number) => {
      let hex = '';
      for (let i = 0; i < byteCount; i += 1) {
        hex += Number((value >> BigInt(8 * i)) & 0xffn).toString(16).padStart(2, '0');
      }
      return hex;
    };
    const parts = [
      '02000000', '01', '33'.repeat(32), '00000000', '00', 'ffffffff',
      outputs.length.toString(16).padStart(2, '0'),
    ];
    for (const output of outputs) {
      parts.push(
        littleEndian(output.value, 8),
        (output.scriptHex.length / 2).toString(16).padStart(2, '0'),
        output.scriptHex
      );
    }
    parts.push('00000000');
    return parts.join('');
  }

  it('treats a bare-multisig data output as data, not as a payment', () => {
    // Counterparty's multisig encoding carries the message in 1-of-3 outputs; those are data.
    // The data-carrying "pubkeys" must still be valid curve points — core nudges them onto the
    // curve with a nonce byte — because script parsers reject a multisig script otherwise.
    const dataPubkeyA = getPublicKey(hexToBytes('22'.repeat(32)), true);
    const dataPubkeyB = getPublicKey(hexToBytes('44'.repeat(32)), true);
    const dataScript = new Uint8Array([
      0x51,
      0x21, ...dataPubkeyA,
      0x21, ...dataPubkeyB,
      0x21, ...OWNER_PUBKEY,
      0x53,
      0xae,
    ]);
    const result = checkOutputPolicy({
      rawTransaction: rawTxWithScripts([
        { scriptHex: bytesToHex(dataScript), value: 546n },
        { scriptHex: bytesToHex(p2wpkh(OWNER_PUBKEY).script), value: 190_000n },
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: [],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects an output whose script cannot be attributed to any address', () => {
    // An unattributable script might pay anyone, so it cannot be explained — unknown is not safe.
    const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
    tx.addInput({
      txid: hexToBytes('33'.repeat(32)),
      index: 0,
      witnessUtxo: { script: p2wpkh(OWNER_PUBKEY).script, amount: 200_000n },
    });
    tx.addOutput({ script: new Uint8Array([0x52, 0x53, 0xae]), amount: 100_000n });
    tx.addOutputAddress(OWNER, 90_000n);

    const result = checkOutputPolicy({
      rawTransaction: bytesToHex(tx.unsignedTx),
      ownAddresses: [OWNER],
      intendedDestinations: [],
    });

    expect(result.ok).toBe(false);
    expect(result.unexplained[0]!.address).toBeNull();
  });

  it('accepts change to any of the signer\'s own addresses', () => {
    // Paired legacy/SegWit addresses are both the signer's.
    const legacyOwn = encodeAddress(OWNER_PUBKEY, AddressFormat.P2PKH);
    const result = checkOutputPolicy({
      rawTransaction: rawTxWith([{ address: legacyOwn, value: 190_000n }], { opReturn: true }),
      ownAddresses: [OWNER, legacyOwn],
      intendedDestinations: [],
    });

    expect(result.ok).toBe(true);
  });

  it('does not block an unparseable transaction (signing will fail on its own)', () => {
    const result = checkOutputPolicy({
      rawTransaction: 'not-a-transaction',
      ownAddresses: [OWNER],
      intendedDestinations: [],
    });

    expect(result.ok).toBe(true);
  });
});
