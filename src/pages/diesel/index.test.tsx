import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/settings';
import DieselBalancePage from './index';

const state = vi.hoisted(() => ({ settings: {} as typeof DEFAULT_SETTINGS, fetch: vi.fn(), update: vi.fn(), header: vi.fn(), navigate: vi.fn(), activeAddress: { address: 'bc1qfixture' } }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: state.settings, updateSettings: state.update }) }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({ activeAddress: state.activeAddress }) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: state.header }) }));
vi.mock('react-router', () => ({ useNavigate: () => state.navigate }));
vi.mock('@/components/domain/balance/balance-header', () => ({ BalanceHeader: () => null }));
vi.mock('@/core/alkanes/api', async importOriginal => ({ ...await importOriginal<typeof import('@/core/alkanes/api')>(), fetchDieselBalance: () => state.fetch() }));

beforeEach(() => {
  state.settings = { ...DEFAULT_SETTINGS, protectAlkanesUtxos: true };
  state.fetch.mockReset().mockResolvedValue({ baseUnits: '100000000', utxos: [] });
});
afterEach(cleanup);

describe('DIESEL protection status', () => {
  it('reflects a changed protection setting without claiming disabled protection still applies', async () => {
    const { rerender } = render(<DieselBalancePage />);
    expect(await screen.findByText('Protected', { exact: true })).toBeInTheDocument();
    state.settings = { ...state.settings, protectAlkanesUtxos: false, showHelpText: false };
    rerender(<DieselBalancePage />);
    expect(screen.getByText('Protection off', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ordinary transactions can burn your tokens');
    expect(screen.queryByText('Protected', { exact: true })).not.toBeInTheDocument();
  });

  it('does not reassure the user that tokens are protected during an outage when protection is off', async () => {
    state.settings.protectAlkanesUtxos = false;
    state.fetch.mockRejectedValue(new Error('indexer unavailable'));
    render(<DieselBalancePage />);
    expect(await screen.findByText(/The Alkanes indexer could not be reached/)).toHaveTextContent('Alkanes protection is off');
    expect(screen.queryByText(/remains protected/)).not.toBeInTheDocument();
  });
});
