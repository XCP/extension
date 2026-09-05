import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderSigningReview } from '@/services/providerSigningService';
import { useProviderSigningRequest } from '../useProviderSigningRequest';

const mocks = vi.hoisted(() => ({
  requestId: 'req-1', getReview: vi.fn(), approveAndSign: vi.fn(), reject: vi.fn(),
  wallet: { activeAddress: { address: 'authorized-address' }, activeWallet: { id: 'authorized-wallet' }, isLoading: false },
}));
vi.mock('react-router', () => ({ useSearchParams: () => [new URLSearchParams({ requestId: mocks.requestId })] }));
vi.mock('@/services/providerSigningService', () => ({ getProviderSigningService: () => mocks }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => mocks.wallet }));

function review(reviewKey = 'original', id = 'req-1'): ProviderSigningReview {
  return {
    kind: 'sign-message', reviewKey,
    request: { id, kind: 'sign-message', status: 'pending', origin: 'https://example.test',
      address: 'authorized-address', walletId: 'authorized-wallet', timestamp: Date.now(),
      requestKey: 'request-key', message: 'The stored message' },
    policy: { blocked: false, requiresAcknowledgement: false, safeOwnChange: false },
  };
}

describe('provider verification retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestId = 'req-1';
    mocks.wallet = { activeAddress: { address: 'authorized-address' }, activeWallet: { id: 'authorized-wallet' }, isLoading: false };
    mocks.getReview.mockResolvedValue(review());
    mocks.approveAndSign.mockResolvedValue(undefined);
    mocks.reject.mockResolvedValue(undefined);
  });

  it('retries a failed initial load without retrying any signing command', async () => {
    mocks.getReview.mockRejectedValueOnce(new Error('Unable to reach the indexer'));
    const { result } = renderHook(() => useProviderSigningRequest('sign-message'));
    await waitFor(() => expect(result.current.error).toBe('Unable to reach the indexer'));

    await act(() => result.current.handleRetry());
    expect(result.current.review?.reviewKey).toBe('original');
    expect(result.current.error).toBeNull();
    expect(result.current.refreshError).toBeNull();
    expect(mocks.getReview).toHaveBeenCalledTimes(2);
    expect(mocks.approveAndSign).not.toHaveBeenCalled();
    expect(mocks.reject).not.toHaveBeenCalled();
  });

  it('keeps the old review visible but synchronously blocks approval until the new review arrives', async () => {
    const { result } = renderHook(() => useProviderSigningRequest('sign-message'));
    await waitFor(() => expect(result.current.review?.reviewKey).toBe('original'));
    const next = Promise.withResolvers<ProviderSigningReview>();
    mocks.getReview.mockReturnValueOnce(next.promise);
    let retry: Promise<void>;
    await act(async () => {
      retry = result.current.handleRetry();
      await expect(result.current.handleApprove()).rejects.toThrow('Verification is in progress');
    });
    expect(result.current.isRefreshing).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.review?.reviewKey).toBe('original');
    expect(mocks.approveAndSign).not.toHaveBeenCalled();

    await act(async () => { next.resolve(review('refreshed')); await retry; });
    expect(result.current.isRefreshing).toBe(false);
    await act(() => result.current.handleApprove(true));
    expect(mocks.approveAndSign).toHaveBeenCalledExactlyOnceWith('req-1', {
      reviewKey: 'refreshed', risksAcknowledged: true,
    });
  });

  it('retains a recoverable refresh error and refuses the old review after a failed retry', async () => {
    const { result } = renderHook(() => useProviderSigningRequest('sign-message'));
    await waitFor(() => expect(result.current.review).not.toBeNull());
    mocks.getReview.mockRejectedValueOnce(new Error('Asset verification is unavailable'));
    await act(() => result.current.handleRetry());
    expect(result.current.review?.reviewKey).toBe('original');
    expect(result.current.error).toBeNull();
    expect(result.current.refreshError).toBe('Asset verification is unavailable');
    expect(result.current.isRefreshing).toBe(false);
    await expect(result.current.handleApprove()).rejects.toThrow('Retry verification successfully');
    expect(mocks.approveAndSign).not.toHaveBeenCalled();

    mocks.getReview.mockResolvedValueOnce(review('recovered'));
    await act(() => result.current.handleRetry());
    expect(result.current.refreshError).toBeNull();
    await act(() => result.current.handleApprove());
    expect(mocks.approveAndSign).toHaveBeenCalledWith('req-1', {
      reviewKey: 'recovered', risksAcknowledged: false,
    });
  });

  it('coalesces repeated retry clicks into one outstanding verification call', async () => {
    const { result } = renderHook(() => useProviderSigningRequest('sign-message'));
    await waitFor(() => expect(result.current.review).not.toBeNull());
    const next = Promise.withResolvers<ProviderSigningReview>();
    mocks.getReview.mockReturnValueOnce(next.promise);
    let retries: Promise<void[]>;
    act(() => { retries = Promise.all([result.current.handleRetry(), result.current.handleRetry()]); });
    expect(mocks.getReview).toHaveBeenCalledTimes(2);
    await act(async () => { next.resolve(review('refreshed')); await retries; });
    expect(result.current.review?.reviewKey).toBe('refreshed');
  });

  it('ignores an old route retry after navigating to a different request', async () => {
    const { result, rerender } = renderHook(() => useProviderSigningRequest('sign-message'));
    await waitFor(() => expect(result.current.review).not.toBeNull());
    const oldRetry = Promise.withResolvers<ProviderSigningReview>();
    mocks.getReview.mockReturnValueOnce(oldRetry.promise);
    let retry: Promise<void>;
    act(() => { retry = result.current.handleRetry(); });
    const newLoad = Promise.withResolvers<ProviderSigningReview>();
    mocks.getReview.mockReturnValueOnce(newLoad.promise);
    mocks.requestId = 'req-2';
    rerender();
    expect(result.current.review).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await act(async () => { oldRetry.resolve(review('stale-route')); await retry; });
    expect(result.current.review).toBeNull();
    await act(async () => { newLoad.resolve(review('new-route', 'req-2')); await newLoad.promise; });
    await act(() => result.current.handleApprove());
    expect(mocks.approveAndSign).toHaveBeenCalledExactlyOnceWith('req-2', {
      reviewKey: 'new-route', risksAcknowledged: false,
    });
  });

  it('does not resurrect an approval from a late review after cancellation', async () => {
    const { result } = renderHook(() => useProviderSigningRequest('sign-message'));
    await waitFor(() => expect(result.current.review).not.toBeNull());
    const next = Promise.withResolvers<ProviderSigningReview>();
    mocks.getReview.mockReturnValueOnce(next.promise);
    let retry: Promise<void>;
    act(() => { retry = result.current.handleRetry(); });
    await act(() => result.current.handleCancel());
    await act(async () => { next.resolve(review('late')); await retry; });
    expect(result.current.review).toBeNull();
    expect(result.current.error).toBe('Signing request cancelled');
    await expect(result.current.handleApprove()).rejects.toThrow('No reviewed signing request');
    expect(mocks.approveAndSign).not.toHaveBeenCalled();
    expect(mocks.reject).toHaveBeenCalledExactlyOnceWith('req-1');
  });

  it.each(['address', 'wallet'] as const)('hides a loaded review immediately when the active %s changes', async changed => {
    const { result, rerender } = renderHook(() => useProviderSigningRequest('sign-message'));
    await waitFor(() => expect(result.current.review?.reviewKey).toBe('original'));
    if (changed === 'address') mocks.wallet.activeAddress.address = 'different-address';
    else mocks.wallet.activeWallet.id = 'different-wallet';
    rerender();

    expect(result.current.review).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toMatch(/active address changed/);
    await expect(result.current.handleApprove()).rejects.toThrow(/active address changed/);
    expect(mocks.approveAndSign).not.toHaveBeenCalled();

    mocks.wallet.activeAddress.address = 'authorized-address';
    mocks.wallet.activeWallet.id = 'authorized-wallet';
    rerender();
    expect(result.current.error).toBeNull();
    expect(result.current.review?.request.address).toBe('authorized-address');
    await act(() => result.current.handleApprove());
    expect(mocks.approveAndSign).toHaveBeenCalledExactlyOnceWith('req-1', {
      reviewKey: 'original', risksAcknowledged: false,
    });
  });

  it('does not expose a late review under a wallet selected while verification was pending', async () => {
    const pending = Promise.withResolvers<ProviderSigningReview>();
    mocks.getReview.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(() => useProviderSigningRequest('sign-message'));
    mocks.wallet.activeWallet.id = 'different-wallet';
    rerender();
    await act(async () => { pending.resolve(review()); await pending.promise; });

    expect(result.current.review).toBeNull();
    expect(result.current.error).toMatch(/active address changed/);
    await expect(result.current.handleApprove()).rejects.toThrow(/active address changed/);
    expect(mocks.approveAndSign).not.toHaveBeenCalled();
  });
});
