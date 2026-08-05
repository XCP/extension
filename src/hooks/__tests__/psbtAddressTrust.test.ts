/**
 * The PSBT approval screen enriches outputs with addresses from the decode API.
 * That enrichment must only fill gaps — never replace an address derived from
 * the bytes — because the same array is what `analyzeTransactionSafety` and
 * `computeMoneyMovement` classify on. An API that could relabel someone else's
 * output as the signer's own would silence "BTC Sent to External Address" and
 * report the outgoing value as change (ADR-019: the screen describes the bytes).
 */

import { describe, expect, it } from 'vitest';
import { computeMoneyMovement } from '@/components/domain/approval/money-movement';
import { analyzeTransactionSafety } from '@/core/counterparty/transactionSafety';

const SIGNER = '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX';
const ATTACKER = '1CounterpartyXXXXXXXXXXXXXXXUWLpVr';

/** The production enrichment rule: fill only, never overwrite. */
function enrich(
  outputs: Array<{ index: number; value: number; address?: string; type: string }>,
  apiVout: Array<{ n: number; scriptPubKey: { address?: string } }>,
) {
  for (const vout of apiVout) {
    const output = outputs.find((o) => o.index === vout.n);
    if (output && !output.address && vout.scriptPubKey.address) {
      output.address = vout.scriptPubKey.address;
    }
  }
  return outputs;
}

describe('PSBT output address enrichment', () => {
  it('does not let the API relabel a byte-derived external output as the signer’s', () => {
    // Locally decoded from the script: paying the attacker.
    const outputs = [
      { index: 0, value: 100_000, address: ATTACKER, type: 'address' },
    ];

    // Hostile decode claims that same output belongs to the signer.
    enrich(outputs, [{ n: 0, scriptPubKey: { address: SIGNER } }]);

    expect(outputs[0]!.address).toBe(ATTACKER);

    const { warnings } = analyzeTransactionSafety('enhanced_send', outputs, SIGNER);
    expect(warnings.some((w) => w.title === 'BTC Sent to External Address')).toBe(true);

    const movement = computeMoneyMovement({
      inputs: [{ address: SIGNER, value: 150_000 }],
      outputs,
      myAddresses: [SIGNER],
      fee: 50_000,
      committedOutputs: null,
    });
    // The value must still read as leaving, not as change.
    expect(movement.backToYou).toBe(0);
    expect(movement.external).toHaveLength(1);
  });

  it('still fills an address the local decode could not derive', () => {
    const outputs = [{ index: 0, value: 100_000, type: 'unknown' }] as Array<{
      index: number; value: number; address?: string; type: string;
    }>;

    enrich(outputs, [{ n: 0, scriptPubKey: { address: ATTACKER } }]);

    expect(outputs[0]!.address).toBe(ATTACKER);
  });
});
