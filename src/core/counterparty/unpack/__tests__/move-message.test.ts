/**
 * Move messages (type 100).
 *
 * A move carries `source|destination|asset|quantity` as UTF-8, which is a different field list from
 * attach's `asset|quantity|vout`. Type 100 used to be routed through the attach unpacker, which read
 * the destination address as the quantity — `BigInt` threw, the decode failed, and since an
 * undecodable message counts as unverifiable, every move was blocked before reaching the review
 * screen.
 */

import { describe, expect, it } from 'vitest';
import { bytesToHex } from '../binary';
import { unpackCounterpartyMessage } from '../index';
import { COUNTERPARTY_PREFIX_HEX } from '../messageTypes';
import { verifyTransaction } from '../verify';

const SOURCE_UTXO = 'aa'.repeat(32) + ':0';
const DESTINATION = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

/** A move message as core builds it: type id 100, then the pipe-joined fields as UTF-8. */
function moveMessage(destination: string, asset = 'XCP', quantity = '1000'): string {
  const content = new TextEncoder().encode(`${SOURCE_UTXO}|${destination}|${asset}|${quantity}`);
  return COUNTERPARTY_PREFIX_HEX + '64' + bytesToHex(content);
}

describe('move messages decode', () => {
  it('reads all four fields rather than failing on the address', () => {
    const result = unpackCounterpartyMessage(moveMessage(DESTINATION));

    expect(result.success).toBe(true);
    expect(result.messageType).toBe('utxo');
    const data = result.data as { source: string; destination: string; asset: string; quantity: bigint };
    expect(data.source).toBe(SOURCE_UTXO);
    expect(data.destination).toBe(DESTINATION);
    expect(data.asset).toBe('XCP');
    expect(data.quantity).toBe(1000n);
  });

  it('rejects a payload whose quantity is not a number', () => {
    const content = new TextEncoder().encode(`${SOURCE_UTXO}|${DESTINATION}|XCP|not-a-number`);
    const result = unpackCounterpartyMessage(COUNTERPARTY_PREFIX_HEX + '64' + bytesToHex(content));

    expect(result.success).toBe(false);
  });
});

describe('move verification', () => {
  it('accepts a move to the requested destination', () => {
    const result = verifyTransaction(moveMessage(DESTINATION), 'move', {
      destination: DESTINATION,
    });

    expect(result.valid).toBe(true);
    expect(result.criticalMismatches).toEqual([]);
  });

  it('flags a move redirected to another destination', () => {
    // The destination decides which UTXO owns the assets afterwards, so a substitution is theft.
    const result = verifyTransaction(moveMessage('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'), 'move', {
      destination: DESTINATION,
    });

    expect(result.valid).toBe(false);
    expect(result.criticalMismatches.some((m) => m.field === 'destination')).toBe(true);
  });
});
