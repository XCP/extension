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
  };
});

import { NoKeychainOnly } from '../no-keychain-only';
import { useWallet } from '@/contexts/wallet-context';

interface MockWalletContext {
  authState: 'UNLOCKED' | 'LOCKED' | 'ONBOARDING_NEEDED';
  keychainExists: boolean;
  isLoading: boolean;
}

describe('NoKeychainOnly', () => {
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

  const renderWithRouter = (initialRoute = '/keychain/onboarding') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<NoKeychainOnly />}>
            <Route path="/keychain/onboarding" element={<div>Onboarding Screen</div>} />
          </Route>
          <Route path="/keychain/unlock" element={<div>Unlock Screen</div>} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('Loading State', () => {
    it('should not render anything while loading', () => {
      setupWalletContext({
        authState: 'ONBOARDING_NEEDED',
        keychainExists: false,
        isLoading: true,
      });

      renderWithRouter();

      expect(screen.queryByText('Onboarding Screen')).not.toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('No Keychain (Fresh Install)', () => {
    it('should render onboarding when no keychain exists', () => {
      setupWalletContext({
        authState: 'ONBOARDING_NEEDED',
        keychainExists: false,
        isLoading: false,
      });

      renderWithRouter();

      expect(screen.getByText('Onboarding Screen')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Keychain Exists + Locked', () => {
    it('should redirect to unlock when keychain exists but locked', () => {
      setupWalletContext({
        authState: 'LOCKED',
        keychainExists: true,
        isLoading: false,
      });

      renderWithRouter();

      expect(mockNavigate).toHaveBeenCalledWith('/keychain/unlock', { replace: true });
      expect(screen.queryByText('Onboarding Screen')).not.toBeInTheDocument();
    });
  });

  describe('Keychain Exists + Unlocked', () => {
    it('should redirect to home when keychain exists and unlocked', () => {
      setupWalletContext({
        authState: 'UNLOCKED',
        keychainExists: true,
        isLoading: false,
      });

      renderWithRouter();

      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
      expect(screen.queryByText('Onboarding Screen')).not.toBeInTheDocument();
    });
  });

  describe('State Transitions', () => {
    it('should handle transition from loading to no keychain', () => {
      setupWalletContext({
        authState: 'ONBOARDING_NEEDED',
        keychainExists: false,
        isLoading: true,
      });

      const { rerender } = renderWithRouter();

      expect(screen.queryByText('Onboarding Screen')).not.toBeInTheDocument();

      setupWalletContext({
        authState: 'ONBOARDING_NEEDED',
        keychainExists: false,
        isLoading: false,
      });

      rerender(
        <MemoryRouter initialEntries={['/keychain/onboarding']}>
          <Routes>
            <Route element={<NoKeychainOnly />}>
              <Route path="/keychain/onboarding" element={<div>Onboarding Screen</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Onboarding Screen')).toBeInTheDocument();
    });
  });
});
