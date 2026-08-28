/**
 * Approve Connection Page Tests
 *
 * Tests the loading state handling to prevent premature redirects.
 * This test would have caught the bug where the page redirected before
 * the wallet context finished loading.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const approvalMocks = vi.hoisted(() => ({
  getCurrentApproval: vi.fn(),
  getPairedAddresses: vi.fn(),
  resolveApproval: vi.fn(),
  rejectApproval: vi.fn(),
}));

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

// Mock wallet service imported by the optional paired-address consent path.
vi.mock('@/services/walletService', () => ({
  getWalletService: () => ({
    getPairedAddresses: approvalMocks.getPairedAddresses,
  }),
}));

// Mock the approval service
vi.mock('@/services/approvalService', () => ({
  getApprovalService: () => ({
    resolveApproval: approvalMocks.resolveApproval,
    rejectApproval: approvalMocks.rejectApproval,
    getCurrentApproval: approvalMocks.getCurrentApproval,
  }),
}));

// Create mock navigate function
const mockNavigate = vi.fn();

// Mock react-router's useNavigate
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  };
});

import { useWallet } from '@/contexts/wallet-context';
// Now import the component and mocked dependencies
import ApproveConnection from '../approve';

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
    approvalMocks.getCurrentApproval.mockReturnValue(null);
    approvalMocks.getPairedAddresses.mockResolvedValue(null);
    approvalMocks.resolveApproval.mockResolvedValue(true);
    approvalMocks.rejectApproval.mockResolvedValue(true);
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
      <MemoryRouter initialEntries={[`/requests/connect/approve${searchParams}`]}>
        <Routes>
          <Route path="/requests/connect/approve" element={<ApproveConnection />} />
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

    it('grants requested paired addresses without an opt-in the user can miss', async () => {
      setupWalletContext({
        activeWallet: {
          id: 'test-wallet',
          type: 'mnemonic',
          addressFormat: 'p2wpkh',
        } as any,
        activeAddress: { address: 'bc1qtest123' },
        isLoading: false,
      });
      approvalMocks.getCurrentApproval.mockReturnValue({
        id: 'test-123',
        params: [{
          capabilities: { pairedAddresses: true },
          address: 'bc1qtest123',
          walletId: 'test-wallet',
        }],
      });
      approvalMocks.getPairedAddresses.mockResolvedValue({
        legacy: { address: '1legacy', pubKey: '02aa', path: "m/44'/0'/0'/0/0", name: 'Legacy', format: 'p2pkh', type: 'p2pkh' },
        segwit: { address: 'bc1qsegwit', pubKey: '02bb', path: "m/84'/0'/0'/0/0", name: 'SegWit', format: 'p2wpkh', type: 'p2wpkh' },
      });

      renderWithRouter();

      // Both addresses are named in the request itself, not hidden behind a checkbox below the fold.
      expect(await screen.findByText('1leg...gacy')).toBeInTheDocument();
      expect(screen.getByText('bc1q...gwit')).toBeInTheDocument();
      expect(screen.getByText('View your wallet addresses')).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /connect both/i })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole('button', { name: /connect both/i }));
      await waitFor(() => {
        expect(approvalMocks.resolveApproval).toHaveBeenCalledWith('test-123', {
          approved: true,
          updatedParams: { pairedAddresses: true },
        });
      });
    });

    it('falls back to single-address consent when paired addresses cannot be loaded', async () => {
      setupWalletContext({
        activeWallet: {
          id: 'test-wallet',
          type: 'mnemonic',
          addressFormat: 'p2wpkh',
        } as any,
        activeAddress: { address: 'bc1qtest123' },
        isLoading: false,
      });
      approvalMocks.getCurrentApproval.mockReturnValue({
        id: 'test-123',
        params: [{
          capabilities: { pairedAddresses: true },
          address: 'bc1qtest123',
          walletId: 'test-wallet',
        }],
      });
      approvalMocks.getPairedAddresses.mockRejectedValue(new Error('locked'));

      renderWithRouter();

      expect(await screen.findByText(/Paired addresses are unavailable/i)).toBeInTheDocument();
      expect(screen.getByText('View your wallet address')).toBeInTheDocument();
      const connect = screen.getByRole('button', { name: /^connect$/i });
      expect(connect).toBeEnabled();
      fireEvent.click(connect);
      await waitFor(() => {
        expect(approvalMocks.resolveApproval).toHaveBeenCalledWith('test-123', {
          approved: true,
          updatedParams: { pairedAddresses: false },
        });
      });
    });

    it('uses ordinary single-address consent when the requested account cannot pair', async () => {
      setupWalletContext({
        activeWallet: {
          id: 'test-wallet',
          type: 'mnemonic',
          addressFormat: 'p2tr',
        } as any,
        activeAddress: { address: 'bc1ptest123' },
        isLoading: false,
      });
      approvalMocks.getCurrentApproval.mockReturnValue({
        id: 'test-123',
        params: [{
          capabilities: { pairedAddresses: true },
          address: 'bc1ptest123',
          walletId: 'test-wallet',
        }],
      });

      renderWithRouter();

      expect(await screen.findByText('View your wallet address')).toBeInTheDocument();
      expect(screen.queryByText(/Paired addresses are unavailable/i)).not.toBeInTheDocument();
      expect(approvalMocks.getPairedAddresses).not.toHaveBeenCalled();
      const connect = screen.getByRole('button', { name: /^connect$/i });
      fireEvent.click(connect);
      await waitFor(() => {
        expect(approvalMocks.resolveApproval).toHaveBeenCalledWith('test-123', {
          approved: true,
          updatedParams: { pairedAddresses: false },
        });
      });
    });

    it('blocks approval if the active wallet identity changed', async () => {
      setupWalletContext({
        activeWallet: { id: 'different-wallet' },
        activeAddress: { address: 'bc1qdifferent' },
        isLoading: false,
      });
      approvalMocks.getCurrentApproval.mockReturnValue({
        id: 'test-123',
        params: [{
          capabilities: { pairedAddresses: true },
          address: 'bc1qtest123',
          walletId: 'test-wallet',
        }],
      });

      renderWithRouter();

      expect(await screen.findByText(/active address changed/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /connect/i })).toBeDisabled();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
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
        <MemoryRouter initialEntries={['/requests/connect/approve?origin=https://test.example.com&requestId=test-123']}>
          <Routes>
            <Route path="/requests/connect/approve" element={<ApproveConnection />} />
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
        <MemoryRouter initialEntries={['/requests/connect/approve?origin=https://test.example.com&requestId=test-123']}>
          <Routes>
            <Route path="/requests/connect/approve" element={<ApproveConnection />} />
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
