/**
 * Guards the compose mock's transaction builder against drift.
 *
 * The builder packs a message with the same code the extension verifies against, so a change to
 * either side that breaks the agreement should fail here — pointing at the fixture — rather than
 * as a wall of unexplained review-page timeouts across every compose suite.
 *
 * Pure functions only: no browser, no extension, no network.
 */

import { expect, test } from '@playwright/test';
import { buildFixtureTransaction } from '../compose-fixture-tx';
import { checkOutputPolicy } from '../../src/core/counterparty/outputPolicy';
import { packComposeMessage } from '../../src/core/counterparty/pack/messages';
import { bytesToHex } from '../../src/core/counterparty/unpack/binary';
import { extractCounterpartyPayload } from '../../src/core/counterparty/unpack/opReturn';

const SOURCE = '14udFRS6AdnQNJZn9RZ1H3LtSqP7k2UeTC';
const OTHER = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
const composeUrl = (type: string, query: string) =>
  `https://api.counterparty.io/v2/addresses/${SOURCE}/compose/${type}?${query}&sat_per_vbyte=5`;

test.describe('compose fixture transactions', () => {
  test('an order fixture carries exactly the message the request packs', async () => {
    const fixture = buildFixtureTransaction('order', composeUrl('order',
      'give_asset=XCP&give_quantity=100000000&get_asset=PEPECASH'
      + '&get_quantity=200000000&expiration=8064&fee_required=0'));
    expect(fixture).not.toBeNull();

    // What the composer rebuilds and demands the transaction match, byte for byte.
    const expected = packComposeMessage('order', {
      give_asset: 'XCP', give_quantity: '100000000', get_asset: 'PEPECASH',
      get_quantity: '200000000', expiration: '8064', fee_required: '0',
    });
    expect(extractCounterpartyPayload(fixture!.rawtransaction)).toBe(bytesToHex(expected!.bytes));

    expect(checkOutputPolicy({
      rawTransaction: fixture!.rawtransaction,
      ownAddresses: [SOURCE],
      intendedDestinations: [],
    }).ok).toBe(true);
  });

  test('an issuance fixture packs its booleans rather than the strings the query carries', async () => {
    // divisible=false survives only if the builder restores it as a boolean: the packer treats the
    // string "false" as absent, and would pack a divisible asset instead.
    const fixture = buildFixtureTransaction('issuance', composeUrl('issuance',
      'asset=TESTUNLOCKED&quantity=100000000&divisible=false&lock=false&reset=false'));
    expect(fixture).not.toBeNull();

    const expected = packComposeMessage('issuance', {
      asset: 'TESTUNLOCKED', quantity: '100000000', divisible: false, lock: false, reset: false,
    });
    expect(extractCounterpartyPayload(fixture!.rawtransaction)).toBe(bytesToHex(expected!.bytes));
  });

  test('an ownership transfer pays its new owner in the position core reads it from', async () => {
    const fixture = buildFixtureTransaction('issuance', composeUrl('issuance',
      `asset=TESTUNLOCKED&quantity=0&divisible=true&lock=false&reset=false`
      + `&transfer_destination=${OTHER}`));
    expect(fixture).not.toBeNull();

    // positionalDestination is what pins the new owner: the output immediately ahead of the data
    // output. A fixture that ordered its outputs any other way would fail here.
    expect(checkOutputPolicy({
      rawTransaction: fixture!.rawtransaction,
      ownAddresses: [SOURCE],
      intendedDestinations: [{ address: OTHER }],
      positionalDestination: OTHER,
    }).ok).toBe(true);
  });

  test('the fixture spends the coin the request offered, and keys the message with it', async () => {
    const offered = 'a'.repeat(64);
    const fixture = buildFixtureTransaction('order', composeUrl('order',
      `give_asset=XCP&give_quantity=1&get_asset=PEPECASH&get_quantity=1&expiration=100`
      + `&fee_required=0&inputs_set=${offered}:3`));
    expect(fixture).not.toBeNull();
    // Spending an unoffered coin is refused by checkInputPolicy, so the builder has to honour the
    // offer — and the payload only decrypts if that same txid keyed it.
    expect(fixture!.rawtransaction).toContain(offered);
    expect(extractCounterpartyPayload(fixture!.rawtransaction)).not.toBeNull();
  });

  test('a type that packs no message keeps the placeholder', async () => {
    // A BTC send has no Counterparty message to carry, and the composer expects none.
    expect(buildFixtureTransaction('send', composeUrl('send',
      `asset=BTC&quantity=10000&destination=${OTHER}`))).toBeNull();
  });

  test('the fee stays under the bound the composer applies', async () => {
    const fixture = buildFixtureTransaction('order', composeUrl('order',
      'give_asset=XCP&give_quantity=1&get_asset=PEPECASH&get_quantity=1&expiration=100&fee_required=0'));
    expect(fixture!.btc_in - fixture!.btc_out - fixture!.btc_change).toBe(fixture!.btc_fee);
    // MIN_BOUND_SATS floors the composer's fee bound at 10,000 sats, so anything under it passes
    // whatever rate a test picks.
    expect(fixture!.btc_fee).toBeLessThan(10_000);
  });
});
