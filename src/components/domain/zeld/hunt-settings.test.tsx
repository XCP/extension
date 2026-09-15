import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { HuntSettings } from './hunt-settings';

let zeldHuntSeconds = 0;
const mockUpdateSettings = vi.fn(async () => {});

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { ...DEFAULT_SETTINGS, zeldHuntSeconds },
    isLoading: false,
    updateSettings: mockUpdateSettings,
  }),
}));

const input = () => screen.getByLabelText('Seconds to hunt for a ZELD transaction ID') as HTMLInputElement;

describe('HuntSettings', () => {
  it('requires opting in before transactions spend time mining', () => {
    expect(DEFAULT_SETTINGS.zeldHuntSeconds).toBe(0);
    render(<HuntSettings />);
    expect(screen.getByRole('switch', { name: 'Enable ZELD Hunting' })).toHaveAttribute('aria-checked', 'false');
  });
  beforeEach(() => {
    vi.clearAllMocks();
    zeldHuntSeconds = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the stored budget and the enforced cap', () => {
    zeldHuntSeconds = 15;
    render(<HuntSettings />);
    expect(input().value).toBe('15');
    expect(screen.getByText(/0 is off, 60 max/)).toBeInTheDocument();
  });

  it('persists a valid whole number of seconds on blur', async () => {
    render(<HuntSettings />);
    fireEvent.change(input(), { target: { value: '20' } });
    fireEvent.blur(input());
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ zeldHuntSeconds: 20 }));
  });

  it('saves on Enter', async () => {
    render(<HuntSettings />);
    fireEvent.change(input(), { target: { value: '5' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.blur(input());
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ zeldHuntSeconds: 5 }));
  });

  it.each(['61', '-1', '2.5', 'ten', ''])('rejects %j without saving', async (value) => {
    render(<HuntSettings />);
    fireEvent.change(input(), { target: { value } });
    fireEvent.blur(input());
    expect(await screen.findByRole('alert')).toHaveTextContent('whole number of seconds from 0 to 60');
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('does not write an unchanged value', async () => {
    zeldHuntSeconds = 10;
    render(<HuntSettings />);
    fireEvent.blur(input());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('shows help text only when asked', () => {
    const { rerender } = render(<HuntSettings />);
    expect(screen.getByText(/Finding ZELD is not guaranteed/)).toHaveClass('hidden');
    rerender(<HuntSettings showHelpText />);
    expect(screen.getByText(/Finding ZELD is not guaranteed/)).not.toHaveClass('hidden');
  });

  it('enables with a bounded default and disables without a hunt', async () => {
    const { rerender } = render(<HuntSettings />);
    fireEvent.click(screen.getByRole('switch', { name: 'Enable ZELD Hunting' }));
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenLastCalledWith({ zeldHuntSeconds: 15 }));
    zeldHuntSeconds = 20;
    rerender(<HuntSettings />);
    fireEvent.click(screen.getByRole('switch', { name: 'Enable ZELD Hunting' }));
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenLastCalledWith({ zeldHuntSeconds: 0 }));
  });
});
