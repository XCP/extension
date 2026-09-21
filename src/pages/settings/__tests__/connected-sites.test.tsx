import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/settings';
import ConnectedSitesPage from '../connected-sites';

/**
 * The page derives its list from settings rather than fetching it, so a site connecting in another
 * window reaches it through the settings context. Reactivity itself is asserted where it lives —
 * see contexts/__tests__/settings-context.test.tsx.
 */

let connectedWebsites: string[] = [];
const mockDisconnect = vi.fn(async () => {});

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { ...DEFAULT_SETTINGS, connectedWebsites },
    isLoading: false,
    updateSettings: vi.fn(),
  }),
}));

vi.mock('@/services/providerService', () => ({
  getProviderService: () => ({ disconnect: mockDisconnect }),
}));

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({ setHeaderProps: vi.fn() }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <ConnectedSitesPage />
    </MemoryRouter>
  );

describe('ConnectedSitesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectedWebsites = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('lists the connected sites by hostname', async () => {
    connectedWebsites = ['https://example.com', 'https://newsite.org'];
    renderPage();

    expect(await screen.findByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('newsite.org')).toBeInTheDocument();
  });

  it('follows settings when a site is added', async () => {
    connectedWebsites = ['https://example.com'];
    const { rerender } = renderPage();
    await screen.findByText('example.com');

    connectedWebsites = ['https://example.com', 'https://newsite.org'];
    rerender(
      <MemoryRouter>
        <ConnectedSitesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('newsite.org')).toBeInTheDocument();
  });

  it('disconnects through the provider and lets settings drive the list', async () => {
    connectedWebsites = ['https://example.com'];
    renderPage();
    await screen.findByText('example.com');

    const disconnect = screen.getAllByRole('button').find(
      (button) => /disconnect/i.test(button.getAttribute('aria-label') ?? '')
    );
    disconnect?.click();

    // The page does not remove the row itself; the settings write is what removes it. A failed
    // disconnect therefore leaves the site listed, which is the truth.
    expect(mockDisconnect).toHaveBeenCalledWith('https://example.com');
  });
});
