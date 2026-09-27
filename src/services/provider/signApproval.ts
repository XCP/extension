/**
 * The approval side of a provider signing request: find or create its durable flow, open the
 * approval window once, and wait for the user's decision (or recover it after a worker restart)
 * before delivering the result to the site.
 */

import { generateRequestId } from '@/core/id';
import { supportsPairedContinuity } from '@/core/requestIdentity';
import { APPROVAL_WINDOW_FAILED_MESSAGE, PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { getSessionGeneration } from '@/platform/auth/sessionManager';
import { analytics } from '@/platform/fathom';
import { openExtensionPopup } from '@/platform/popup';
import { signPopupRateLimiter } from '@/platform/provider/rateLimiter';
import {
  type CompletedSignFlow,
  cancelPendingSignFlow,
  computeRequestKey,
  countOpenSignFlows,
  findActiveFlowByKey,
  getSignFlow,
  MAX_OPEN_SIGN_FLOWS_PER_ORIGIN,
  SIGN_FLOW_TTL_MS,
  type SignFlowEventPrefix,
} from '@/platform/provider/signFlow';
import { createWriteLock } from '@/platform/storage/mutex';
import { eventEmitterService } from '@/services/eventEmitterService';
import { expired, limitExceeded } from '@/services/provider/requestIntake';
import { assertSignDeliveryAuthorized, type SignDeliveryGuard } from '@/services/signDelivery';
import { getUpdateService } from '@/services/updateService';

/**
 * How often a waiting signing request re-reads its stored outcome. Only a fallback: the popup's
 * decision normally arrives as an event, and the stored outcome matters only when that event was
 * emitted in a worker that has since stopped. Each read is a storage call, so at the old 1.5s a
 * request left open for its full ten minutes made ~400 of them.
 */
export const SIGN_FLOW_RECOVERY_POLL_MS = 5_000;

/**
 * Drives the popup approval lifecycle for a dApp signing request: registers the
 * critical operation, resolves/rejects on the popup's complete/cancel events,
 * times out after 10 minutes, and cleans up listeners (and any per-request
 * state via onCleanup) on every exit path.
 */
function awaitSignApproval<T>(opts: {
  requestId: string;
  expiresAt: number;
  eventPrefix: SignFlowEventPrefix;
  analyticsEvent: string;
  cancelMessage: string;
  timeoutMessage: string;
  mapResult: (result: any) => T;
  authorizeDelivery: (flow: CompletedSignFlow) => Promise<SignDeliveryGuard>;
  onCleanup?: () => void;
}): Promise<T> {
  const updateService = getUpdateService();
  updateService.registerCriticalOperation(`${opts.eventPrefix}-${opts.requestId}`);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let completing = false;
    let timeout: ReturnType<typeof setTimeout>;
    let poll: ReturnType<typeof setInterval>;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      if (poll) clearInterval(poll);
      updateService.unregisterCriticalOperation(`${opts.eventPrefix}-${opts.requestId}`);
      eventEmitterService.off(`${opts.eventPrefix}-complete-${opts.requestId}`, handleComplete);
      eventEmitterService.off(`${opts.eventPrefix}-cancel-${opts.requestId}`, handleCancel);
      // Keep the terminal result until its original deadline. Removing it here
      // loses recovery when the worker stops after signing but before delivery.
      opts.onCleanup?.();
    };

    const handleFailure = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const handleComplete = async () => {
      if (settled || completing) return;
      completing = true;
      try {
        // The event is a wake-up signal. Only the persisted terminal outcome is
        // authoritative, including when this listener rejoins after a restart.
        const flow = await getSignFlow(opts.requestId);
        if (flow?.status !== 'completed') throw new Error('Signing result is unavailable or expired');
        const assertDelivery = await opts.authorizeDelivery(flow);
        if (settled) return;
        assertDelivery();
        const result = opts.mapResult(flow.result);
        settled = true;
        cleanup();
        void analytics.track(opts.analyticsEvent);
        resolve(result);
      } catch (error) {
        handleFailure(error);
      } finally {
        completing = false;
      }
    };

    const handleCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, opts.cancelMessage));
    };

    timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(expired(opts.timeoutMessage));
    }, Math.max(0, opts.expiresAt - Date.now()));

    eventEmitterService.on(`${opts.eventPrefix}-complete-${opts.requestId}`, handleComplete);
    eventEmitterService.on(`${opts.eventPrefix}-cancel-${opts.requestId}`, handleCancel);

    // Recovery path: if this worker is a fresh rejoin after a restart, the popup's
    // outcome is persisted in signFlow even though the original listener was lost.
    poll = setInterval(() => {
      if (settled) return;
      void getSignFlow(opts.requestId).then(async (flow) => {
        if (settled || !flow) return;
        if (flow.status === 'completed') await handleComplete();
        else if (flow.status === 'cancelled') handleCancel();
      }).catch(handleFailure);
    }, SIGN_FLOW_RECOVERY_POLL_MS);
  });
}

