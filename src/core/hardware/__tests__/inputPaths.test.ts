import { describe, expect, it } from 'vitest';
import { mapVerifiedInputPaths } from '@/core/hardware/inputPaths';

const prevout = (index: number, address?: string) => ({
  index,
  txid: `${index}`.padStart(64, '0'),
  vout: 0,
  amount: 1n,
  script: new Uint8Array([index]),
  rawTransaction: new Uint8Array([index]),
  ...(address ? { address } : {}),
});

describe('mapVerifiedInputPaths', () => {
  it('uses the owning derivation path for each input', () => {
    const paths = mapVerifiedInputPaths(
      [prevout(0, 'bc1qfirst'), prevout(1, 'bc1qsecond')],
      [
        { address: 'bc1qfirst', path: 'm/84/0' },
        { address: 'bc1qsecond', path: 'm/84/1' },
      ],
      (path) => path.endsWith('/0') ? [84, 0] : [84, 1],
    );

    expect(paths.get(0)).toEqual([84, 0]);
    expect(paths.get(1)).toEqual([84, 1]);
  });

  it('rejects foreign or unattributable inputs', () => {
    expect(() => mapVerifiedInputPaths(
      [prevout(0, 'bc1qforeign')],
      [{ address: 'bc1qours', path: 'm/84/0' }],
      () => [84, 0],
    )).toThrow(/does not belong/);
    expect(() => mapVerifiedInputPaths(
      [prevout(0)],
      [{ address: 'bc1qours', path: 'm/84/0' }],
      () => [84, 0],
    )).toThrow(/does not belong/);
  });
});
