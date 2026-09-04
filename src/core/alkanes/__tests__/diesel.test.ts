import { describe, expect, it } from 'vitest';
import {
  buildDieselMintScript,
  buildDieselTransferScript,
  decodeDieselMintScript,
  isVerifiedDieselCarrierAddress,
} from '../diesel';

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

  it('matches the alkanes-rs SDK vector for an edict with wallet remainder', () => {
    // Cross-checked against ts-sdk ProtoStone({ pointer: 1, edicts: [2:0, 1.25, vout 0] }).
    expect(buildDieselTransferScript(125_000_000n, 0, 1)).toBe(
      '6a5d0fff7f818eec8a80c08080c0e5b6de03',
    );
  });

  it('limits the proved carrier design to native SegWit', () => {
    expect(isVerifiedDieselCarrierAddress('bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l')).toBe(true);
    expect(isVerifiedDieselCarrierAddress('bc1qwqdg6squsna38e46795at95yu9atm8azzmyvckulcc7kytlcckxswvvzej')).toBe(false);
    expect(isVerifiedDieselCarrierAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(false);
  });
});
