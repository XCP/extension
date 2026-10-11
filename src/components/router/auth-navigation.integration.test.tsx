import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createContext, type ReactNode, use, useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import UnlockPage from '@/pages/keychain/unlock';
import { AuthRequired } from './auth-required';
import { KeychainLockedOnly } from './keychain-locked-only';
import { KeychainOpenOrNew } from './keychain-open-or-new';

type AuthState = 'LOCKED' | 'UNLOCKED';
const WalletFixture = createContext({ authState: 'LOCKED' as AuthState, keychainExists: true,
  isLoading: false, unlockKeychain: async (_password: string) => {} });
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => use(WalletFixture) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));
vi.mock('@/platform/version', () => ({ getDisplayVersion: () => 'test' }));

function setup(path: string, initialAuth: AuthState = 'LOCKED', state?: unknown) {
  const target = new URL(path, 'https://wallet.invalid');
  function Wallet({ children }: { children: ReactNode }) {
    const [authState, setAuth] = useState(initialAuth);
    return <WalletFixture value={{ authState, keychainExists: true, isLoading: false,
      unlockKeychain: async () => { setAuth('UNLOCKED'); } }}>
      <button type="button" onClick={() => setAuth('LOCKED')}>Lock fixture</button>
      {children}
    </WalletFixture>;
  }
  const router = createMemoryRouter([
    { element: <AuthRequired />, children: [
      { path: '/compose/send', element: <div>Send form</div> },
      { path: '/actions/consolidate/status', element: <div>Batch status</div> },
      { path: '/actions/consolidate/success', element: <div>Batch results</div> },
    ] },
    { element: <KeychainLockedOnly />, children: [{ path: '/keychain/unlock', element: <UnlockPage /> }] },
    { element: <KeychainOpenOrNew />, children: [{ path: '/keychain/setup/import-private-key', element: <div>Import form</div> }] },
    { path: '/actions', element: <div>Actions</div> },
    { path: '/index', element: <div>Home</div> },
    { path: '/', element: <div>Home</div> },
  ], { initialEntries: [{ pathname: target.pathname, search: target.search, hash: target.hash, state }] });
  render(<Wallet><RouterProvider router={router} /></Wallet>);
  return { router, lock: () => fireEvent.click(screen.getByRole('button', { name: 'Lock fixture' })) };
}

async function unlock() {
  await waitFor(() => expect(document.querySelector('input[name="password"]')).not.toBeNull());
  const input = document.querySelector<HTMLInputElement>('input[name="password"]')!;
  fireEvent.change(input, { target: { value: 'correct-horse-battery' } });
  fireEvent.submit(input.closest('form')!);
}

afterEach(() => { window.history.replaceState(null, '', '/'); });

it('returns to the full requested URL after the real unlock page submits', async () => {
  const { router } = setup('/compose/send?asset=XCP&destination=alice#recipient');
  await unlock();
  await screen.findByText('Send form');
  expect(router.state.location.search).toBe('?asset=XCP&destination=alice');
  expect(router.state.location.hash).toBe('#recipient');
});

it('removes protected content on a live lock and restores its route state after unlock', async () => {
  const { router, lock } = setup('/compose/send?asset=XCP', 'UNLOCKED', { draft: 'keep' });
  expect(screen.getByText('Send form')).toBeInTheDocument();
  lock();
  expect(screen.queryByText('Send form')).not.toBeInTheDocument();
  await unlock();
  await screen.findByText('Send form');
  expect(router.state.location.search).toBe('?asset=XCP');
  expect(router.state.location.state).toEqual({ draft: 'keep' });
});

it('returns to an import page that needed an unlock', async () => {
  const { router } = setup('/keychain/setup/import-private-key?source=settings');
  await unlock();
  await screen.findByText('Import form');
  expect(router.state.location.search).toBe('?source=settings');
});

it('allows reconstructible batch status to open directly', async () => {
  const { router } = setup('/actions/consolidate/status', 'UNLOCKED');
  await waitFor(() => expect(router.state.location.pathname).toBe('/actions/consolidate/status'));
  expect(screen.getByText('Batch status')).toBeInTheDocument();
});

it('allows batch results with route state but redirects missing results', async () => {
  const { router } = setup('/actions/consolidate/success', 'UNLOCKED', { results: [] });
  expect(screen.getByText('Batch results')).toBeInTheDocument();
  await act(async () => { await router.navigate('/actions/consolidate/success', { state: null }); });
  await screen.findByText('Home');
});

it('leaves a continuing provider window on unlock until the background navigates it', async () => {
  window.history.replaceState(null, '', '/popup.html?continues=request-1');
  const { router } = setup('/keychain/unlock');
  await unlock();
  await waitFor(() => expect(screen.getByRole('button', { name: /Unlocking/ })).toBeDisabled());
  expect(router.state.location.pathname).toBe('/keychain/unlock');
});
