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
import { AddressFormat, encodeAddress } from '@/core/bitcoin/address';
import {
  checkOutputPolicy,
  pinnedDestinations,
  pinnedQuantity,
  withPinnedDestinations,
} from '../outputPolicy';

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

  describe('recovery key in data outputs', () => {
    const dataPubkeyA = getPublicKey(hexToBytes('22'.repeat(32)), true);
    const dataPubkeyB = getPublicKey(hexToBytes('44'.repeat(32)), true);
    const strangerPubkey = getPublicKey(hexToBytes('55'.repeat(32)), true);

    const dataScriptWithRecoveryKey = (recovery: Uint8Array) => new Uint8Array([
      0x51, 0x21, ...dataPubkeyA, 0x21, ...dataPubkeyB, 0x21, ...recovery, 0x53, 0xae,
    ]);

    const policyInput = (recovery: Uint8Array, expected?: string) => ({
      rawTransaction: rawTxWithScripts([
        { scriptHex: bytesToHex(dataScriptWithRecoveryKey(recovery)), value: 546n },
        { scriptHex: bytesToHex(p2wpkh(OWNER_PUBKEY).script), value: 190_000n },
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: [],
      expectedRecoveryPubkey: expected,
    });

    it('accepts data outputs embedding the key the request sent', () => {
      const result = checkOutputPolicy(policyInput(OWNER_PUBKEY, bytesToHex(OWNER_PUBKEY)));
      expect(result.ok).toBe(true);
    });

    it('is not case-sensitive about the expected key', () => {
      const result = checkOutputPolicy(
        policyInput(OWNER_PUBKEY, bytesToHex(OWNER_PUBKEY).toUpperCase())
      );
      expect(result.ok).toBe(true);
    });

    // The compose request named the recovery key and core honors that parameter verbatim, so a
    // different key in the response is a substitution: the dust would be spendable by whoever
    // holds it. This is the check the request-side multisig_pubkey parameter exists to enable.
    it('rejects data outputs embedding a key the request did not send', () => {
      const result = checkOutputPolicy(policyInput(strangerPubkey, bytesToHex(OWNER_PUBKEY)));

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/recovery key/);
    });

    // No expectation, no check: an absent key means the wallet sent none, and core then chose one
    // from the address's own history. Manufacturing a failure there would block every compose
    // from a wallet that cannot supply keys (test-only wallets), which all worked before.
    it('checks nothing when the request sent no key', () => {
      const result = checkOutputPolicy(policyInput(strangerPubkey, undefined));
      expect(result.ok).toBe(true);
    });
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

/** Build a transaction with outputs in an exact order; `'data'` places the OP_RETURN. */
function orderedTx(items: Array<'data' | { address: string; value: bigint }>): string {
  const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
  tx.addInput({
    txid: hexToBytes('33'.repeat(32)),
    index: 0,
    witnessUtxo: { script: p2wpkh(OWNER_PUBKEY).script, amount: 1_000_000n },
  });
  for (const item of items) {
    if (item === 'data') tx.addOutput({ script: new Uint8Array([0x6a, 0x04, 0xde, 0xad, 0xbe, 0xef]), amount: 0n });
    else tx.addOutputAddress(item.address, item.value);
  }
  return bytesToHex(tx.unsignedTx);
}

describe('checkOutputPolicy, where the destination is read from output order', () => {
  // Some messages name no destination: the node takes every non-data output ahead of the first
  // data output and joins them — `"-".join(destinations)` in parser/gettxinfo.py — and an issuance
  // then assigns `issuer = tx["destination"]`. Position is therefore part of the meaning, and
  // nothing else checks it: the message carries no destination so byte equality passes, and each
  // output is individually explainable so accounting passes.

  it('accepts the ordering every honest compose produces', () => {
    // core assembles outputs as destinations, then data, then change (api/composer.py).
    const result = checkOutputPolicy({
      rawTransaction: orderedTx([
        { address: RECIPIENT, value: 546n },
        'data',
        { address: OWNER, value: 400_000n },
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: [{ address: RECIPIENT }],
      positionalDestination: RECIPIENT,
    });

    expect(result.ok).toBe(true);
  });

  it('rejects change placed ahead of the data output', () => {
    // Two outputs in front make the recipient the pseudo-address "owner-recipient", which nobody
    // holds a key to: an ownership transfer composed this way destroys the asset.
    const result = checkOutputPolicy({
      rawTransaction: orderedTx([
        { address: OWNER, value: 400_000n },
        { address: RECIPIENT, value: 546n },
        'data',
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: [{ address: RECIPIENT }],
      positionalDestination: RECIPIENT,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('join them into a single recipient');
  });

  it('rejects a recipient that is not paid ahead of the data output at all', () => {
    // Read as no destination: the transfer silently does not happen while the wallet shows one.
    const result = checkOutputPolicy({
      rawTransaction: orderedTx([
        'data',
        { address: RECIPIENT, value: 546n },
        { address: OWNER, value: 400_000n },
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: [{ address: RECIPIENT }],
      positionalDestination: RECIPIENT,
    });

    expect(result.ok).toBe(false);
  });

  it('rejects a different address standing in the recipient\'s position', () => {
    const result = checkOutputPolicy({
      rawTransaction: orderedTx([
        { address: OWNER, value: 546n },
        'data',
        { address: RECIPIENT, value: 400_000n },
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: [{ address: RECIPIENT }],
      positionalDestination: RECIPIENT,
    });

    expect(result.ok).toBe(false);
  });

  it('does not apply to a transaction with no data output', () => {
    // A taproot-encoded issuance commits its message to a P2TR output rather than an OP_RETURN, and
    // `composeIssuance` accepts `inscription` and `transfer_destination` together. With no data
    // output there is no boundary to be positioned against, and treating every output as preceding
    // would reject a legitimate compose.
    const result = checkOutputPolicy({
      rawTransaction: orderedTx([
        { address: RECIPIENT, value: 546n },
        { address: OWNER, value: 400_000n },
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: [{ address: RECIPIENT }],
      positionalDestination: RECIPIENT,
    });

    expect(result.ok).toBe(true);
  });

  it('leaves transactions with no positional destination alone', () => {
    // An enhanced send carries its recipient in the payload, so output order says nothing about it
    // and change ahead of the data output is merely unusual, not a substitution.
    const result = checkOutputPolicy({
      rawTransaction: orderedTx([{ address: OWNER, value: 400_000n }, 'data']),
      ownAddresses: [OWNER],
      intendedDestinations: [],
    });

    expect(result.ok).toBe(true);
  });
});

describe('pinnedDestinations', () => {
  // Naming an address is not the same as agreeing to an amount.

  it('pins the dispenser output to the requested quantity', () => {
    // A dispense pays the dispenser in BTC and gets back whatever that buys; the message itself is
    // a bare marker byte, so byte equality says nothing about the amount.
    expect(pinnedDestinations('dispense', { dispenser: RECIPIENT, quantity: '50000' }))
      .toEqual([{ address: RECIPIENT, value: 50_000 }]);
  });

  it('pins a BTC send, which carries no message to check at all', () => {
    expect(pinnedDestinations('send', { asset: 'BTC', destination: RECIPIENT, quantity: '50000' }))
      .toEqual([{ address: RECIPIENT, value: 50_000 }]);
  });

  it('pins nothing for a type whose recipient is not in the payload and not stated', () => {
    expect(pinnedDestinations('order', { give_quantity: '50000' })).toEqual([]);
    expect(pinnedDestinations('issuance', { asset: 'XCP', quantity: '1' })).toEqual([]);
  });

  it('leaves the amount unpinned rather than pinning an unreadable one', () => {
    // Pinning NaN would reject every honest transaction of that type.
    expect(pinnedDestinations('dispense', { dispenser: RECIPIENT, quantity: 'not a number' }))
      .toEqual([]);
    expect(pinnedQuantity(2 ** 60)).toBe(undefined);
    expect(pinnedQuantity(0)).toBe(undefined);
  });

  it('rejects a dispense paying the dispenser more than was asked for', () => {
    const result = checkOutputPolicy({
      rawTransaction: rawTxWith([
        { address: RECIPIENT, value: 500_000n },
        { address: OWNER, value: 400_000n },
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: pinnedDestinations('dispense', {
        dispenser: RECIPIENT,
        quantity: '50000',
      }),
    });

    expect(result.ok).toBe(false);
  });

  it('accepts the dispense the request actually asked for', () => {
    const result = checkOutputPolicy({
      rawTransaction: rawTxWith([
        { address: RECIPIENT, value: 50_000n },
        { address: OWNER, value: 900_000n },
      ]),
      ownAddresses: [OWNER],
      intendedDestinations: pinnedDestinations('dispense', {
        dispenser: RECIPIENT,
        quantity: '50000',
      }),
    });

    expect(result.ok).toBe(true);
  });
});

describe('pinnedDestinations, where the recipient travels in the payload', () => {
  // core returns no destination outputs for these types — mpma.compose returns `(source, [], data)`
  // — so the only BTC that belongs there is what the user attached through more_outputs.

  it('pins an enhanced send destination to zero when no BTC was attached', () => {
    expect(pinnedDestinations('send', { asset: 'XCP', destination: RECIPIENT, quantity: '50000' }))
      .toEqual([{ address: RECIPIENT, value: 0 }]);
  });

  it('pins it to exactly the BTC the request attached', () => {
    expect(pinnedDestinations('send', {
      asset: 'XCP',
      destination: RECIPIENT,
      quantity: '50000',
      more_outputs: `7000:${RECIPIENT}`,
    })).toEqual([{ address: RECIPIENT, value: 7000 }]);
  });

  it('pins a sweep destination the same way', () => {
    expect(pinnedDestinations('sweep', { destination: RECIPIENT }))
      .toEqual([{ address: RECIPIENT, value: 0 }]);
    expect(pinnedDestinations('sweep', {
      destination: RECIPIENT,
      more_outputs: `7000:${RECIPIENT}`,
    })).toEqual([{ address: RECIPIENT, value: 7000 }]);
  });

  it('pins every MPMA recipient to zero', () => {
    // The form cannot attach BTC to a multi-destination send, and core pays these in the payload.
    expect(pinnedDestinations('send', {
      asset: 'XCP',
      destinations: `${RECIPIENT},${STRANGER}`,
    })).toEqual([
      { address: RECIPIENT, value: 0 },
      { address: STRANGER, value: 0 },
    ]);
  });

  it('does not pin an address the signer also owns', () => {
    // Change to yourself is indistinguishable from a payment to yourself, so a pin would reject a
    // send to your own address.
    expect(pinnedDestinations('send', { asset: 'XCP', destination: OWNER }, [OWNER])).toEqual([]);
  });

  it('rejects BTC routed to the recipient of an asset send', () => {
    const pins = pinnedDestinations('send', {
      asset: 'XCP',
      destination: RECIPIENT,
      quantity: '50000',
    }, [OWNER]);

    const result = checkOutputPolicy({
      rawTransaction: rawTxWith([
        { address: RECIPIENT, value: 40_000n },
        { address: OWNER, value: 150_000n },
      ], { opReturn: true }),
      ownAddresses: [OWNER],
      intendedDestinations: withPinnedDestinations([{ address: RECIPIENT }], pins),
    });

    expect(result.ok).toBe(false);
  });

  it('accepts the BTC the request actually attached', () => {
    const params = {
      asset: 'XCP',
      destination: RECIPIENT,
      quantity: '50000',
      more_outputs: `40000:${RECIPIENT}`,
    };

    const result = checkOutputPolicy({
      rawTransaction: rawTxWith([
        { address: RECIPIENT, value: 40_000n },
        { address: OWNER, value: 150_000n },
      ], { opReturn: true }),
      ownAddresses: [OWNER],
      // Both entries the caller derives for this address — the destination field and the one parsed
      // out of more_outputs — are replaced by the pin.
      intendedDestinations: withPinnedDestinations(
        [{ address: RECIPIENT }, { address: RECIPIENT }],
        pinnedDestinations('send', params, [OWNER])
      ),
    });

    expect(result.ok).toBe(true);
  });

  it('leaves no unpinned duplicate for a second output to slip through', () => {
    // The hole this closes: `more_outputs` names its recipient twice, so without replacement one
    // entry stays unpinned and explains any amount.
    const merged = withPinnedDestinations(
      [{ address: RECIPIENT }, { address: RECIPIENT }],
      pinnedDestinations('send', {
        asset: 'XCP',
        destination: RECIPIENT,
        more_outputs: `40000:${RECIPIENT}`,
      }, [OWNER])
    );

    expect(merged).toEqual([{ address: RECIPIENT, value: 40_000 }]);
  });
});
