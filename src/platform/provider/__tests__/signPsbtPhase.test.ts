import { describe, expect, it, vi } from 'vitest';
import { signPsbtPhaseForDelivery } from '@/platform/provider/signPsbtPhase';

describe('signPsbtPhaseForDelivery', () => {
  it('signs sequentially and returns the complete ordered phase', async () => {
    const active: number[] = [];
    const sign = vi.fn(async (item: string, index: number) => {
      active.push(index);
      expect(active).toEqual([index]);
      active.pop();
      return `signed-${item}`;
    });

    await expect(signPsbtPhaseForDelivery(['a', 'b', 'c'], sign)).resolves.toEqual([
      'signed-a',
      'signed-b',
      'signed-c',
    ]);
    expect(sign.mock.calls.map(call => call[1])).toEqual([0, 1, 2]);
  });

  it('rejects the whole delivery when a later signer fails', async () => {
    let delivered: string[] | undefined;
    const sign = vi.fn(async (item: string) => {
      if (item === 'b') throw new Error('hardware signer cancelled');
      return `signed-${item}`;
    });

    await expect(
      signPsbtPhaseForDelivery(['a', 'b', 'c'], sign).then(result => {
        delivered = result;
      }),
    ).rejects.toThrow('hardware signer cancelled');
    expect(delivered).toBeUndefined();
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it('refuses an empty or oversized phase', async () => {
    const sign = vi.fn(async () => 'signed');
    await expect(signPsbtPhaseForDelivery([], sign)).rejects.toThrow('1..8');
    await expect(signPsbtPhaseForDelivery(Array.from({ length: 9 }, () => 'x'), sign))
      .rejects.toThrow('1..8');
    expect(sign).not.toHaveBeenCalled();
  });
});
