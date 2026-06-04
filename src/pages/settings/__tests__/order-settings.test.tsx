import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { OrderSettings } from '../order-settings';
import { LEGACY_MAX_ORDER_EXPIRATION } from '@/utils/settings';

const mockUpdateSettings = vi.fn();
vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { defaultOrderExpiration: 0 },
    updateSettings: mockUpdateSettings,
  }),
}));

const mockGetStatus = vi.fn();
vi.mock('@/utils/blockchain/counterparty/capabilities', () => ({
  getCounterpartyFeatureStatus: (...args: unknown[]) => mockGetStatus(...args),
}));

describe('OrderSettings — activation-window gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('coerces a "never" (0) default to the legacy max when the node lacks indefinite orders', async () => {
    mockGetStatus.mockResolvedValue({ supported: false });
    const onExpirationChange = vi.fn();

    render(<OrderSettings onExpirationChange={onExpirationChange} />);

    // The illegal default (0) must be snapped down and pushed up to the form so
    // an untouched order form can't submit a value the node rejects.
    await waitFor(() => {
      expect(onExpirationChange).toHaveBeenCalledWith(LEGACY_MAX_ORDER_EXPIRATION);
    });

    // Label must not claim "Never expires" in legacy mode.
    expect(screen.queryByText(/Never expires/)).not.toBeInTheDocument();
    expect(screen.getByText(/8,064 blocks/)).toBeInTheDocument();

    // Legacy presets are shown (no "Never"); the legacy-only "1 Hour" is present.
    expect(screen.getByRole('button', { name: '1 Hour' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Never' })).not.toBeInTheDocument();

    // Coercion is form-local only — it must not overwrite the saved preference.
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('preserves "never" (0) and offers it as a preset when the node supports indefinite orders', async () => {
    mockGetStatus.mockResolvedValue({ supported: true });
    const onExpirationChange = vi.fn();

    render(<OrderSettings onExpirationChange={onExpirationChange} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Never' })).toBeInTheDocument();
    });

    expect(onExpirationChange).not.toHaveBeenCalledWith(LEGACY_MAX_ORDER_EXPIRATION);
    expect(screen.getByText(/Never expires/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1 Hour' })).not.toBeInTheDocument();
  });
});
