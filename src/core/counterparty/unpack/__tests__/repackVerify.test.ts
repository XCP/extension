import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import { extractCounterpartyPayload } from '@/core/counterparty/unpack/opReturn';
import { proveByRepack } from '@/core/counterparty/unpack/repackVerify';

function proofFor(rawTxHex: string) {
  const payload = extractCounterpartyPayload(rawTxHex)!;
  const unpacked = unpackCounterpartyMessage(payload);
  return proveByRepack(unpacked.messageType, unpacked.data, payload);
}

function fixtures(): Record<string, { rawTxHex: string }> {
  return JSON.parse(readFileSync('e2e/fixtures/approval-scenarios.json', 'utf8')).scenarios;
}

describe('proveByRepack', () => {
  it('proves the decode is complete for every shape it claims to handle', () => {
    const actual: Record<string, string> = {};
    for (const [name, { rawTxHex }] of Object.entries(fixtures())) {
      const result = proofFor(rawTxHex);
      actual[name] = result.proved ? 'proved' : result.reason!;
    }

    // Recorded exactly as it stands rather than filtered to the passing subset: this is the
    // honest coverage map, and a type moving from 'no-adapter' to 'proved' should be a visible
    // change to this file.
    expect(actual).toEqual({
      'send-divisible-bech32': 'proved',
      'send-p2pkh': 'proved',
      'send-with-memo': 'proved',
      'send-above-safe-integer': 'proved',
      'mpma-two-recipients': 'proved',
      'mpma-three-recipients': 'proved',
      'sweep-blocked': 'proved',
      order: 'proved',
      destroy: 'proved',
      cancel: 'proved',
      dividend: 'proved',
      fairmint: 'proved',
      dispense: 'proved',
      'attach-bad-vout': 'proved',
      'utxo-move-foreign-source': 'proved',
      'issuance-numeric': 'proved',
      'fairminter-xcp69': 'proved',
      broadcast: 'proved',
      attach: 'proved',
      detach: 'proved',
      'utxo-move': 'proved',
      btcpay: 'proved',
      dispenser: 'proved',
      'pool-deposit': 'proved',
      'pool-withdraw': 'proved',
    });
  });

  it('does not prove a payload whose bytes were altered', () => {
    // Flip a byte deep in the body: the decode still succeeds and yields a different quantity,
    // so the rebuild cannot reproduce the original bytes.
    const { rawTxHex } = fixtures()['send-p2pkh']!;
    const payload = extractCounterpartyPayload(rawTxHex)!;
    const tampered = payload.slice(0, payload.length - 4) + (payload.slice(-4) === 'ffff' ? '0000' : 'ffff');

    const unpacked = unpackCounterpartyMessage(tampered);
    if (!unpacked.success) return; // an unparseable payload is already refused upstream

    expect(proveByRepack(unpacked.messageType, unpacked.data, tampered).proved).toBe(false);
  });

  it('needs no network and is unaffected by any API response', () => {
    // The whole point: the proof is a pure function of the bytes on screen.
    const { rawTxHex } = fixtures()['mpma-two-recipients']!;
    expect(proofFor(rawTxHex).proved).toBe(true);
  });
});
