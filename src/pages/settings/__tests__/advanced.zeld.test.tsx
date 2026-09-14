import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { DEFAULT_SETTINGS } from '@/core/settings';
import AdvancedSettingsPage from '../advanced';

let zeldApiBase = DEFAULT_SETTINGS.zeldApiBase;
const mockUpdateSettings = vi.fn(async () => {});

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { ...DEFAULT_SETTINGS, zeldHuntSeconds: 20, zeldApiBase },
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

const apiInput = () => screen.getByLabelText('ZELD indexer API URL') as HTMLInputElement;

describe('AdvancedSettingsPage ZELD settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    zeldApiBase = DEFAULT_SETTINGS.zeldApiBase;
  });

  afterEach(() => {
    cleanup();
  });

  it('hosts the shared hunt budget control', () => {
    renderPage();
    expect((screen.getByLabelText('Seconds to hunt for a ZELD txid before signing') as HTMLInputElement).value).toBe('20');
  });

  it('shows the indexer URL and saves a normalised https URL', async () => {
    renderPage();
    expect(apiInput().value).toBe('https://api.zeldhash.com');
    fireEvent.change(apiInput(), { target: { value: 'https://zeld.example.org/' } });
    fireEvent.blur(apiInput());
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ zeldApiBase: 'https://zeld.example.org' }));
  });

  it.each(['http://zeld.example.org', 'ftp://x', 'https://user:pw@x.org', 'not a url'])('rejects %s', async (value) => {
    renderPage();
    fireEvent.change(apiInput(), { target: { value } });
    fireEvent.blur(apiInput());
    expect(await screen.findByRole('alert')).toHaveTextContent('https URL');
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('allows http on localhost', async () => {
    renderPage();
    fireEvent.change(apiInput(), { target: { value: 'http://localhost:3000' } });
    fireEvent.blur(apiInput());
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ zeldApiBase: 'http://localhost:3000' }));
  });
});
