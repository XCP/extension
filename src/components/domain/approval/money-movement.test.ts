import { describe, it, expect } from 'vitest';
import { computeMoneyMovement } from './money-movement';

describe('computeMoneyMovement', () => {
  it('computes a plain send (net outflow)', () => {
    const m = computeMoneyMovement({
      myAddresses: ['me'],
      inputs: [{ address: 'me', value: 100000 }],
      outputs: [
        { address: 'them', value: 90000 },
        { address: 'me', value: 5000 }, // change
      ],
      fee: 5000,
    });
    expect(m).toMatchObject({ spent: 100000, backToYou: 5000, net: -95000, incomplete: false });
    expect(m.external).toEqual([{ address: 'them', value: 90000 }]);
  });

  it('computes a receive (net positive) when inputs are not yours', () => {
    const m = computeMoneyMovement({
      myAddresses: ['me'],
      inputs: [{ address: 'them', value: 100000 }],
      outputs: [
        { address: 'me', value: 60000 },
        { address: 'them', value: 39000 },
      ],
      fee: 1000,
    });
    expect(m).toMatchObject({ spent: 0, backToYou: 60000, net: 60000, incomplete: false });
  });

  it('excludes OP_RETURN outputs from movement', () => {
    const m = computeMoneyMovement({
      myAddresses: ['me'],
      inputs: [{ address: 'me', value: 50000 }],
      outputs: [
        { address: 'them', value: 40000 },
        { value: 0, type: 'op_return' },
      ],
      fee: 10000,
    });
    expect(m.external).toEqual([{ address: 'them', value: 40000 }]);
  });

  it('records an unresolved output address as an external destination with null address', () => {
    const m = computeMoneyMovement({
      myAddresses: ['me'],
      inputs: [{ address: 'me', value: 50000 }],
      outputs: [{ value: 40000 }],
      fee: 10000,
    });
    expect(m.external).toEqual([{ address: null, value: 40000 }]);
  });

  it('flags incomplete when an input lacks a value or address', () => {
    expect(computeMoneyMovement({
      myAddresses: ['me'],
      inputs: [{ address: 'me' }], // no value
      outputs: [{ address: 'them', value: 10000 }],
      fee: 1000,
    }).incomplete).toBe(true);

    expect(computeMoneyMovement({
      myAddresses: ['me'],
      inputs: [{ value: 100000 }], // no address
      outputs: [{ address: 'them', value: 90000 }],
      fee: 10000,
    }).incomplete).toBe(true);
  });

  it('treats every output as committed when no commitment set is supplied', () => {
    const m = computeMoneyMovement({
      myAddresses: ['me'],
      inputs: [{ address: 'me', value: 100000 }],
      outputs: [{ address: 'them', value: 90000 }, { address: 'me', value: 5000 }],
      fee: 5000,
    });
    expect(m.atRisk).toBe(0);
    expect(m.backToYou).toBe(5000);
  });

  it('does not count an uncommitted output back to you as change', () => {
    const m = computeMoneyMovement({
      myAddresses: ['me'],
      inputs: [{ address: 'me', value: 100_000_000 }],
      outputs: [
        { address: 'me', value: 546 },        // committed
        { address: 'me', value: 99_989_454 }, // looks like change, not committed
      ],
      fee: 10_000,
      committedOutputs: new Set([0]),
    });

    expect(m.backToYou).toBe(546);
    expect(m.atRisk).toBe(99_989_454);
    expect(m.net).toBe(-99_999_454);
  });

  it('still counts a committed output back to you as change under a partial commitment', () => {
    const m = computeMoneyMovement({
      myAddresses: ['me'],
      inputs: [{ address: 'me', value: 100000 }],
      outputs: [{ address: 'me', value: 40000 }, { address: 'them', value: 55000 }],
      fee: 5000,
      committedOutputs: new Set([0, 1]),
    });
    expect(m.backToYou).toBe(40000);
    expect(m.atRisk).toBe(0);
    expect(m.net).toBe(-60000);
  });

  it('does not double-count an uncommitted external output', () => {
    const m = computeMoneyMovement({
      myAddresses: ['me'],
      inputs: [{ address: 'me', value: 100000 }],
      outputs: [{ address: 'them', value: 95000 }],
      fee: 5000,
      committedOutputs: new Set(), // commits to nothing
    });

    expect(m.external).toEqual([{ address: 'them', value: 95000 }]);
    expect(m.atRisk).toBe(0);
  });

  it('matches bech32 addresses case-insensitively', () => {
    const m = computeMoneyMovement({
      myAddresses: ['BC1QME'],
      inputs: [{ address: 'bc1qme', value: 100000 }],
      outputs: [{ address: 'bc1qthem', value: 95000 }],
      fee: 5000,
    });
    expect(m.spent).toBe(100000);
    expect(m.net).toBe(-100000);
  });
});
