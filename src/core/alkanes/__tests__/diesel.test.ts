import { describe, expect, it } from 'vitest';
import { buildDieselMintScript, decodeDieselMintScript } from '../diesel';

describe('DIESEL mint protostone', () => {
  it('reproduces the independently decoded canonical vout-0 script', () => {
    expect(buildDieselMintScript(0)).toBe('6a5d0eff7f818cec82d08bc0a88281d215');
  });

  it('repoints both successful mints and refunds to the wallet output', () => {
    const script = buildDieselMintScript(1);
    expect(script).toBe('6a5d0eff7f818cec8ad0abc0a88281d215');
    expect(decodeDieselMintScript(script)).toEqual({
      pointer: 1,
      refund: 1,
      calldata: [2n, 0n, 77n],
    });
  });

  it('rejects a malformed or unrelated OP_RETURN', () => {
    expect(() => decodeDieselMintScript('6a026869')).toThrow('Not an Alkanes runestone');
    expect(() => decodeDieselMintScript('6a5d0eff7f')).toThrow('Invalid runestone payload length');
  });
});
