import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConsolidateAndBroadcast } from '../useConsolidateAndBroadcast';
import { useWallet } from '@/contexts/wallet-context';
import { consolidateBareMultisig } from '@/utils/blockchain/bitcoin/bareMultisig';

// Mock webext-bridge
vi.mock('webext-bridge/popup', () => ({
  onMessage: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue({}),
}));

vi.mock('webext-bridge/background', () => ({
  onMessage: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue({}),
}));

// Mock the wallet service that uses webext-bridge
vi.mock('@/services/walletService', () => ({
  getWalletService: vi.fn(() => ({
    getWallets: vi.fn().mockResolvedValue([]),
    getActiveWallet: vi.fn().mockResolvedValue(null),
    getActiveAddress: vi.fn().mockResolvedValue(null),
  })),
}));

// Mock storage API
vi.mock('@/utils/storage/settingsStorage', () => ({
  getKeychainSettings: vi.fn().mockResolvedValue({}),
}));

// Mock dependencies
vi.mock('@/contexts/wallet-context');
vi.mock('@/utils/blockchain/bitcoin/bareMultisig', () => ({
  consolidateBareMultisig: vi.fn(),
  fetchConsolidationFeeConfig: vi.fn(),
  estimateConsolidationFees: vi.fn(),
  SERVICE_FEE_EXEMPTION_THRESHOLD: 500000
}));

describe('useConsolidateAndBroadcast', () => {
  // Note: This test is for a simplified version of the hook that only exposes
  // consolidateAndBroadcast and isProcessing, not the full UTXO management API
  const mockWalletContext = {
    activeWallet: { id: 'wallet1', name: 'Test Wallet' },
    activeAddress: { 
      address: 'bc1qtest123',
      path: "m/84'/0'/0'/0/0",
      addressFormat: 'P2WPKH' as const
    },
    signTransaction: vi.fn(),
    broadcastTransaction: vi.fn(),
    getPrivateKey: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Make sure broadcastTransaction mock returns the expected result
    mockWalletContext.broadcastTransaction.mockResolvedValue({ txid: 'abc123' });
    
    vi.mocked(useWallet).mockReturnValue(mockWalletContext as any);
    vi.mocked(consolidateBareMultisig).mockResolvedValue('0x123signed');
    vi.mocked(mockWalletContext.getPrivateKey).mockResolvedValue({ 
      key: 'L1234567890',
      compressed: true 
    });
  });

  describe('Initial State', () => {
    it('should have initial state', () => {
      const { result } = renderHook(() => useConsolidateAndBroadcast());

      expect(result.current.isProcessing).toBe(false);
      expect(typeof result.current.consolidateAndBroadcast).toBe('function');
    });

    it('should throw error when wallet context is not available', async () => {
      vi.mocked(useWallet).mockReturnValue({
        activeWallet: null,
        activeAddress: null
      } as any);

      const { result } = renderHook(() => useConsolidateAndBroadcast());

      await expect(result.current.consolidateAndBroadcast(30)).rejects.toThrow('Wallet not properly initialized');
    });
  });

  describe('Consolidation and Broadcasting', () => {
    it('should consolidate and broadcast transaction', async () => {
      const { result } = renderHook(() => useConsolidateAndBroadcast());

      await act(async () => {
        const txResult = await result.current.consolidateAndBroadcast(30, 'bc1qdestination');
        expect(txResult.txid).toBe('abc123');
      });

      expect(consolidateBareMultisig).toHaveBeenCalled();
      expect(mockWalletContext.broadcastTransaction).toHaveBeenCalledWith('0x123signed');
    });

    it('should handle consolidation error', async () => {
      const error = new Error('Failed to consolidate');
      vi.mocked(consolidateBareMultisig).mockRejectedValue(error);

      const { result } = renderHook(() => useConsolidateAndBroadcast());

      await expect(
        act(async () => {
          await result.current.consolidateAndBroadcast(30);
        })
      ).rejects.toThrow('Failed to consolidate');
    });

    it('should set isProcessing during operation', async () => {
      // Add a delay to the consolidation to simulate async work
      vi.mocked(consolidateBareMultisig).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return '0x123signed';
      });
      
      const { result } = renderHook(() => useConsolidateAndBroadcast());

      expect(result.current.isProcessing).toBe(false);

      // Start the operation without using act() initially to check processing state
      const operationPromise = result.current.consolidateAndBroadcast(30);
      
      // Wait a small amount for the state update to propagate
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      expect(result.current.isProcessing).toBe(true);

      // Wait for the operation to complete
      await act(async () => {
        await operationPromise;
      });

      expect(result.current.isProcessing).toBe(false);
    });

    it('should use destination address if provided', async () => {
      const { result } = renderHook(() => useConsolidateAndBroadcast());
      
      // Ensure the hook is initialized properly
      expect(result.current).toBeTruthy();
      expect(result.current.consolidateAndBroadcast).toBeInstanceOf(Function);

      await act(async () => {
        await result.current.consolidateAndBroadcast(30, 'bc1qdifferent');
      });

      expect(consolidateBareMultisig).toHaveBeenCalledWith(
        expect.any(String),
        'bc1qtest123',
        30,
        'bc1qdifferent',
        expect.objectContaining({
          includeStamps: false
        })
      );
    });
  });
});