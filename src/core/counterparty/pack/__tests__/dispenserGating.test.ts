/**
 * Dispenser packing, against bytes counterparty-core actually composed.
 *
 * Which trailing addresses a dispenser message carries depends on its status, and core decides
 * that in `dispenser.py`:
 *
 *     is_empty_address = status == STATUS_OPEN_EMPTY_ADDRESS and open_address
 *     if is_empty_address or (... status == STATUS_CLOSED and open_address and open_address != source):
 *         data += address_pack(open_address)
 *     if oracle_address is not None and is_oracle_fee_status and ...:
 *         data += address_pack(oracle_address)
 *
 * The packer appended whichever address the request carried, regardless of status. Byte equality
 * is fail-closed, so the extra 21 bytes did not read as a curiosity — they blocked the compose.
 * That is the shape that shipped: closing a dispenser named its own address, core packed nothing,
 * and the wallet refused to sign a transaction that was perfectly correct.
 *
 * The expectations below are not derived from our own packer. Each was returned by
 * api.counterparty.io for the same parameters via `return_only_data=true` (the mechanism
 * `coreOracle.test.ts` uses live); pinning them here keeps the check offline and deterministic.
 * `coreOracle.test.ts` re-asks a live node on the nightly run, so drift is still caught.
 */

import { describe, expect, it } from 'vitest';
import { bytesToHex } from '../../unpack/binary';
import { packComposeMessage } from '../messages';

const SOURCE = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const OTHER = '1CounterpartyXXXXXXXXXXXXXXXUWLpVr';

/** `CNTRPRTY` + type 0x0c + asset id 1 (XCP) + give/escrow/rate + status byte. */
const CLOSE_XCP = '434e5452505254590c'
  + '0000000000000001' + '0000000000000000' + '0000000000000000' + '0000000000000000' + '0a';
const OPEN_XCP = '434e5452505254590c'
  + '0000000000000001' + '0000000000000001' + '000000000000000a' + '0000000000000064' + '00';
/** Legacy 21-byte packing of OTHER: base58 version 0x00 + hash160. */
const OTHER_PACKED = '00818895f3dc2c178629d3d2d8fa3ec4a3f8179821';

const pack = (params: Record<string, unknown>) => {
  const packed = packComposeMessage('dispenser', { sourceAddress: SOURCE, ...params });
  return packed ? bytesToHex(packed.bytes) : null;
};

const close = { asset: 'XCP', status: '10', give_quantity: '0', escrow_quantity: '0', mainchainrate: '0' };
const open = { asset: 'XCP', status: '0', give_quantity: '1', escrow_quantity: '10', mainchainrate: '100' };

describe('dispenser packing matches core byte for byte', () => {
  it('packs a plain close', () => {
    expect(pack(close)).toBe(CLOSE_XCP);
  });

  // The reported bug: core drops an open_address equal to the source, so the extra bytes made
  // byte equality reject the close.
  it('omits open_address when closing a dispenser on the signing address', () => {
    expect(pack({ ...close, open_address: SOURCE })).toBe(CLOSE_XCP);
  });

  it('carries open_address when closing a dispenser on another address', () => {
    expect(pack({ ...close, open_address: OTHER })).toBe(CLOSE_XCP + OTHER_PACKED);
  });

  it('omits oracle_address on a close, which core never packs there', () => {
    expect(pack({ ...close, oracle_address: OTHER })).toBe(CLOSE_XCP);
  });

  it('packs a plain open', () => {
    expect(pack(open)).toBe(OPEN_XCP);
  });

  // Core's open_address branch requires STATUS_OPEN_EMPTY_ADDRESS; a plain open drops it.
  it('omits open_address on a plain open', () => {
    expect(pack({ ...open, open_address: OTHER })).toBe(OPEN_XCP);
  });

  it('carries open_address when opening on an empty address', () => {
    const openEmpty = OPEN_XCP.slice(0, -2) + '01';
    expect(pack({ ...open, status: '1', open_address: OTHER })).toBe(openEmpty + OTHER_PACKED);
  });

  // Both flows omit fields that `composeDispenser` fills with 0 before calling the API. While the
  // packer required them it returned null for every real request, and each dispenser quietly took
  // the weaker field-comparison path instead of byte equality.
  it('packs the fields each flow actually submits', () => {
    expect(pack({ asset: 'XCP', status: '10' }), 'close: no quantities submitted').toBe(CLOSE_XCP);
    expect(
      pack({ asset: 'XCP', give_quantity: '1', escrow_quantity: '10', mainchainrate: '100' }),
      'open: no status submitted'
    ).toBe(OPEN_XCP);
  });
});
