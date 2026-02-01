import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

vi.mock('webext-bridge', () => ({
  sendMessage: vi.fn(),
  onMessage: vi.fn(),
}));

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: vi.fn(),
}));

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/keychain/unlock', state: null }),
  };
});

import { KeychainLockedOnly } from './keychain-locked-only';
import { useWallet } from '@/contexts/wallet-context';

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
