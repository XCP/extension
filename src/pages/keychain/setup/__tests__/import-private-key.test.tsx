import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockBrowserLocale } from '@/i18n/__tests__/helpers/locale';
import ImportPrivateKeyPage from '../import-private-key';

const navigate = vi.fn();
const setHeaderProps = vi.fn();
const createPrivateKeyWallet = vi.fn();
const verifyPassword = vi.fn();
const readText = vi.fn();
const writeText = vi.fn();
const permissions = () => chrome.permissions as unknown as { contains: ReturnType<typeof vi.fn>; request: ReturnType<typeof vi.fn> };
const key = '1'.repeat(64);

vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps }) }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({ createPrivateKeyWallet, verifyPassword }) }));
vi.mock('@/platform/fathom', () => ({ analytics: { track: vi.fn() } }));

async function fillForm(value = key) {
  render(<ImportPrivateKeyPage />);
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Clear clipboard after import' })).toBeEnabled());
  fireEvent.change(screen.getByPlaceholderText('Enter your private key'), { target: { value } });
  fireEvent.click(screen.getByRole('checkbox', { name: /backed up/i }));
  fireEvent.change(screen.getByPlaceholderText('Confirm your password'), { target: { value: 'password123' } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('private key import clipboard cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowserLocale({ language: 'en' });
    permissions().contains.mockResolvedValue(true);
    permissions().request.mockResolvedValue(true);
    createPrivateKeyWallet.mockResolvedValue({});
    verifyPassword.mockResolvedValue(true);
    readText.mockResolvedValue(key);
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText } });
  });

  it('clears a matching clipboard only after import succeeds, before navigating', async () => {
    let finishImport!: () => void;
    createPrivateKeyWallet.mockImplementationOnce(() => new Promise<void>(resolve => { finishImport = resolve; }));
    await fillForm('  ' + key + '  ');
    expect(screen.getByRole('checkbox', { name: 'Clear clipboard after import' })).toBeChecked();
    submit();
    await waitFor(() => expect(createPrivateKeyWallet).toHaveBeenCalled());
    expect(createPrivateKeyWallet.mock.calls[0]?.[0]).toBe(key);
    expect(readText).not.toHaveBeenCalled();
    finishImport();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/index'));
    expect(writeText).toHaveBeenCalledWith('');
    expect(writeText.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]!);
  });

  it('keeps other text copied while the import was running', async () => {
    await fillForm();
    readText.mockResolvedValue('other text');
    submit();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/index'));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not access the clipboard when unchecked', async () => {
    await fillForm();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Clear clipboard after import' }));
    submit();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/index'));
    expect(readText).not.toHaveBeenCalled();
  });

  it('requests permission on opt-in and prevents import during the request', async () => {
    permissions().contains.mockResolvedValue(false);
    let grant!: (value: boolean) => void;
    const decision = new Promise<boolean>(resolve => { grant = resolve; });
    permissions().request.mockReturnValueOnce(decision);
    await fillForm();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Clear clipboard after import' }));
    expect(chrome.permissions.request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    permissions().contains.mockResolvedValue(true);
    grant(true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    submit();
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(''));
  });

  it('permits import after access is denied without reading the clipboard', async () => {
    permissions().contains.mockResolvedValue(false);
    permissions().request.mockResolvedValue(false);
    await fillForm();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Clear clipboard after import' }));
    await screen.findByText(/Clipboard access was not granted/);
    submit();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/index'));
    expect(readText).not.toHaveBeenCalled();
  });

  it.each(['read', 'write'])('shows successful import with manual cleanup advice on %s failure', async failure => {
    if (failure === 'read') readText.mockRejectedValueOnce(new Error('Denied'));
    else writeText.mockRejectedValueOnce(new Error('Not focused'));
    await fillForm();
    submit();
    await screen.findByText(/Wallet imported. The clipboard could not be cleared/);
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('Enter your private key')).not.toBeInTheDocument();
    submit();
    expect(navigate).toHaveBeenCalledWith('/index');
    expect(createPrivateKeyWallet).toHaveBeenCalledTimes(1);
  });

  it.each(['password', 'import', 'validation'])('leaves clipboard intact after %s failure', async failure => {
    if (failure === 'password') verifyPassword.mockResolvedValue(false);
    if (failure === 'import') createPrivateKeyWallet.mockRejectedValueOnce(new Error('Import failed'));
    await fillForm(failure === 'validation' ? 'invalid-key' : key);
    submit();
    await screen.findByRole('alert');
    expect(readText).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
