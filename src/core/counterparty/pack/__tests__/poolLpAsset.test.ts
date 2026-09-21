/**
 * Pool deposit packing, against bytes counterparty-core actually composed.
 *
 * The LP asset id is the one field of a pool deposit that the request does not determine
 * (`pooldeposit.py`):
 *
 *     if existing_pool is None and lp_asset is None:
 *         lp_asset = assetnames.generate_random_asset(f"{sorted_a}:{sorted_b}")
 *     ...
 *     lp_asset_id = generate_asset_id(lp_asset) if existing_pool is None and lp_asset else 0
 *
 * so it is 0 into an existing pool, the named asset's id when one is named, and a random draw for
 * the first deposit into a new pool that names none. The packer wrote 0 for that last case, and
 * byte equality is fail-closed — so the first deposit into any new pool was refused, which is the
 * ordinary path given the LP name is optional and only offered on a new pool.
 *
 * Expectations are core's own output for these params (`return_only_data=true`), pinned here so
 * the check stays offline; `coreOracle.test.ts` re-asks a live node nightly.
 */

import { describe, expect, it } from 'vitest';
import { bytesToHex } from '../../unpack/binary';
import { packComposeMessage } from '../messages';

/** `CNTRPRTY` + type 0x78 (120). */
const DEPOSIT = '434e5452505254597800000000000000010000001c61620c4b'
  + '000000000000006400000000000000c8' + '0000000000000000';
/** XCP/PEPECASH, quantities 100 and 200, min LP 0 — then the LP asset id. */
const EXISTING_POOL = `${DEPOSIT}0000000000000000`;

const deposit = (extra: Record<string, unknown>, observed?: Record<string, unknown>) => {
  const packed = packComposeMessage(
    'pooldeposit',
    { asset_a: 'XCP', asset_b: 'PEPECASH', quantity_a: 100, quantity_b: 200, ...extra },
    observed
  );
  return packed ? bytesToHex(packed.bytes) : null;
};

describe('pool deposit LP asset id matches core', () => {
  it('packs 0 for a deposit into an existing pool', () => {
    expect(deposit({})).toBe(EXISTING_POOL);
  });

  it('packs the id of an LP asset the request names', () => {
    // A95428956661682177 -> 0x01530821671b1001, as core composed it.
    expect(deposit({ lp_asset: 'A95428956661682177' })).toBe(`${DEPOSIT}01530821671b1001`);
  });

  // The reported failure: core draws the id, so 0 could never match.
  it('borrows the id core drew when the request names no LP asset', () => {
    expect(deposit({}, { lpAssetId: 0x43ab252b336104e7n })).toBe(`${DEPOSIT}43ab252b336104e7`);
  });

  it('prefers a named LP asset over the composed one, so a substitution still fails', () => {
    expect(deposit({ lp_asset: 'A95428956661682177' }, { lpAssetId: 0x43ab252b336104e7n }))
      .toBe(`${DEPOSIT}01530821671b1001`);
  });

  // Only a draw from the numeric-asset range is one core could have generated. A named asset's id
  // appearing where the request named nothing is declined rather than blessed by borrowing it.
  it('declines an LP asset id outside the range core draws from', () => {
    expect(deposit({}, { lpAssetId: 1n })).toBeNull();
    expect(deposit({}, { lpAssetId: 26n ** 12n })).toBeNull();
  });
});
