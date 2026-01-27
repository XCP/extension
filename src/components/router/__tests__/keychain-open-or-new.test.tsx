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

import { KeychainOpenOrNew } from '../keychain-open-or-new';
import { useWallet } from '@/contexts/wallet-context';

interface MockWalletContext {
  authState: 'UNLOCKED' | 'LOCKED' | 'ONBOARDING_NEEDED';
  keychainExists: boolean;
  isLoading: boolean;
}

describe('KeychainOpenOrNew', () => {
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

  const renderWithRouter = (initialRoute = '/keychain/setup/create-mnemonic') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<KeychainOpenOrNew />}>
            <Route path="/keychain/setup/create-mnemonic" element={<div>Create Wallet</div>} />
            <Route path="/keychain/setup/import-mnemonic" element={<div>Import Wallet</div>} />
          </Route>
          <Route path="/keychain/unlock" element={<div>Unlock Screen</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('Loading State', () => {
    it('should not render anything while loading', () => {
      setupWalletContext({
        authState: 'UNLOCKED',
        keychainExists: true,
        isLoading: true,
      });

      renderWithRouter();

      expect(screen.queryByText('Create Wallet')).not.toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('No Keychain (Fresh Install)', () => {
    it('should render child routes when no keychain exists', () => {
      setupWalletContext({
        authState: 'ONBOARDING_NEEDED',
        keychainExists: false,
        isLoading: false,
      });

      renderWithRouter();

      expect(screen.getByText('Create Wallet')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should render import route when no keychain exists', () => {
      setupWalletContext({
        authState: 'ONBOARDING_NEEDED',
        keychainExists: false,
        isLoading: false,
      });

      renderWithRouter('/keychain/setup/import-mnemonic');

      expect(screen.getByText('Import Wallet')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Authenticated (Adding Another Wallet)', () => {
    it('should render child routes when unlocked', () => {
      setupWalletContext({
        authState: 'UNLOCKED',
        keychainExists: true,
        isLoading: false,
      });

      renderWithRouter();

      expect(screen.getByText('Create Wallet')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Locked State (Must Unlock First)', () => {
    it('should redirect to unlock when keychain exists but locked', () => {
      setupWalletContext({
        authState: 'LOCKED',
        keychainExists: true,
        isLoading: false,
      });

      renderWithRouter();

      expect(mockNavigate).toHaveBeenCalledWith('/keychain/unlock', { replace: true });
      expect(screen.queryByText('Create Wallet')).not.toBeInTheDocument();
    });

    it('should not render content when locked', () => {
      setupWalletContext({
        authState: 'LOCKED',
        keychainExists: true,
        isLoading: false,
      });

      renderWithRouter('/keychain/setup/import-mnemonic');

      expect(screen.queryByText('Import Wallet')).not.toBeInTheDocument();
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

      expect(screen.queryByText('Create Wallet')).not.toBeInTheDocument();

      setupWalletContext({
        authState: 'ONBOARDING_NEEDED',
        keychainExists: false,
        isLoading: false,
      });

      rerender(
        <MemoryRouter initialEntries={['/keychain/setup/create-mnemonic']}>
          <Routes>
            <Route element={<KeychainOpenOrNew />}>
              <Route path="/keychain/setup/create-mnemonic" element={<div>Create Wallet</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Create Wallet')).toBeInTheDocument();
    });

    it('should handle transition from loading to unlocked', () => {
      setupWalletContext({
        authState: 'UNLOCKED',
        keychainExists: true,
        isLoading: true,
      });

      const { rerender } = renderWithRouter();

      expect(screen.queryByText('Create Wallet')).not.toBeInTheDocument();

      setupWalletContext({
        authState: 'UNLOCKED',
        keychainExists: true,
        isLoading: false,
      });

      rerender(
        <MemoryRouter initialEntries={['/keychain/setup/create-mnemonic']}>
          <Routes>
            <Route element={<KeychainOpenOrNew />}>
              <Route path="/keychain/setup/create-mnemonic" element={<div>Create Wallet</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Create Wallet')).toBeInTheDocument();
    });
  });
});
