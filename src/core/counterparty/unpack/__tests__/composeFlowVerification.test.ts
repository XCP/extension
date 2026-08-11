/**
 * Every compose flow's real parameter set, run through the verifier.
 *
 * A wallet flow does not submit the full parameter list for its message type. The dispenser close
 * form sends `asset` and `status: 10` and nothing else; the composer fills give_quantity,
 * escrow_quantity and mainchainrate with 0, and a verifier that compares those against a request
 * that never carried them reports tampering and blocks the flow. That shipped: closing a dispenser
 * failed with three CRITICAL mismatches reading "expected undefined, got 0".
 *
 * `verifyTypes.test.ts` covers each message type once, with a complete parameter set — which is
 * exactly the case that cannot catch this. The table below is keyed on flows instead, and each row
 * is the parameter set its form actually submits, read off the form rather than assumed.
 *
 * A row failing here means a legitimate transaction cannot be composed. That is not a lesser
 * failure than missing tampering: a check that blocks correct work gets removed, and takes the
 * tampering coverage with it.
 */

import { describe, expect, it } from 'vitest';
import { bytesToHex, packAddressLegacy } from '../index';
import { COUNTERPARTY_PREFIX_HEX } from '../messageTypes';
import { verifyTransaction } from '../verify';

const PREFIX = COUNTERPARTY_PREFIX_HEX;
const u64 = (n: bigint) => n.toString(16).padStart(16, '0');
const u32 = (n: number) => n.toString(16).padStart(8, '0');

/** A flow, its submitted params, and the message the composer produces for them. */
interface Flow {
  /** The form this comes from, so a failure points at the code to read. */
  form: string;
  type: Parameters<typeof verifyTransaction>[1];
  message: string;
  params: Record<string, unknown>;
}

const ASSET_ID_XCP = u64(1n);

/**
 * An address other than the one signing, and the 21 bytes a dispenser message carries it as.
 *
 * Legacy packing, not the modern tagged form: core imports `pack_legacy`/`unpack_legacy` for this
 * message specifically (`dispenser.py`), so `00 || hash160` is what a close on another address
 * actually contains. `unpackAddress` reads both, so the modern form would pass here too — and
 * would be this file testing our own encoding rather than core's.
 */
const ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const PACKED_ADDRESS = bytesToHex(packAddressLegacy(ADDRESS));

const FLOWS: Flow[] = [
  {
    // Submits asset, give_remaining_normalized, status=10. The composer zeroes the three
    // quantities, which the request never named.
    //
    // Dispensers now pack, so production compares bytes (`packDispenser`) and reaches this path
    // only if that ever returns null again. The rows stay as the fallback's coverage; the
    // authority on what core composes for a dispenser is `pack/__tests__/dispenserGating.test.ts`.
    form: 'dispenser/close/form.tsx',
    type: 'dispenser',
    message: PREFIX + '0c' + ASSET_ID_XCP + u64(0n) + u64(0n) + u64(0n) + '0a',
    params: { asset: 'XCP', status: 10 },
  },
  {
    // Closing a dispenser that sits on the signing address. The form used to submit
    // open_address here regardless, and core packs no action address when it matches
    // the source, so this row read `open_address: undefined` while the form sent a
    // string — the assumption the header warns against, and it hid a real failure:
    // every close by hash was blocked as an open-address mismatch.
    form: 'dispenser/close-by-hash/form.tsx',
    type: 'dispenser',
    message: PREFIX + '0c' + ASSET_ID_XCP + u64(0n) + u64(0n) + u64(0n) + '0a',
    params: { asset: 'XCP', status: 10 },
  },
  {
    // The same form closing a dispenser held on another address: open_address is
    // submitted, and the composed close carries the packed action address.
    form: 'dispenser/close-by-hash/form.tsx',
    type: 'dispenser',
    message:
      PREFIX + '0c' + ASSET_ID_XCP + u64(0n) + u64(0n) + u64(0n) + '0a' + PACKED_ADDRESS,
    params: { asset: 'XCP', status: 10, open_address: ADDRESS },
  },
  {
    // The open flow, for contrast: it does supply all three.
    form: 'dispenser/form.tsx',
    type: 'dispenser',
    message: PREFIX + '0c' + ASSET_ID_XCP + u64(100n) + u64(1000n) + u64(1000000n) + '00',
    params: {
      asset: 'XCP',
      give_quantity: 100,
      escrow_quantity: 1000,
      mainchainrate: 1000000,
      status: 0,
    },
  },
  {
    // Submits asset, divisible, quantity=0, lock=true. No description: a reissuance carries the
    // asset's existing one forward, which the request cannot predict.
    form: 'issuance/lock-supply/form.tsx',
    type: 'issuance',
    message: PREFIX + '14' + ASSET_ID_XCP + u64(0n) + '01' + '01' + '00' + '00',
    params: { asset: 'XCP', quantity: 0, divisible: true, lock: true },
  },
  {
    form: 'issuance/reset-supply/form.tsx',
    type: 'issuance',
    message: PREFIX + '14' + ASSET_ID_XCP + u64(0n) + '01' + '00' + '01' + '00',
    params: { asset: 'XCP', quantity: 0, divisible: true, reset: true },
  },
  {
    form: 'issuance/transfer-ownership/form.tsx',
    type: 'issuance',
    message: PREFIX + '14' + ASSET_ID_XCP + u64(0n) + '01' + '00' + '00' + '00',
    params: { asset: 'XCP', quantity: 0, divisible: true },
  },
  {
    // Submits offer_hash alone.
    form: 'order/cancel/form.tsx',
    type: 'cancel',
    message: PREFIX + '46' + 'aa'.repeat(32),
    params: { offer_hash: 'aa'.repeat(32) },
  },
  {
    // Submits text; value and fee_fraction are fixed at 0 by the form.
    form: 'broadcast/form.tsx',
    type: 'broadcast',
    message:
      PREFIX +
      '1e' +
      u32(Math.floor(Date.now() / 1000)) +
      u64(0n) +
      u32(0) +
      '05' +
      Buffer.from('hello').toString('hex'),
    params: { text: 'hello', value: 0, fee_fraction: 0 },
  },
];

describe('every compose flow verifies against its own parameter set', () => {
  for (const flow of FLOWS) {
    it(`accepts ${flow.form}`, () => {
      const result = verifyTransaction(flow.message, flow.type, flow.params);

      // The message is what the composer returns for these params, so any mismatch is the verifier
      // demanding a field the flow does not send.
      expect(result.errors, `${flow.form} would be blocked`).toHaveLength(0);
      expect(result.valid).toBe(true);
    });
  }
});
