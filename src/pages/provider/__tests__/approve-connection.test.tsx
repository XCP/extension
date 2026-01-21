/**
 * Approve Connection Page Tests
 *
 * Tests the loading state handling to prevent premature redirects.
 * This test would have caught the bug where the page redirected before
 * the wallet context finished loading.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

// Mock webext-bridge before any imports that might use it
vi.mock('webext-bridge/popup', () => ({
  sendMessage: vi.fn(),
  onMessage: vi.fn(),
}));

// Mock the wallet context
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: vi.fn(),
}));

// Mock the header context
vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    setHeaderProps: vi.fn(),
  }),
}));

// Mock the approval service
vi.mock('@/services/approvalService', () => ({
  getApprovalService: () => ({
    resolveApproval: vi.fn(),
    rejectApproval: vi.fn(),
  }),
}));

// Create mock navigate function
const mockNavigate = vi.fn();

// Mock react-router-dom's useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  };
});

// Now import the component and mocked dependencies
import ApproveConnection from '../approve-connection';
import { useWallet } from '@/contexts/wallet-context';

// Type for our mock wallet context
interface MockWalletContext {
  activeWallet: { id: string } | null;
  activeAddress: { address: string } | null;
  isLoading: boolean;
}

describe('ApproveConnection', () => {
  const mockUseWallet = useWallet as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper to setup wallet context mock
   */
  const setupWalletContext = (context: MockWalletContext) => {
    mockUseWallet.mockReturnValue(context);
  };

  /**
   * Helper to render component with router and query params
   */
  const renderWithRouter = (searchParams = '?origin=https://test.example.com&requestId=test-123') => {
    return render(
      <MemoryRouter initialEntries={[`/provider/approve-connection${searchParams}`]}>
        <Routes>
          <Route path="/provider/approve-connection" element={<ApproveConnection />} />
          <Route path="/" element={<div>Root Page</div>} />
          <Route path="/index" element={<div>Index Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('Loading State - Critical Bug Prevention', () => {
    /**
     * This test catches the bug where the page would redirect before
     * the wallet context finished loading, causing the approval popup
     * to show the main wallet page instead of the approval UI.
     */
    it('should NOT redirect while wallet context is loading', () => {
      setupWalletContext({
        activeWallet: null,
        activeAddress: null,
        isLoading: true, // Still loading!
      });

      renderWithRouter();

      // Should NOT navigate while loading
      expect(mockNavigate).not.toHaveBeenCalled();

      // Should show loading indicator
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should show loading state when isLoading is true', () => {
      setupWalletContext({
        activeWallet: null,
        activeAddress: null,
        isLoading: true,
      });

      renderWithRouter();

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      // Should not show approval UI
      expect(screen.queryByText('Connect')).not.toBeInTheDocument();
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });

    it('should NOT show unlock message while loading', () => {
      setupWalletContext({
        activeWallet: null,
        activeAddress: null,
        isLoading: true,
      });

      renderWithRouter();

      // Should not show "unlock your wallet" message while loading
      expect(screen.queryByText(/unlock your wallet/i)).not.toBeInTheDocument();
    });
  });

  describe('After Loading Completes', () => {
    it('should redirect to root if no wallet after loading', () => {
      setupWalletContext({
        activeWallet: null,
        activeAddress: null,
        isLoading: false, // Loading complete
      });

      renderWithRouter();

      // NOW it should redirect
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('should show unlock message if no wallet/address after loading', () => {
      setupWalletContext({
        activeWallet: null,
        activeAddress: null,
        isLoading: false,
      });

      renderWithRouter();

      expect(screen.getByText(/unlock your wallet/i)).toBeInTheDocument();
    });

    it('should show approval UI when wallet is loaded and unlocked', () => {
      setupWalletContext({
        activeWallet: { id: 'test-wallet' },
        activeAddress: { address: 'bc1qtest123' },
        isLoading: false,
      });

      renderWithRouter();

      // Should NOT redirect
      expect(mockNavigate).not.toHaveBeenCalled();

      // Should show approval UI elements
      expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should display the origin domain in approval UI', () => {
      setupWalletContext({
        activeWallet: { id: 'test-wallet' },
        activeAddress: { address: 'bc1qtest123' },
        isLoading: false,
      });

      renderWithRouter('?origin=https://example.com&requestId=test-123');

      // Should show the domain (appears in both heading and full URL)
      const domainElements = screen.getAllByText(/example\.com/i);
      expect(domainElements.length).toBeGreaterThan(0);
    });
  });

  describe('State Transitions', () => {
    it('should handle transition from loading to loaded with wallet', () => {
      // Start with loading state
      setupWalletContext({
        activeWallet: null,
        activeAddress: null,
        isLoading: true,
      });

      const { rerender } = renderWithRouter();

      // Should show loading, not redirect
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();

      // Transition to loaded with wallet
      setupWalletContext({
        activeWallet: { id: 'test-wallet' },
        activeAddress: { address: 'bc1qtest123' },
        isLoading: false,
      });

      rerender(
        <MemoryRouter initialEntries={['/provider/approve-connection?origin=https://test.example.com&requestId=test-123']}>
          <Routes>
            <Route path="/provider/approve-connection" element={<ApproveConnection />} />
            <Route path="/" element={<div>Root Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      // Should now show approval UI
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
    });

    it('should handle transition from loading to loaded without wallet', () => {
      // Start with loading state
      setupWalletContext({
        activeWallet: null,
        activeAddress: null,
        isLoading: true,
      });

      const { rerender } = renderWithRouter();

      // Should show loading, not redirect
      expect(mockNavigate).not.toHaveBeenCalled();

      // Transition to loaded WITHOUT wallet
      setupWalletContext({
        activeWallet: null,
        activeAddress: null,
        isLoading: false,
      });

      rerender(
        <MemoryRouter initialEntries={['/provider/approve-connection?origin=https://test.example.com&requestId=test-123']}>
          <Routes>
            <Route path="/provider/approve-connection" element={<ApproveConnection />} />
            <Route path="/" element={<div>Root Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      // NOW should redirect
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing query params gracefully', () => {
      setupWalletContext({
        activeWallet: { id: 'test-wallet' },
        activeAddress: { address: 'bc1qtest123' },
        isLoading: false,
      });

      // No query params
      renderWithRouter('');

      // Should still render without crashing
      expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
    });

    it('should handle wallet but no address', () => {
      setupWalletContext({
        activeWallet: { id: 'test-wallet' },
        activeAddress: null, // No address
        isLoading: false,
      });

      renderWithRouter();

      // Should redirect since no address
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('should handle address but no wallet', () => {
      setupWalletContext({
        activeWallet: null, // No wallet
        activeAddress: { address: 'bc1qtest123' },
        isLoading: false,
      });

      renderWithRouter();

      // Should redirect since no wallet
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });
});
