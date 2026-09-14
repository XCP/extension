import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { DEFAULT_SETTINGS } from '@/core/settings';
import AdvancedSettingsPage from '../advanced';

let zeldHuntSeconds = 0;
const mockUpdateSettings = vi.fn(async () => {});

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { ...DEFAULT_SETTINGS, zeldHuntSeconds },
    isLoading: false,
    updateSettings: mockUpdateSettings,
  }),
}));

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({ setHeaderProps: vi.fn() }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdvancedSettingsPage />
    </MemoryRouter>
  );

const input = () => screen.getByLabelText('Seconds to hunt for a ZELD txid before signing') as HTMLInputElement;

describe('AdvancedSettingsPage ZELD hunt time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    zeldHuntSeconds = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the stored budget and the enforced cap', () => {
    zeldHuntSeconds = 15;
    renderPage();
    expect(input().value).toBe('15');
    expect(screen.getByText(/0 is off, 60 max/)).toBeInTheDocument();
  });

  it('persists a valid whole number of seconds on blur', async () => {
    renderPage();
    fireEvent.change(input(), { target: { value: '20' } });
    fireEvent.blur(input());
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ zeldHuntSeconds: 20 }));
  });

  it('saves on Enter', async () => {
    renderPage();
    fireEvent.change(input(), { target: { value: '5' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.blur(input());
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ zeldHuntSeconds: 5 }));
  });

  it.each(['61', '-1', '2.5', 'ten', ''])('rejects %j without saving', async (value) => {
    renderPage();
    fireEvent.change(input(), { target: { value } });
    fireEvent.blur(input());
    expect(await screen.findByRole('alert')).toHaveTextContent('whole number of seconds from 0 to 60');
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('does not write an unchanged value', async () => {
    zeldHuntSeconds = 10;
    renderPage();
    fireEvent.blur(input());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });
});
