import { describe, expect, it } from 'vitest';
import type { PsbtDetails } from '@/core/bitcoin/psbt';
import {
  checkSignInputOwners,
  hasAuthenticatedFunding,
  hasExcessSighashEntries,
  missingSighashEntries,
  psbtHeaderProblem,
  psbtSigningRequestShape,
  usesSingleWithoutOutput,
} from '../providerPsbtIntake';

const details = (overrides: Partial<PsbtDetails>): PsbtDetails => ({
  inputs: [],
  outputs: [],
  unfunded: false,
  transactionVersion: 2,
  lockTime: 0,
  ...overrides,
} as unknown as PsbtDetails);

describe('provider PSBT intake', () => {
  describe('hasAuthenticatedFunding', () => {
    const funded = details({ inputs: [{ index: 0, value: 1_000 }, { index: 1, value: 2_000 }] as never });

    it('accepts a funded PSBT whose every input has an authenticated amount', () => {
      expect(hasAuthenticatedFunding(funded)).toBe(true);
    });

    it('refuses an unfunded PSBT or any input without an amount', () => {
      expect(hasAuthenticatedFunding({ ...funded, unfunded: true })).toBe(false);
      expect(hasAuthenticatedFunding(details({ inputs: [{ index: 0, value: 1_000 }, { index: 1 }] as never })))
        .toBe(false);
    });

    it('lets a listing leave only input 0 open for the null buyer', () => {
      const placeholder = details({ unfunded: true, inputs: [{ index: 0 }, { index: 1, value: 2_000 }] as never });
      expect(hasAuthenticatedFunding(placeholder, { nullBuyerPlaceholder: true })).toBe(true);
      expect(hasAuthenticatedFunding(placeholder)).toBe(false);
      expect(hasAuthenticatedFunding(
        details({ inputs: [{ index: 0 }, { index: 1 }] as never }), { nullBuyerPlaceholder: true },
      )).toBe(false);
    });
  });

  it('counts sighash entries against the inputs', () => {
    const two = details({ inputs: [{ index: 0 }, { index: 1 }] as never });
    expect(hasExcessSighashEntries([1, 1], two)).toBe(false);
    expect(hasExcessSighashEntries([1, 1, 1], two)).toBe(true);
  });

  it('refuses SINGLE|ANYONECANPAY only where no output shares its index', () => {
    const oneOutput = details({ outputs: [{ index: 0 }] as never });
    expect(usesSingleWithoutOutput([0x83], oneOutput)).toBe(false);
    expect(usesSingleWithoutOutput([0x01, 0x83], oneOutput)).toBe(true);
    expect(usesSingleWithoutOutput([0x01, 0x01], oneOutput)).toBe(false);
  });

  it('lists requested inputs with no sighash entry, gaps included', () => {
    expect(missingSighashEntries([0, 1, 3], [1, undefined as never, 1])).toEqual([1, 3]);
    expect(missingSighashEntries([0], [0x00])).toEqual([]);
  });

  it('owns a tapleaf reveal input by its leaf key and other inputs by their address', () => {
    const psbt = details({ inputs: [{ index: 0, address: 'bc1qactive' }, { index: 1, address: 'bc1qother' }] as never });
    expect(checkSignInputOwners({ bc1qactive: [0] }, ['bc1qactive'], psbt).valid).toBe(true);
    expect(checkSignInputOwners({ bc1qactive: [1] }, ['bc1qactive'], psbt).valid).toBe(false);
    expect(checkSignInputOwners({ bc1qactive: [2] }, ['bc1qactive'], psbt).valid).toBe(false);
  });

  it('reports the marketplace header problem for the PSBT version and locktime', () => {
    const exactOffer = { action: 'accept_exact_offer', protocolVersion: 'exact_offer_v1' };
    expect(psbtHeaderProblem(exactOffer, details({}))).toBeNull();
    expect(psbtHeaderProblem(exactOffer, details({ transactionVersion: 3 })))
      .toBe('exact_offer_v1 requires Bitcoin transaction version 2 with locktime 0');
    expect(psbtHeaderProblem(exactOffer, details({ lockTime: 800_000 })))
      .toBe('exact_offer_v1 requires Bitcoin transaction version 2 with locktime 0');
  });

  describe('psbtSigningRequestShape', () => {
    const psbt = details({
      inputs: [
        { index: 0, scriptType: 'p2tr' },
        { index: 1, scriptType: 'p2wpkh', sighashType: 0x83 },
        { index: 2, scriptType: 'p2tr', hasSignatures: true },
      ] as never,
    });

    it('resolves requested inputs from the explicit entry, then embedded, then the script default', () => {
      expect(psbtSigningRequestShape(psbt, [0, 1], [undefined as never, 0x01])).toEqual({
        inputCount: 3,
        requestedInputIndices: [0, 1],
        sighashTypes: [0x00, 0x01, 0x01],
        presignedInputIndices: [2],
      });
    });

    it('gives unselected inputs the ALL fallback and ignores their explicit entries', () => {
      expect(psbtSigningRequestShape(psbt, undefined, [0x81, 0x81, 0x81])).toEqual({
        inputCount: 3,
        requestedInputIndices: undefined,
        sighashTypes: [0x01, 0x83, 0x01],
        presignedInputIndices: [2],
      });
    });
  });
});
