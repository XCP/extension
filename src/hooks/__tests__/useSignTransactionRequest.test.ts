import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSignTransactionRequest } from '../useSignTransactionRequest';

const mocks = vi.hoisted(() => ({
  getReview: vi.fn(), approveAndSign: vi.fn(), reject: vi.fn(),
  wallet: { activeAddress: { address: 'bound-address' }, activeWallet: { id: 'bound-wallet' }, isLoading: false },
}));
vi.mock('react-router', () => ({ useSearchParams: () => [new URLSearchParams('requestId=req-1')] }));
vi.mock('@/services/providerSigningService', () => ({ getProviderSigningService: () => mocks }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => mocks.wallet }));

const review = {
  kind: 'sign-transaction', reviewKey: 'review-digest',
  request: { id: 'req-1', address: 'bound-address', walletId: 'bound-wallet', rawTxHex: 'stored-hex' },
  decodedInfo: { fee: 1000 }, policy: { blocked: false, requiresAcknowledgement: false },
};

describe('useSignTransactionRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wallet = { activeAddress: { address: 'bound-address' }, activeWallet: { id: 'bound-wallet' }, isLoading: false };
    mocks.getReview.mockResolvedValue(review);
    mocks.approveAndSign.mockResolvedValue(undefined);
    mocks.reject.mockResolvedValue(undefined);
  });

  it('waits for wallet hydration and refuses to display a bound review for a different identity', async () => {
    mocks.wallet.isLoading = true;
    const { result, rerender } = renderHook(() => useSignTransactionRequest());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.request).toBeNull();
    await expect(result.current.handleApprove()).rejects.toThrow(/No reviewed/);
    mocks.wallet.isLoading = false;
    rerender();
    expect(result.current.request?.address).toBe('bound-address');
    mocks.wallet.activeAddress.address = 'different-address';
    rerender();
    expect(result.current.request).toBeNull();
    expect(result.current.decodedInfo).toBeNull();
    expect(result.current.error).toMatch(/active address changed/);
    await expect(result.current.handleApprove()).rejects.toThrow(/active address changed/);
    expect(mocks.approveAndSign).not.toHaveBeenCalled();
    expect(mocks.getReview).toHaveBeenCalledTimes(1);
  });

  it('submits only the reviewed decision and lets the background obtain the bytes and signer', async () => {
    const { result } = renderHook(() => useSignTransactionRequest());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.handleApprove(true));
    expect(mocks.approveAndSign).toHaveBeenCalledWith('req-1', {
      reviewKey: 'review-digest', risksAcknowledged: true,
    });
    await act(() => result.current.handleCancel());
    expect(mocks.reject).toHaveBeenCalledWith('req-1');
  });

  it('refuses a request loaded through the wrong approval route', async () => {
    mocks.getReview.mockResolvedValue({ ...review, kind: 'sign-message' });
    const { result } = renderHook(() => useSignTransactionRequest());
    await waitFor(() => expect(result.current.error).toMatch(/different approval screen/));
    expect(result.current.request).toBeNull();
    await expect(result.current.handleApprove()).rejects.toThrow(/No reviewed/);
    expect(mocks.approveAndSign).not.toHaveBeenCalled();
  });
});