/**
 * Run a signing request through its durable flow: recover a completed result,
 * rejoin a pending one (no new popup), or begin a fresh flow. For the new-flow case, create
 * stores the per-type request and this opens its approval screen.
 */
const withFlowCreationLock = createWriteLock();

export async function runSignFlow<T>(args: {
  origin: string;
  method: string;
  params: unknown;
  identity: { walletId: string; address: string };
  pairedAddresses?: boolean;
  approval: {
    eventPrefix: SignFlowEventPrefix;
    analyticsEvent: string;
    cancelMessage: string;
    timeoutMessage: string;
    mapResult: (result: any) => T;
  };
  /** Store the per-type request under this id. */
  create: (requestId: string, requestKey: string) => Promise<void>;
  /** The approval screen's route, opened with `?requestId=`. */
  approvalRoute: string;
}): Promise<T> {
  const sessionGeneration = getSessionGeneration();
  const requestKey = computeRequestKey(args.origin, args.method, args.params, args.identity);
  // Lookup and creation are one command; concurrent identical calls join it.
  const flow = await withFlowCreationLock(async () => {
    const existing = await findActiveFlowByKey(requestKey, args.origin);
    if (existing) return existing;
    // Only a request that is about to open a popup is charged, and after all validation.
    if (await countOpenSignFlows(args.origin) >= MAX_OPEN_SIGN_FLOWS_PER_ORIGIN) {
      throw limitExceeded(
        `Too many signing requests are waiting for approval. Finish or cancel one before sending another (limit ${MAX_OPEN_SIGN_FLOWS_PER_ORIGIN}).`,
      );
    }
    if (!signPopupRateLimiter.isAllowed(args.origin)) {
      const resetTime = signPopupRateLimiter.getResetTime(args.origin);
      throw limitExceeded(`Signing request rate limit exceeded. Please wait ${Math.ceil(resetTime / 1000)} seconds.`);
    }
    const requestId = generateRequestId(args.approval.eventPrefix);
    await args.create(requestId, requestKey);
    try {
      await openExtensionPopup(`${args.approvalRoute}?requestId=${requestId}`);
    } catch (error) {
      // No window, no way to answer. Left pending, the flow would count against this origin's cap
      // for its full TTL and an identical retry would rejoin it instead of opening a window.
      console.error('[ProviderService] Could not open the signing approval window:', error);
      await cancelPendingSignFlow(requestId).catch(() => {});
      throw new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, APPROVAL_WINDOW_FAILED_MESSAGE);
    }
    const created = await getSignFlow(requestId);
    if (!created) throw new Error('Signing request could not be stored');
    return created;
  });

  const authorizeDelivery = (completed: CompletedSignFlow) =>
    assertSignDeliveryAuthorized(completed, args.pairedAddresses ?? false, sessionGeneration,
      supportsPairedContinuity(completed.kind));
  if (flow.status === 'completed') {
    const assertDelivery = await authorizeDelivery(flow);
    assertDelivery();
    void analytics.track(args.approval.analyticsEvent);
    return args.approval.mapResult(flow.result);
  }
  return awaitSignApproval({ ...args.approval, authorizeDelivery, requestId: flow.id,
    expiresAt: flow.timestamp + SIGN_FLOW_TTL_MS });
}
