/**
 * The signing decision, enumerated.
 *
 * Both approval screens ask this one question and had answered it differently while each wrote it
 * out itself. Every input combination is listed with its answer stated rather than computed, so
 * changing the rule means changing these expectations on purpose.
 */

import { describe, expect, it } from 'vitest';
import { type SigningDecisionInput, shouldBlockSigning } from '../providerVerify';

interface Row extends SigningDecisionInput {
  blocked: boolean;
  because: string;
}

/**
 * A safety rule refusing the transaction is absolute — a sweep from a website is not a matter of
 * decoder agreement — so all twelve of these block regardless of what verification said.
 */
const SAFETY_BLOCKED: Row[] = [true, false].flatMap(repackProved =>
  [true, false].flatMap(strictMode =>
    ([true, false, undefined] as const).map(verificationPassed => ({
      safetyBlocked: true,
      verificationPassed,
      repackProved,
      strictMode,
      blocked: true,
      because: 'a safety block is absolute',
    }))
  )
);

/** With no safety block, the verification clauses decide. */
const SAFETY_CLEAR: Row[] = [
  // Failed verification blocks in strict mode — unless the rebuild already proved the payload.
  { safetyBlocked: false, verificationPassed: false, repackProved: false, strictMode: true, blocked: true, because: 'verification failed and nothing vouches for our reading of the bytes' },
  { safetyBlocked: false, verificationPassed: false, repackProved: true, strictMode: true, blocked: false, because: 'the rebuild reproduced the payload exactly, so the disagreeing decoder is the one that is wrong' },
  { safetyBlocked: false, verificationPassed: false, repackProved: false, strictMode: false, blocked: false, because: 'the user turned strict verification off' },
  { safetyBlocked: false, verificationPassed: false, repackProved: true, strictMode: false, blocked: false, because: 'neither clause applies' },

  // Passing verification never blocks, whatever else is true.
  { safetyBlocked: false, verificationPassed: true, repackProved: true, strictMode: true, blocked: false, because: 'verification passed' },
  { safetyBlocked: false, verificationPassed: true, repackProved: false, strictMode: true, blocked: false, because: 'verification passed' },
  { safetyBlocked: false, verificationPassed: true, repackProved: true, strictMode: false, blocked: false, because: 'verification passed' },
  { safetyBlocked: false, verificationPassed: true, repackProved: false, strictMode: false, blocked: false, because: 'verification passed' },

  // Verification not attempted is not the same as verification failed, and must not block: the API
  // decode being unreachable is not evidence against the transaction.
  { safetyBlocked: false, verificationPassed: undefined, repackProved: false, strictMode: true, blocked: false, because: 'nothing was checked, which is not a detected problem' },
  { safetyBlocked: false, verificationPassed: undefined, repackProved: true, strictMode: true, blocked: false, because: 'nothing was checked' },
  { safetyBlocked: false, verificationPassed: undefined, repackProved: false, strictMode: false, blocked: false, because: 'nothing was checked' },
  { safetyBlocked: false, verificationPassed: undefined, repackProved: true, strictMode: false, blocked: false, because: 'nothing was checked' },
];

const TRUTH_TABLE = [...SAFETY_BLOCKED, ...SAFETY_CLEAR];

describe('shouldBlockSigning', () => {
  it.each(TRUTH_TABLE)(
    'safety=$safetyBlocked passed=$verificationPassed repack=$repackProved strict=$strictMode → blocked=$blocked',
    ({ blocked, because, ...input }) => {
      expect(shouldBlockSigning(input), because).toBe(blocked);
    }
  );

  it('states an answer for every combination of its inputs, exactly once', () => {
    // 2 safety × 3 verification states × 2 repack × 2 strict. If an input gains a state, this fails
    // and the table has to grow with it rather than silently covering less.
    const key = (r: SigningDecisionInput) =>
      `${r.safetyBlocked}|${r.verificationPassed}|${r.repackProved}|${r.strictMode}`;
    const seen = new Set(TRUTH_TABLE.map(key));

    expect(TRUTH_TABLE).toHaveLength(2 * 3 * 2 * 2);
    expect(seen.size).toBe(2 * 3 * 2 * 2);
  });
});
