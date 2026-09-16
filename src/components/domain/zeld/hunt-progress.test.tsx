import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HuntProgress } from './hunt-progress';

const progress = { attempts: 8_000_000, elapsedMs: 5_000, hashRate: 1_600_000, seconds: 30, targetZeros: 6 };

describe('HuntProgress', () => {
  it('lets the user continue before finding a result and shows time, not a probability bar', () => {
    const onContinue = vi.fn();
    render(<HuntProgress progress={progress} onContinue={onContinue} />);
    expect(screen.getByText('25s left')).toBeDefined();
    expect(screen.getByText('1.60 MH/s')).toBeDefined();
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('5');
    fireEvent.click(screen.getByRole('button', { name: 'Continue without hunting' }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('announces a saved result and offers to use it now', () => {
    render(<HuntProgress progress={{ ...progress, bestZeroCount: 6 }} onContinue={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('Found a 6-zero txid');
    expect(screen.getByRole('button', { name: 'Use it now' })).toBeDefined();
  });
});
