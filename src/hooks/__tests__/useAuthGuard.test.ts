import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuthGuard } from '../useAuthGuard';

// Mock the contexts and router
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: vi.fn(() => ({
    authState: 'LOCKED',
    wallets: []
  }))
}));

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
  useLocation: vi.fn(() => ({ pathname: '/dashboard' }))
}));

describe('useAuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return protection status when wallet is unlocked', async () => {
    const { useWallet } = await import('@/contexts/wallet-context');
    const { useNavigate } = await import('react-router-dom');
    const mockNavigate = vi.fn();
    
    vi.mocked(useWallet).mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    const { result } = renderHook(() => useAuthGuard());

    expect(result.current.isProtected).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should return protection status when wallet is locked but no navigation needed', async () => {
    const { useWallet } = await import('@/contexts/wallet-context');
    const { useNavigate } = await import('react-router-dom');
    const mockNavigate = vi.fn();
    
    vi.mocked(useWallet).mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    const { result } = renderHook(() => useAuthGuard());

    expect(result.current.isProtected).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should navigate to unlock screen when transitioning from UNLOCKED to LOCKED with wallets', async () => {
    const { useWallet } = await import('@/contexts/wallet-context');
    const { useNavigate, useLocation } = await import('react-router-dom');
    const mockNavigate = vi.fn();
    
    // Start with UNLOCKED state
    vi.mocked(useWallet).mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(useLocation).mockReturnValue({ pathname: '/dashboard' } as any);

    const { rerender } = renderHook(() => useAuthGuard());

    expect(mockNavigate).not.toHaveBeenCalled();

    // Change to LOCKED state
    vi.mocked(useWallet).mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);

    rerender();

    expect(mockNavigate).toHaveBeenCalledWith('/unlock-wallet', {
      replace: true,
      state: { from: '/dashboard' }
    });
  });

  it('should NOT navigate when starting with LOCKED state (no transition)', async () => {
    const { useWallet } = await import('@/contexts/wallet-context');
    const { useNavigate } = await import('react-router-dom');
    const mockNavigate = vi.fn();
    
    // Start with LOCKED state (no previous state)
    vi.mocked(useWallet).mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    renderHook(() => useAuthGuard());

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should NOT navigate when no wallets exist even on UNLOCKED -> LOCKED transition', async () => {
    const { useWallet } = await import('@/contexts/wallet-context');
    const { useNavigate } = await import('react-router-dom');
    const mockNavigate = vi.fn();
    
    // Start with UNLOCKED state but no wallets
    vi.mocked(useWallet).mockReturnValue({
      authState: 'UNLOCKED',
      wallets: []
    } as any);
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    const { rerender } = renderHook(() => useAuthGuard());

    // Change to LOCKED state
    vi.mocked(useWallet).mockReturnValue({
      authState: 'LOCKED',
      wallets: []
    } as any);

    rerender();

    // Should not navigate because no wallets exist
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should NOT navigate when transitioning from ONBOARDING_NEEDED to LOCKED', async () => {
    const { useWallet } = await import('@/contexts/wallet-context');
    const { useNavigate } = await import('react-router-dom');
    const mockNavigate = vi.fn();
    
    // Start with ONBOARDING_NEEDED state
    vi.mocked(useWallet).mockReturnValue({
      authState: 'ONBOARDING_NEEDED',
      wallets: []
    } as any);
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    const { rerender } = renderHook(() => useAuthGuard());

    // Change to LOCKED state
    vi.mocked(useWallet).mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);

    rerender();

    // Should not navigate because previous state was not UNLOCKED
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should NOT navigate when transitioning from LOCKED to UNLOCKED (unlock event)', async () => {
    const { useWallet } = await import('@/contexts/wallet-context');
    const { useNavigate } = await import('react-router-dom');
    const mockNavigate = vi.fn();
    
    // Start with LOCKED state
    vi.mocked(useWallet).mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    const { rerender } = renderHook(() => useAuthGuard());

    // Change to UNLOCKED state (unlock event)
    vi.mocked(useWallet).mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);

    rerender();

    // Should not navigate on unlock
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should preserve location path in navigation state', async () => {
    const { useWallet } = await import('@/contexts/wallet-context');
    const { useNavigate, useLocation } = await import('react-router-dom');
    const mockNavigate = vi.fn();
    
    const customLocation = { pathname: '/send-transaction/btc' };
    vi.mocked(useLocation).mockReturnValue(customLocation as any);

    // Start with UNLOCKED state
    vi.mocked(useWallet).mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    const { rerender } = renderHook(() => useAuthGuard());

    // Change to LOCKED state
    vi.mocked(useWallet).mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);

    rerender();

    expect(mockNavigate).toHaveBeenCalledWith('/unlock-wallet', {
      replace: true,
      state: { from: '/send-transaction/btc' }
    });
  });

  it('should handle rapid auth state changes correctly', async () => {
    const { useWallet } = await import('@/contexts/wallet-context');
    const { useNavigate } = await import('react-router-dom');
    const mockNavigate = vi.fn();
    
    // Start with UNLOCKED state
    vi.mocked(useWallet).mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    const { rerender } = renderHook(() => useAuthGuard());

    // Rapid changes: UNLOCKED -> LOCKED -> UNLOCKED -> LOCKED
    vi.mocked(useWallet).mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    rerender();

    expect(mockNavigate).toHaveBeenCalledTimes(1);

    vi.mocked(useWallet).mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    rerender();

    // Still only called once (no navigation on unlock)
    expect(mockNavigate).toHaveBeenCalledTimes(1);

    vi.mocked(useWallet).mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    rerender();

    // Called twice now (second lock transition)
    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });

  it('should handle wallet array changes without triggering navigation', async () => {
    const { useWallet } = await import('@/contexts/wallet-context');
    const { useNavigate } = await import('react-router-dom');
    const mockNavigate = vi.fn();
    
    // Start with UNLOCKED state and one wallet
    vi.mocked(useWallet).mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    const { rerender } = renderHook(() => useAuthGuard());

    // Change wallets array but keep auth state same
    vi.mocked(useWallet).mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [
        { id: 'wallet-1', name: 'Test Wallet' },
        { id: 'wallet-2', name: 'Another Wallet' }
      ]
    } as any);
    rerender();

    // Should not navigate when only wallets change
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should return correct protection status for all auth states', async () => {
    const { useWallet } = await import('@/contexts/wallet-context');
    const { useNavigate } = await import('react-router-dom');
    const mockNavigate = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    // Test ONBOARDING_NEEDED
    vi.mocked(useWallet).mockReturnValue({
      authState: 'ONBOARDING_NEEDED',
      wallets: []
    } as any);

    let { result, rerender } = renderHook(() => useAuthGuard());
    expect(result.current.isProtected).toBe(false);

    // Test LOCKED
    vi.mocked(useWallet).mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    rerender();
    expect(result.current.isProtected).toBe(false);

    // Test UNLOCKED
    vi.mocked(useWallet).mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    rerender();
    expect(result.current.isProtected).toBe(true);
  });

  it('should not interfere with normal component unmount', async () => {
    const { useWallet } = await import('@/contexts/wallet-context');
    const { useNavigate } = await import('react-router-dom');
    const mockNavigate = vi.fn();
    
    vi.mocked(useWallet).mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet-1', name: 'Test Wallet' }]
    } as any);
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    const { unmount } = renderHook(() => useAuthGuard());

    // Should unmount cleanly without errors
    expect(() => unmount()).not.toThrow();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});