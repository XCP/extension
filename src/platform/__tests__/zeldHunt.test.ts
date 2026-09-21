import { beforeEach, describe, expect, it, vi } from 'vitest';
import { huntTxid } from '@/core/zeld/hunt';
import { huntInBackground } from '@/platform/zeldHunt';

vi.mock('@/core/zeld/hunt', () => ({ huntTxid: vi.fn() }));
const job = { kind: 'locktime' as const, message: new Uint8Array(80), nonceOffset: 76 };
const options = { seconds: 5, targetZeros: 6 };
const empty = { status: 'not_found' as const, attempts: 0, elapsedMs: 0 };

describe('existing background hunt context', () => {
  beforeEach(() => vi.mocked(huntTxid).mockReset());

  it('skips an overlapping hunt and releases the slot after completion', async () => {
    let finish!: (value: typeof empty) => void;
    vi.mocked(huntTxid).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = huntInBackground(job, options);
    expect(await huntInBackground(job, options)).toEqual(empty);
    expect(huntTxid).toHaveBeenCalledOnce();
    finish(empty);
    expect(await pending).toEqual(empty);
    vi.mocked(huntTxid).mockResolvedValueOnce(empty);
    await huntInBackground(job, options);
    expect(huntTxid).toHaveBeenCalledTimes(2);
  });

  it('releases the slot after failure', async () => {
    vi.mocked(huntTxid).mockRejectedValueOnce(new Error('failed'));
    await expect(huntInBackground(job, options)).rejects.toThrow('failed');
    vi.mocked(huntTxid).mockResolvedValueOnce(empty);
    expect(await huntInBackground(job, options)).toEqual(empty);
  });

  it('does not start a cancelled hunt', async () => {
    expect(await huntInBackground(job, { ...options, signal: AbortSignal.abort() })).toMatchObject({ status: 'aborted' });
    expect(huntTxid).not.toHaveBeenCalled();
  });
});
