/**
 * Optional-field guards in verification.
 *
 * A request that omits a field is asking for that field's default — not asking for it to go
 * unchecked. The verifiers used to skip the comparison entirely when a param was absent, so a
 * response could inject an open_address, an oracle, a fee or a status that nothing compared and
 * still be reported as verified.
 *
 * Each case below pins both directions: an injected value is reported, and omitting the field on an
 * honest transaction raises no false alarm. The second half matters as much as the first — a
 * verifier that cries wolf on ordinary transactions stops being read.
 */

import { describe, expect, it } from 'vitest';
import { packAddress } from '../address';
import { hexToBytes } from '../binary';
import { COUNTERPARTY_PREFIX_HEX } from '../messageTypes';
import { verifyTransaction } from '../verify';

/** A third-party address a compromised response might inject. */
const ATTACKER = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const CNTRPRTY = Array.from(hexToBytes(COUNTERPARTY_PREFIX_HEX));

function uint64BE(value: bigint): number[] {
  const bytes: number[] = [];
  for (let i = 7; i >= 0; i -= 1) bytes.push(Number((value >> BigInt(8 * i)) & 0xffn));
  return bytes;
}

/**
 * A dispenser message: type id 12, the fixed ">QQQQB" struct, then any optional packed addresses,
 * exactly as counterparty-core lays it out.
 */
function dispenserMessage(
  options: { status?: number; openAddress?: string; oracleAddress?: string } = {}
): Uint8Array {
  return new Uint8Array([
    ...CNTRPRTY,
    12,
    ...uint64BE(1n),      // asset id 1 = XCP
    ...uint64BE(1000n),   // give_quantity
    ...uint64BE(10000n),  // escrow_quantity
    ...uint64BE(500n),    // mainchainrate
    options.status ?? 0,
    ...(options.openAddress ? packAddress(options.openAddress) : []),
    ...(options.oracleAddress ? packAddress(options.oracleAddress) : []),
  ]);
}

/** What the dispenser form submits: no status, no open address, no oracle. */
const OPEN_DISPENSER_REQUEST = {
  asset: 'XCP',
  give_quantity: 1000,
  escrow_quantity: 10000,
  mainchainrate: 500,
};

describe('dispenser fields the request leaves out', () => {
  it('accepts an ordinary dispenser whose request omits status, open and oracle addresses', () => {
    // The compose layer defaults status to 0 and sends no addresses, so this is the shape of every
    // dispenser the wallet opens. It must verify clean.
    const result = verifyTransaction(dispenserMessage(), 'dispenser', OPEN_DISPENSER_REQUEST);

    expect(result.valid).toBe(true);
    expect(result.dangerousMismatches).toEqual([]);
  });

  it('flags an open_address the request never asked for', () => {
    // The escrow would fund a dispenser on someone else's address, and the BTC paid by dispensers
    // would go to them. Previously skipped, because the request had no open_address to compare.
    const result = verifyTransaction(
      dispenserMessage({ status: 1, openAddress: ATTACKER }),
      'dispenser',
      OPEN_DISPENSER_REQUEST
    );

    expect(result.valid).toBe(false);
    expect(result.dangerousMismatches.some((m) => m.field === 'open_address')).toBe(true);
  });

  it('flags an oracle_address the request never asked for', () => {
    // An injected oracle lets a third party set the dispenser's price.
    const result = verifyTransaction(
      dispenserMessage({ oracleAddress: ATTACKER }),
      'dispenser',
      OPEN_DISPENSER_REQUEST
    );

    expect(result.valid).toBe(false);
    expect(result.dangerousMismatches.some((m) => m.field === 'oracle_address')).toBe(true);
  });

  it('flags a status the request never asked for', () => {
    const result = verifyTransaction(
      dispenserMessage({ status: 10 }),
      'dispenser',
      OPEN_DISPENSER_REQUEST
    );

    expect(result.valid).toBe(false);
    expect(result.dangerousMismatches.some((m) => m.field === 'status')).toBe(true);
  });

  it('accepts a close request, which submits its status explicitly', () => {
    // The close flows post status via a hidden field, so an explicitly requested status still
    // compares normally rather than against the omitted-field default.
    const result = verifyTransaction(dispenserMessage({ status: 10 }), 'dispenser', {
      ...OPEN_DISPENSER_REQUEST,
      give_quantity: 0,
      escrow_quantity: 0,
      mainchainrate: 0,
      status: '10',
    });

    expect(result.dangerousMismatches.some((m) => m.field === 'status')).toBe(false);
  });
});
