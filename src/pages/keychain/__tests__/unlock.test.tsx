import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { t } from '@/i18n';
import { render } from '@/i18n/test-utils';
import UnlockPage from '../unlock';

const fixture = vi.hoisted(() => ({ navigate: vi.fn(), unlock: vi.fn() }));
vi.mock('react-router', () => ({ useNavigate: () => fixture.navigate }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({ unlockKeychain: fixture.unlock }) }));
vi.mock('@/platform/version', () => ({ getDisplayVersion: () => 'test-version' }));

async function submitPassword() {
  render(<UnlockPage />);
  const input = document.querySelector<HTMLInputElement>('input[name="password"]')!;
  fireEvent.change(input, { target: { value: 'correct-horse-battery' } });
  fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(fixture.unlock).toHaveBeenCalledWith('correct-horse-battery'));
}

describe('UnlockPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.unlock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('goes home after unlocking', async () => {
    await submitPassword();
    await waitFor(() => expect(fixture.navigate).toHaveBeenCalledWith('/index'));
  });

  it('stays busy for the request continuing in this window instead of going home', async () => {
    window.history.replaceState(null, '', '/popup.html?continues=dapp-unlock-1');
    await submitPassword();
    await waitFor(() => expect(screen.getByRole('button', { name: t('keychain_unlock_unlocking') })).toBeDisabled());
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it('lets a continuing window retry a wrong password', async () => {
    window.history.replaceState(null, '', '/popup.html?continues=dapp-unlock-1');
    fixture.unlock.mockRejectedValueOnce(new Error('bad password'));
    await submitPassword();
    await screen.findByRole('alert');
    expect(document.querySelector<HTMLInputElement>('input[name="password"]')!).toBeEnabled();
    expect(fixture.navigate).not.toHaveBeenCalled();
  });
});
