/**
 * Round-trip guard for the approval fixtures in e2e/fixtures/approval-scenarios.json.
 *
 * Each fixture is a real transaction built by this repo's packer and ARC4-obfuscated the way core
 * does it. Reading them back through the extension's own extraction and unpack path proves the
 * two halves still agree across every message type — a pack change that quietly stops
 * round-tripping shows up here rather than as a blank approval screen.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import { extractCounterpartyPayload } from '@/core/counterparty/unpack/opReturn';

const EXPECTED: Record<string, string> = {
  'send-divisible-bech32': 'enhanced_send',
  'send-p2pkh': 'enhanced_send',
  'send-with-memo': 'enhanced_send',
  'mpma-two-recipients': 'mpma_send',
  'mpma-three-recipients': 'mpma_send',
  'sweep-blocked': 'sweep',
  order: 'order',
  'issuance-numeric': 'issuance',
  destroy: 'destroy',
  cancel: 'cancel',
  dividend: 'dividend',
  fairmint: 'fairmint',
  broadcast: 'broadcast',
  dispense: 'dispense',
};

describe('approval fixtures', () => {
  it('every fixture still decodes to its message type through the extension path', () => {
    const { scenarios } = JSON.parse(
      readFileSync('e2e/fixtures/approval-scenarios.json', 'utf8')
    ) as { scenarios: Record<string, { rawTxHex: string }> };

    const actual: Record<string, string> = {};
    for (const [name, { rawTxHex }] of Object.entries(scenarios)) {
      const payload = extractCounterpartyPayload(rawTxHex);
      if (!payload) {
        actual[name] = 'NO PAYLOAD';
        continue;
      }
      const unpacked = unpackCounterpartyMessage(payload);
      actual[name] = unpacked?.success && unpacked.messageType ? unpacked.messageType : 'UNPACK FAILED';
    }

    expect(actual).toEqual(EXPECTED);
  });
});
