import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useWallet } from '@/contexts/wallet-context';
import { getIdentityMismatchError } from '@/platform/provider/requestIdentity';
import { getProviderSigningService, type ProviderSigningReview } from '@/services/providerSigningService';

/** The popup reads a background review and sends only its bound decision. */
export function useProviderSigningRequest<K extends ProviderSigningReview['kind']>(kind: K) {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('requestId');
  const { activeAddress, activeWallet, isLoading: walletLoading } = useWallet();
  type Review = Extract<ProviderSigningReview, { kind: K }>;
  interface LoadScope {
    requestId: string;
    kind: K;
    cancelled: boolean;
    pending: boolean;
    reviewKey: string | null;
    operation?: Promise<void>;
  }
  const scopeRef = useRef<LoadScope | null>(null);
  const [loaded, setLoaded] = useState<{
    requestId: string; kind: K;
    review: Review | null;
    error: string | null;
    refreshError: string | null;
    pending: boolean;
    retrying: boolean;
  } | null>(null);
  // A route change is loading immediately; it cannot reuse the previous
  // request's review while the new service call is outstanding.
  const current = loaded?.requestId === requestId && loaded.kind === kind ? loaded : null;
  const loadedReview = current?.review ?? null;
  // Policy is still checked in the background at execution. This guard also keeps
  // an already loaded review from being labelled or calculated for a different wallet.
  const identityError = loadedReview && !walletLoading
    ? getIdentityMismatchError(loadedReview.request, activeAddress?.address, activeWallet?.id)
    : null;
  const review = walletLoading || identityError ? null : loadedReview;
  const isLoading = !!requestId && (walletLoading || !current || (current.pending && !current.review));
  const isRefreshing = current?.pending === true && current.retrying;
  const error = requestId ? identityError ?? current?.error ?? null : 'No signing request ID provided';
  const refreshError = current?.refreshError ?? null;

  const loadReview = useCallback(async (scope: LoadScope, retrying: boolean) => {
    // Invalidate approval synchronously, before React paints the disabled button.
    scope.pending = true;
    scope.reviewKey = null;
    setLoaded(previous => ({
      requestId: scope.requestId, kind: scope.kind,
      review: previous?.requestId === scope.requestId && previous.kind === scope.kind ? previous.review : null,
      error: null, refreshError: null, pending: true, retrying,
    }));
    try {
      // Re-run background verification. Failed evidence lookups are retried; successful
      // ledger, block-height and fee facts retain their existing short-lived caches.
      const result = await getProviderSigningService().getReview(scope.requestId);
      if (result.kind !== scope.kind) throw new Error('This request belongs to a different approval screen');
      if (scope.cancelled || scopeRef.current !== scope) return;
      scope.pending = false;
      scope.reviewKey = result.reviewKey;
      setLoaded({ requestId: scope.requestId, kind: scope.kind, review: result as Review,
        error: null, refreshError: null, pending: false, retrying: false });
    } catch (failure) {
      if (scope.cancelled || scopeRef.current !== scope) return;
      scope.pending = false;
      const message = failure instanceof Error ? failure.message : 'Unable to load signing request';
      setLoaded(previous => {
        const previousReview = previous?.requestId === scope.requestId && previous.kind === scope.kind
          ? previous.review : null;
        return { requestId: scope.requestId, kind: scope.kind, review: previousReview,
          error: previousReview ? null : message, refreshError: previousReview ? message : null,
          pending: false, retrying: false };
      });
    }
  }, []);

  useEffect(() => {
    if (!requestId) return;
    const scope: LoadScope = { requestId, kind, cancelled: false, pending: false, reviewKey: null };
    scopeRef.current = scope;
    // Loading synchronizes an external review with this route and invalidates any old approval.
    // oxlint-disable-next-line react/set-state-in-effect
    scope.operation = loadReview(scope, false);
    return () => {
      scope.cancelled = true;
      if (scopeRef.current === scope) scopeRef.current = null;
    };
  }, [requestId, kind, loadReview]);

  const handleRetry = useCallback(async () => {
    const scope = scopeRef.current;
    if (!scope || scope.cancelled || scope.requestId !== requestId || scope.kind !== kind) {
      throw new Error('No signing request to verify');
    }
    if (scope.pending) return scope.operation;
    scope.operation = loadReview(scope, true);
    return scope.operation;
  }, [requestId, kind, loadReview]);

  const handleApprove = useCallback(async (risksAcknowledged = false) => {
    if (identityError) throw new Error(identityError);
    if (!requestId || !review) throw new Error('No reviewed signing request');
    const scope = scopeRef.current;
    if (scope?.pending) throw new Error('Verification is in progress. Wait before signing.');
    if (!scope || scope.cancelled || scope.requestId !== requestId || scope.kind !== kind
      || scope.reviewKey !== review.reviewKey) {
      throw new Error('Retry verification successfully before signing.');
    }
    await getProviderSigningService().approveAndSign(requestId, {
      reviewKey: review.reviewKey, risksAcknowledged,
    });
  }, [requestId, kind, review, identityError]);

  const handleCancel = useCallback(async () => {
    if (!requestId) return;
    const scope = scopeRef.current;
    await getProviderSigningService().reject(requestId);
    if (!scope || scopeRef.current !== scope) return;
    scope.cancelled = true;
    scope.pending = false;
    scope.reviewKey = null;
    setLoaded({ requestId, kind, review: null, error: 'Signing request cancelled',
      refreshError: null, pending: false, retrying: false });
  }, [requestId, kind]);

  return { review, requestId, isLoading, isRefreshing, error, refreshError,
    handleRetry, handleApprove, handleCancel };
}
