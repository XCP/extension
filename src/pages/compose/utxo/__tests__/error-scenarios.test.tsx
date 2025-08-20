import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ComposeUtxoAttach } from '../attach/page';
import { ComposeUtxoMove } from '../move/page';
import { ComposeUtxoDetach } from '../detach/page';

// Mock contexts
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: 'bc1qtest123' },
    activeWallet: { name: 'Test Wallet', id: 'wallet1' },
    isWalletLocked: vi.fn().mockResolvedValue(false),
    signTransaction: vi.fn(),
    unlockWallet: vi.fn()
  })
}));

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { showHelpText: false }
  })
}));

vi.mock('@/contexts/composer-context', () => {
  const mockComposer = {
    state: { 
      step: 'form',
      formData: null,
      apiResponse: null,
      error: null
    },
    setFormData: vi.fn(),
    composeTransaction: vi.fn(),
    sign: vi.fn(),
    broadcast: vi.fn(),
    reset: vi.fn(),
    revertToForm: vi.fn(),
    setError: vi.fn(),
    clearError: vi.fn()
  };
  
  return {
    useComposer: () => mockComposer
  };
});

// Mock hooks
vi.mock('@/hooks/useAssetDetails', () => ({
  useAssetDetails: () => ({
    data: {
      assetInfo: {
        asset_longname: null,
        description: 'Test Token',
        divisible: true,
        locked: false
      },
      availableBalance: '100'
    }
  })
}));

// Mock API functions
vi.mock('@/utils/blockchain/counterparty', () => ({
  fetchUtxoBalances: vi.fn().mockResolvedValue({
    result: [{ asset: 'TESTTOKEN', quantity_normalized: '100' }]
  }),
  composeAttach: vi.fn(),
  composeMove: vi.fn(),
  composeDetach: vi.fn(),
  getAttachEstimateXcpFee: vi.fn().mockResolvedValue(0.5),
  broadcastTransaction: vi.fn()
}));

