import { describe, expect, it } from 'vitest';
import type { PsbtDetails } from '@/core/bitcoin/psbt';
import { resolveProviderSignInputs } from '../providerSigningPlan';

describe('provider signing plan', () => {
  it('makes omitted inputs explicit without expanding to paired or unattributed scripts', () => {
    const details = { inputs: [
      { index: 0, address: 'bc1qactive' }, { index: 1, address: '1paired' }, { index: 2 },
    ] } as PsbtDetails;
    expect(resolveProviderSignInputs(details, 'bc1qactive')).toEqual({ bc1qactive: [0] });
  });

  it('rejects an omitted plan with no active-owned inputs or unsupported sighashes', () => {
    expect(() => resolveProviderSignInputs({ inputs: [{ index: 0 }] } as PsbtDetails, 'bc1qactive'))
      .toThrow(/no inputs belonging/);
    expect(() => resolveProviderSignInputs({ inputs: [{ index: 0, address: 'bc1qactive', sighashType: 2 }] } as PsbtDetails, 'bc1qactive'))
      .toThrow(/unsupported sighash/);
  });
});
