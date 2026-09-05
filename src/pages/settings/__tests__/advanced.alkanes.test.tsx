import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/settings';
import AdvancedSettingsPage from '../advanced';

const state = vi.hoisted(() => ({ settings: {} as typeof DEFAULT_SETTINGS, update: vi.fn(), header: vi.fn() }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: state.settings, updateSettings: state.update, isLoading: false }) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: state.header }) }));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/ui/inputs/api-url-input', () => ({ ApiUrlInput: () => null }));

beforeEach(() => {
  state.settings = { ...DEFAULT_SETTINGS, protectAlkanesUtxos: true, enableDieselMinting: true };
  state.update.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('Advanced Alkanes controls', () => {
  it('turns mining off atomically when protection is disabled and shows the burn warning', () => {
    const { rerender } = render(<AdvancedSettingsPage />);
    fireEvent.click(screen.getByRole('switch', { name: 'Protect Alkanes UTXOs' }));
    expect(state.update).toHaveBeenCalledWith({ protectAlkanesUtxos: false, enableDieselMinting: false });
    state.settings = { ...state.settings, protectAlkanesUtxos: false, enableDieselMinting: false, showHelpText: false };
    rerender(<AdvancedSettingsPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Protection off: ordinary spending can burn Alkanes.');
    fireEvent.click(screen.getByRole('switch', { name: 'Mine DIESEL (Alkanes)' }));
    expect(state.update).toHaveBeenLastCalledWith({ protectAlkanesUtxos: true, enableDieselMinting: true });
  });

  it('keeps the initial default page concise before the user disables protection', () => {
    state.settings = { ...DEFAULT_SETTINGS };
    render(<AdvancedSettingsPage />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['https://indexer.example/rpc', 'http://localhost:8080/rpc', 'http://127.0.0.1:8080/rpc', 'http://[::1]:8080/rpc'])('saves a supported endpoint: %s', async url => {
    render(<AdvancedSettingsPage />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Alkanes API' }), { target: { value: ` ${url} ` } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Alkanes API' }));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith({ alkanesApiBase: url }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['http://indexer.example/rpc', 'http://localhost.evil.example/rpc', 'javascript:alert(1)', 'https://user:password@indexer.example/rpc', 'https://indexer.example/rpc#fragment', ''])('rejects an unsafe or invalid endpoint: %s', async url => {
    render(<AdvancedSettingsPage />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Alkanes API' }), { target: { value: url } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Alkanes API' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use an HTTPS URL');
    expect(state.update).not.toHaveBeenCalled();
  });

  it('shows a save failure with help hidden and permits retry without discarding the edited URL', async () => {
    state.settings.showHelpText = false;
    state.update.mockRejectedValueOnce(new Error('background disconnected'));
    render(<AdvancedSettingsPage />);
    const input = screen.getByRole('textbox', { name: 'Alkanes API' });
    fireEvent.change(input, { target: { value: 'https://indexer.example/rpc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
    expect(input).toHaveValue('https://indexer.example/rpc');
    fireEvent.click(screen.getByRole('button', { name: 'Save Alkanes API' }));
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('restores the default endpoint from the reset control', async () => {
    state.settings.alkanesApiBase = 'https://indexer.example/rpc';
    render(<AdvancedSettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Alkanes API to default' }));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith({ alkanesApiBase: DEFAULT_SETTINGS.alkanesApiBase }));
  });
});
