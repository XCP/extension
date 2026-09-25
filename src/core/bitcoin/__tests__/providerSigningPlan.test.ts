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

  // T2: explicit signInputs with no sighashTypes used to pass intake and review, then fail inside
  // the signer after the user had approved.
  it('rejects an embedded disallowed sighash on an explicitly requested input', () => {
    const details = {
      inputs: [{ index: 0, address: 'bc1qactive', sighashType: 0x02 }],
      outputs: [{ index: 0 }],
    } as unknown as PsbtDetails;
    expect(() => resolveProviderSignInputs(details, 'bc1qactive', { bc1qactive: [0] }))
      .toThrow(/unsupported sighash/);
    // Bare SINGLE (0x03) and SINGLE|ANYONECANPAY without its paired output are refused too.
    expect(() => resolveProviderSignInputs({ ...details, inputs: [{ index: 0, sighashType: 0x03 }] } as PsbtDetails,
      'bc1qactive', { bc1qactive: [0] })).toThrow(/unsupported sighash/);
    expect(() => resolveProviderSignInputs({
      inputs: [{ index: 0 }, { index: 1, sighashType: 0x83 }], outputs: [{ index: 0 }],
    } as unknown as PsbtDetails, 'bc1qactive', { bc1qactive: [1] })).toThrow(/requires an output/);
  });

  it('judges the explicit sighash entry over the embedded one', () => {
    const details = {
      inputs: [{ index: 0, address: 'bc1qactive', sighashType: 0x02 }],
      outputs: [{ index: 0 }],
    } as unknown as PsbtDetails;
    expect(resolveProviderSignInputs(details, 'bc1qactive', { bc1qactive: [0] }, [0x01]))
      .toEqual({ bc1qactive: [0] });
    // An unrequested input's embedded sighash is not this wallet's signature.
    expect(resolveProviderSignInputs({
      inputs: [{ index: 0 }, { index: 1, sighashType: 0x02 }], outputs: [{ index: 0 }],
    } as unknown as PsbtDetails, 'bc1qactive', { bc1qactive: [0] })).toEqual({ bc1qactive: [0] });
  });
});