describe('UTXO Error Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Attach Operation Errors', () => {
    it('should handle insufficient XCP funds error', async () => {
      const { composeAttach } = await import('@/utils/blockchain/counterparty');
      (composeAttach as any).mockRejectedValueOnce({
        response: {
          data: { error: "['insufficient funds for transfer']" }
        }
      });

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/compose/utxo/attach/TESTTOKEN']}>
          <Routes>
            <Route path="/compose/utxo/attach/:asset" element={<ComposeUtxoAttach />} />
          </Routes>
        </MemoryRouter>
      );

      // Fill form
      const amountInput = await screen.findByLabelText(/Amount/i);
      await user.type(amountInput, '1000');
      
      const continueButton = screen.getByRole('button', { name: /Continue/i });
      await user.click(continueButton);

      // Should show error
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/insufficient funds/i)).toBeInTheDocument();
      });

      // Form should remain visible
      expect(amountInput).toBeInTheDocument();
    });

    it('should handle missing asset parameter', () => {
      render(
        <MemoryRouter initialEntries={['/compose/utxo/attach/']}>
          <Routes>
            <Route path="/compose/utxo/attach/" element={<ComposeUtxoAttach />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('No asset specified')).toBeInTheDocument();
    });

    it('should handle API network error', async () => {
      const { composeAttach } = await import('@/utils/blockchain/counterparty');
      (composeAttach as any).mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/compose/utxo/attach/XCP']}>
          <Routes>
            <Route path="/compose/utxo/attach/:asset" element={<ComposeUtxoAttach />} />
          </Routes>
        </MemoryRouter>
      );

      const amountInput = await screen.findByLabelText(/Amount/i);
      await user.type(amountInput, '10');
      
      const continueButton = screen.getByRole('button', { name: /Continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      });
    });

    it('should prevent submission with invalid amount formats', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/compose/utxo/attach/TESTTOKEN']}>
          <Routes>
            <Route path="/compose/utxo/attach/:asset" element={<ComposeUtxoAttach />} />
          </Routes>
        </MemoryRouter>
      );

      const amountInput = await screen.findByLabelText(/Amount/i);
      const continueButton = screen.getByRole('button', { name: /Continue/i });

      // Test various invalid inputs
      const invalidInputs = ['abc', '!@#', '1.2.3', ''];

      for (const input of invalidInputs) {
        await user.clear(amountInput);
        if (input) await user.type(amountInput, input);
        expect(continueButton).toBeDisabled();
      }
    });
  });

  describe('Move Operation Errors', () => {
    it('should handle missing UTXO parameter', () => {
      render(
        <MemoryRouter initialEntries={['/compose/utxo/move/']}>
          <Routes>
            <Route path="/compose/utxo/move/" element={<ComposeUtxoMove />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('No UTXO specified')).toBeInTheDocument();
    });

    it('should handle invalid UTXO format', async () => {
      const { composeMove } = await import('@/utils/blockchain/counterparty');
      (composeMove as any).mockRejectedValueOnce({
        response: {
          data: { error: "Invalid UTXO format" }
        }
      });

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/compose/utxo/move/invalid-utxo']}>
          <Routes>
            <Route path="/compose/utxo/move/:txid" element={<ComposeUtxoMove />} />
          </Routes>
        </MemoryRouter>
      );

      const destinationInput = await screen.findByLabelText(/Destination/i);
      await user.type(destinationInput, 'bc1qdest123');
      
      const continueButton = screen.getByRole('button', { name: /Continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('should handle UTXO not found error', async () => {
      const { fetchUtxoBalances } = await import('@/utils/blockchain/counterparty');
      (fetchUtxoBalances as any).mockRejectedValueOnce({
        response: {
          status: 404,
          data: { error: "UTXO not found" }
        }
      });

      render(
        <MemoryRouter initialEntries={['/compose/utxo/move/notfound123:0']}>
          <Routes>
            <Route path="/compose/utxo/move/:txid" element={<ComposeUtxoMove />} />
          </Routes>
        </MemoryRouter>
      );

      // Should still render form but with 0 balances
      await waitFor(() => {
        expect(screen.getByText('0 Balances')).toBeInTheDocument();
      });
    });

    it('should handle destination validation errors', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/compose/utxo/move/abc123:0']}>
          <Routes>
            <Route path="/compose/utxo/move/:txid" element={<ComposeUtxoMove />} />
          </Routes>
        </MemoryRouter>
      );

      const destinationInput = await screen.findByLabelText(/Destination/i);
      const continueButton = screen.getByRole('button', { name: /Continue/i });

      // Invalid addresses should keep button disabled
      const invalidAddresses = [
        'notanaddress',
        '123456',
        'bc1qinvalid!@#',
        ''
      ];

      for (const address of invalidAddresses) {
        await user.clear(destinationInput);
        if (address) await user.type(destinationInput, address);
        expect(continueButton).toBeDisabled();
      }
    });
  });

  describe('Detach Operation Errors', () => {
    it('should handle UTXO with no balances', async () => {
      const { fetchUtxoBalances } = await import('@/utils/blockchain/counterparty');
      (fetchUtxoBalances as any).mockResolvedValueOnce({
        result: []
      });

      render(
        <MemoryRouter initialEntries={['/compose/utxo/detach/empty123:0']}>
          <Routes>
            <Route path="/compose/utxo/detach/:txid" element={<ComposeUtxoDetach />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('0 Balances')).toBeInTheDocument();
      });

      // Should still allow detach operation
      const continueButton = screen.getByRole('button', { name: /Continue/i });
      expect(continueButton).toBeEnabled();
    });

    it('should handle server error during detach', async () => {
      const { composeDetach } = await import('@/utils/blockchain/counterparty');
      (composeDetach as any).mockRejectedValueOnce({
        response: {
          status: 500,
          data: { error: "Internal server error" }
        }
      });

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/compose/utxo/detach/test123:0']}>
          <Routes>
            <Route path="/compose/utxo/detach/:txid" element={<ComposeUtxoDetach />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => screen.getByRole('button', { name: /Continue/i }));
      
      const continueButton = screen.getByRole('button', { name: /Continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/Internal server error/i)).toBeInTheDocument();
      });
    });

    it('should handle invalid optional destination gracefully', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/compose/utxo/detach/test123:0']}>
          <Routes>
            <Route path="/compose/utxo/detach/:txid" element={<ComposeUtxoDetach />} />
          </Routes>
        </MemoryRouter>
      );

      const destinationInput = await screen.findByLabelText(/Destination \(Optional\)/i);
      const continueButton = screen.getByRole('button', { name: /Continue/i });

      // Enter invalid address
      await user.type(destinationInput, 'invalid-address');
      
      // Button should be disabled with invalid address
      expect(continueButton).toBeDisabled();

      // Clear the field
      await user.clear(destinationInput);
      
      // Button should be enabled again since destination is optional
      await waitFor(() => {
        expect(continueButton).toBeEnabled();
      });
    });
  });

  describe('Review Screen Error Handling', () => {
    it('should handle null apiResponse gracefully', async () => {
      const mockComposer = {
        state: { 
          step: 'review',
          apiResponse: null,
          error: 'Transaction composition failed'
        },
        revertToForm: vi.fn()
      };

      vi.mocked(await import('@/contexts/composer-context')).useComposer.mockReturnValueOnce(mockComposer as any);

      render(
        <MemoryRouter initialEntries={['/compose/utxo/attach/XCP']}>
          <Routes>
            <Route path="/compose/utxo/attach/:asset" element={<ComposeUtxoAttach />} />
          </Routes>
        </MemoryRouter>
      );

      // Should show fallback error UI
      await waitFor(() => {
        expect(screen.getByText(/Unable to review transaction/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
      });
    });

    it('should handle wallet lock during signing', async () => {
      const { useWallet } = await import('@/contexts/wallet-context');
      (useWallet as any).mockReturnValueOnce({
        activeAddress: { address: 'bc1qtest123' },
        activeWallet: { name: 'Test Wallet', id: 'wallet1' },
        isWalletLocked: vi.fn().mockResolvedValue(true),
        signTransaction: vi.fn().mockRejectedValue(new Error('Wallet is locked')),
        unlockWallet: vi.fn()
      });

      const mockComposer = {
        state: { 
          step: 'review',
          apiResponse: {
            result: {
              rawtransaction: 'hex123',
              params: { source: 'bc1qtest123' }
            }
          }
        },
        sign: vi.fn()
      };

      vi.mocked(await import('@/contexts/composer-context')).useComposer.mockReturnValueOnce(mockComposer as any);

      render(
        <MemoryRouter initialEntries={['/compose/utxo/attach/XCP']}>
          <Routes>
            <Route path="/compose/utxo/attach/:asset" element={<ComposeUtxoAttach />} />
          </Routes>
        </MemoryRouter>
      );

      // Should show authorization modal
      await waitFor(() => {
        expect(screen.getByText(/Authorization Required/i)).toBeInTheDocument();
      });
    });
  });
});