import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: vi.fn(),
}));

const mockNavigate = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual as any,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/keychain/unlock', state: null }),
  };
});

import { useWallet } from '@/contexts/wallet-context';
import { CONTINUATION_FALLBACK_MS, KeychainLockedOnly } from './keychain-locked-only';

interface MockWalletContext {
  authState: 'UNLOCKED' | 'LOCKED' | 'ONBOARDING_NEEDED';
  keychainExists: boolean;
  isLoading: boolean;
}

describe('KeychainLockedOnly', () => {
  const mockUseWallet = useWallet as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const setupWalletContext = (context: MockWalletContext) => {
    mockUseWallet.mockReturnValue(context);
  };

  const renderWithRouter = (initialRoute = '/keychain/unlock') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<KeychainLockedOnly />}>
            <Route path="/keychain/unlock" element={<div>Unlock Screen</div>} />
          </Route>
          <Route path="/keychain/onboarding" element={<div>Onboarding Screen</div>} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('Loading State', () => {
    it('should not render anything while loading', () => {
      setupWalletContext({
        authState: 'LOCKED',
        keychainExists: true,
        isLoading: true,
      });

      renderWithRouter();

      expect(screen.queryByText('Unlock Screen')).not.toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Keychain Exists + Locked', () => {
    it('should render unlock screen when keychain exists and locked', () => {
      setupWalletContext({
        authState: 'LOCKED',
        keychainExists: true,
        isLoading: false,
      });

      renderWithRouter();

      expect(screen.getByText('Unlock Screen')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('No Keychain', () => {
    it('should redirect to onboarding when no keychain exists', () => {
      setupWalletContext({
        authState: 'ONBOARDING_NEEDED',
        keychainExists: false,
        isLoading: false,
      });

      renderWithRouter();

      expect(mockNavigate).toHaveBeenCalledWith('/keychain/onboarding', { replace: true });
      expect(screen.queryByText('Unlock Screen')).not.toBeInTheDocument();
    });
  });

  describe('Already Unlocked', () => {
    it('should redirect to home when already unlocked', () => {
      setupWalletContext({
        authState: 'UNLOCKED',
        keychainExists: true,
        isLoading: false,
      });

      renderWithRouter();

      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
      expect(screen.queryByText('Unlock Screen')).not.toBeInTheDocument();
    });
  });

  describe('Unlocked in a window a request continues in', () => {
    beforeEach(() => {
      window.history.replaceState(null, '', '/popup.html?continues=https%3A%2F%2Fdapp.test-unlock-1');
    });

    afterEach(() => {
      vi.useRealTimers();
      window.history.replaceState(null, '', '/');
    });

    it('keeps the unlock screen instead of going home while the request loads', () => {
      vi.useFakeTimers();
      setupWalletContext({ authState: 'UNLOCKED', keychainExists: true, isLoading: false });

      renderWithRouter();

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(screen.getByText('Unlock Screen')).toBeInTheDocument();
      // Still waiting just short of the fallback: the background navigates this window itself.
      vi.advanceTimersByTime(CONTINUATION_FALLBACK_MS - 1);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('still asks a locked wallet for its password', () => {
      setupWalletContext({ authState: 'LOCKED', keychainExists: true, isLoading: false });

      renderWithRouter();

      expect(screen.getByText('Unlock Screen')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('State Transitions', () => {
    it('should handle transition from loading to locked', () => {
      setupWalletContext({
        authState: 'LOCKED',
        keychainExists: true,
        isLoading: true,
      });

      const { rerender } = renderWithRouter();

      expect(screen.queryByText('Unlock Screen')).not.toBeInTheDocument();

      setupWalletContext({
        authState: 'LOCKED',
        keychainExists: true,
        isLoading: false,
      });

      rerender(
        <MemoryRouter initialEntries={['/keychain/unlock']}>
          <Routes>
            <Route element={<KeychainLockedOnly />}>
              <Route path="/keychain/unlock" element={<div>Unlock Screen</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Unlock Screen')).toBeInTheDocument();
    });
  });
});
