import './setup';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  beginSignFlow,
  computeRequestKey,
  signFlowStorage,
} from '@/platform/provider/signFlow';
import { eventEmitterService } from '@/services/eventEmitterService';
import { runSignFlow, SIGN_FLOW_RECOVERY_POLL_MS } from '@/services/provider/signApproval';

const mocks = vi.hoisted(() => ({
  open: vi.fn(async () => 1),
  register: vi.fn(),
  unregister: vi.fn(),
  guard: vi.fn(),
}));
vi.mock('@/platform/auth/sessionManager', () => ({ getSessionGeneration: () => 0 }));
vi.mock('@/platform/fathom', () => ({ analytics: { track: vi.fn(async () => {}) } }));
vi.mock('@/platform/popup', () => ({ openExtensionPopup: mocks.open }));
vi.mock('@/platform/provider/rateLimiter', () => ({
  signPopupRateLimiter: { isAllowed: () => true },
}));
vi.mock('@/services/provider/signDelivery', () => ({
  assertSignDeliveryAuthorized: async () => mocks.guard,
}));
vi.mock('@/services/updateService', () => ({ getUpdateService: () => ({
  registerCriticalOperation: mocks.register,
  unregisterCriticalOperation: mocks.unregister,
}) }));

const identity = { walletId: 'wallet', address: 'address' };
const origin = 'https://signing.example';
const method = 'xcp_signMessage';
const params = ['message'];
const requestKey = computeRequestKey(origin, method, params, identity);
const requestId = 'test-signing-result';

beforeEach(() => {
  fakeBrowser.reset();
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  eventEmitterService.clear();
  vi.useRealTimers();
});

async function seedPending() {
  await beginSignFlow({
    ...identity, origin, requestKey, id: requestId, timestamp: Date.now(),
    kind: 'sign-message', message: 'message',
  });
}

// Both payloads pass the real store's validation. The second is a valid PSBT result attached
// to a message request's correlation key: the approval layer must reject this mismatch.
async function complete(wrongKind: boolean) {
  await signFlowStorage.update(requestId, entry => wrongKind
    ? { ...entry, status: 'completed', kind: 'sign-psbt', result: { signedPsbtHex: '70736274' } }
    : { ...entry, status: 'completed', kind: 'sign-message', result: { signature: 'stored-signature' } });
}

function request(map: (signature: string) => string) {
  return runSignFlow({
    origin, method, params, identity,
    approval: {
      kind: 'sign-message',
      analyticsEvent: 'message_signed', cancelMessage: 'Cancelled', timeoutMessage: 'Expired',
      mapResult: result => {
        expectTypeOf(result).toEqualTypeOf<{ signature: string }>();
        return map(result.signature);
      },
    },
    create: async () => { throw new Error('Should rejoin the stored request'); },
    approvalRoute: '#/requests/sign-message/approve',
  });
}

describe.each(['recovery', 'event', 'poll'] as const)('signing result delivered by %s', delivery => {
  it.each([false, true])('preserves the requested result kind (mismatch: %s)', async wrongKind => {
    await seedPending();
    if (delivery === 'recovery') await complete(wrongKind);
    const map = vi.fn((signature: string) => signature);
    const outcome = request(map).then(
      value => ({ value }),
      error => ({ error }),
    );

    if (delivery !== 'recovery') {
      await vi.waitFor(() => expect(mocks.register).toHaveBeenCalledOnce());
      await complete(wrongKind);
      if (delivery === 'event') {
        // Events wake the waiter; their payload is never used as the signed result.
        eventEmitterService.emit(`sign-message-complete-${requestId}`, { signature: 'event-payload' });
      } else {
        await vi.advanceTimersByTimeAsync(SIGN_FLOW_RECOVERY_POLL_MS);
      }
    }

    if (wrongKind) {
      expect(await outcome).toEqual({ error: expect.objectContaining({ message: 'Signing result kind does not match the request' }) });
      expect(map).not.toHaveBeenCalled();
    } else {
      expect(await outcome).toEqual({ value: 'stored-signature' });
      expect(map).toHaveBeenCalledExactlyOnceWith('stored-signature');
      expect(mocks.guard).toHaveBeenCalledOnce();
    }
    expect(mocks.open).not.toHaveBeenCalled();
    if (delivery !== 'recovery') {
      expect(mocks.unregister).toHaveBeenCalledExactlyOnceWith(`sign-message-${requestId}`);
      expect(vi.getTimerCount()).toBe(0);
    }
  });
});
