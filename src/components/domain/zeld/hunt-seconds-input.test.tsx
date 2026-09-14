import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { HuntSecondsInput } from './hunt-seconds-input';

let zeldHuntSeconds = 0;
const mockUpdateSettings = vi.fn(async () => {});

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { ...DEFAULT_SETTINGS, zeldHuntSeconds },
    isLoading: false,
    updateSettings: mockUpdateSettings,
  }),
}));

const input = () => screen.getByLabelText('Seconds to hunt for a ZELD txid before signing') as HTMLInputElement;

describe('HuntSecondsInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    zeldHuntSeconds = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the stored budget and the enforced cap', () => {
    zeldHuntSeconds = 15;
    render(<HuntSecondsInput />);
    expect(input().value).toBe('15');
    expect(screen.getByText(/0 is off, 60 max/)).toBeInTheDocument();
  });

  it('persists a valid whole number of seconds on blur', async () => {
    render(<HuntSecondsInput />);
    fireEvent.change(input(), { target: { value: '20' } });
    fireEvent.blur(input());
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ zeldHuntSeconds: 20 }));
  });

  it('saves on Enter', async () => {
    render(<HuntSecondsInput />);
    fireEvent.change(input(), { target: { value: '5' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.blur(input());
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ zeldHuntSeconds: 5 }));
  });

  it.each(['61', '-1', '2.5', 'ten', ''])('rejects %j without saving', async (value) => {
    render(<HuntSecondsInput />);
    fireEvent.change(input(), { target: { value } });
    fireEvent.blur(input());
    expect(await screen.findByRole('alert')).toHaveTextContent('whole number of seconds from 0 to 60');
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('does not write an unchanged value', async () => {
    zeldHuntSeconds = 10;
    render(<HuntSecondsInput />);
    fireEvent.blur(input());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('shows help text only when asked', () => {
    const { rerender } = render(<HuntSecondsInput />);
    expect(screen.getByText(/earns ZELD/)).toHaveClass('hidden');
    rerender(<HuntSecondsInput showHelpText />);
    expect(screen.getByText(/earns ZELD/)).not.toHaveClass('hidden');
  });
});
