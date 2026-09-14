import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { DEFAULT_SETTINGS } from '@/core/settings';
import AdvancedSettingsPage from '../advanced';

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { ...DEFAULT_SETTINGS, zeldHuntSeconds: 20 },
    isLoading: false,
    updateSettings: vi.fn(async () => {}),
  }),
}));

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({ setHeaderProps: vi.fn() }),
}));

describe('AdvancedSettingsPage ZELD settings', () => {
  afterEach(() => {
    cleanup();
  });

  it('hosts the shared hunt budget control and nothing else about ZELD', () => {
    render(
      <MemoryRouter>
        <AdvancedSettingsPage />
      </MemoryRouter>
    );
    expect((screen.getByLabelText('Seconds to hunt for a ZELD txid before signing') as HTMLInputElement).value).toBe('20');
    // The indexer is not configurable; a URL field here would be a way to point the guard at a liar.
    expect(screen.queryByLabelText('ZELD indexer API URL')).not.toBeInTheDocument();
  });
});
