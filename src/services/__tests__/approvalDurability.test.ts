/**
 * What survives a worker restart, and what is allowed to happen afterwards.
 *
 * MV3 can stop the background between opening an approval popup and the user clicking a button.
 * Each case here builds a second ApprovalService over the storage the first one wrote, which is
 * what a restart actually is: the same session storage, none of the memory.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/eventEmitterService', () => ({
  eventEmitterService: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

vi.mock('@/platform/fathom', () => ({
  sanitizePath: vi.fn((path: string) => path),
  analytics: { track: vi.fn().mockResolvedValue(undefined), page: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/platform/popup', () => ({
  openPopupWindow: vi.fn().mockResolvedValue({ id: 12345, close: vi.fn().mockResolvedValue(undefined) }),
  focusPopupWindow: vi.fn().mockResolvedValue(undefined),
}));

import type { ApprovalRequestOptions } from '@/types/provider';
import { ApprovalService } from '../approvalService';

/** Session storage that actually stores, so a second worker can read what the first one wrote. */
let session: Record<string, unknown> = {};

beforeEach(() => {
  vi.clearAllMocks();
  session = {};

  global.chrome = {
    storage: {
      session: {
        get: vi.fn(async (key: string) => (key in session ? { [key]: session[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(session, items);
        }),
      },
    },
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
    windows: {
      create: vi.fn().mockResolvedValue({ id: 12345 }),
      remove: vi.fn().mockResolvedValue(undefined),
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { id: 'test-extension-id', getURL: vi.fn((path: string) => path) },
  } as any;
});

const CONNECT_REQUEST: ApprovalRequestOptions = {
  id: 'request-1',
  origin: 'https://example.com',
  method: 'xcp_requestAccounts',
  type: 'connection',
  params: [{ capabilities: { pairedAddresses: false }, address: 'bc1qexample', walletId: 'wallet-1' }],
  metadata: { domain: 'example.com', title: 'Connection Request', description: 'Connect' },
};

/** Ask for approval without awaiting the answer, the way a caller that is about to die does. */
async function ask(service: ApprovalService, options = CONNECT_REQUEST): Promise<void> {
  service.requestApproval(options).catch(() => {
    // The caller is gone in these tests; its rejection is the premise, not a failure.
  });
  // Let requestApproval reach its first await, by which point the request is stored.
  await vi.waitFor(() => expect(service.hasPendingApproval()).toBe(true));
}

/** The worker stops and a new one starts: fresh instance, same storage. */
async function restart(): Promise<ApprovalService> {
  const service = new ApprovalService();
  await service.initialize();
  return service;
}

describe('approval durability', () => {
  it('keeps the request when the worker that opened it is gone', async () => {
    const first = new ApprovalService();
    await first.initialize();
    await ask(first);

    const second = await restart();

    expect(second.getCurrentApproval()).toMatchObject({
      id: 'request-1',
      origin: 'https://example.com',
      type: 'connection',
    });
  });

  it('honours the click on a restored connection, since the grant is what was asked for', async () => {
    const first = new ApprovalService();
    await first.initialize();
    await ask(first);

    const second = await restart();
    const grant = vi.fn().mockResolvedValue(undefined);
    second.registerCompletionHandler(grant);

    await expect(second.resolveApproval('request-1', { approved: true })).resolves.toBe(true);

    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'request-1', origin: 'https://example.com' }),
      expect.objectContaining({ approved: true })
    );
    expect(second.hasPendingApproval()).toBe(false);
  });

  it('refuses a restored request whose type cannot finish without its caller', async () => {
    const first = new ApprovalService();
    await first.initialize();
    await ask(first);

    // A worker with no completion handler registered — the state anything is in whose only product
    // is an artifact for a caller now gone.
    const second = await restart();

    // The request survives, so the screen still has something to show and refuse.
    expect(second.getCurrentApproval()).toMatchObject({ id: 'request-1', type: 'connection' });

    // Approving it completes nothing, and false tells the screen to say so rather than close on a
    // click that did nothing.
    await expect(second.resolveApproval('request-1', { approved: true })).resolves.toBe(false);
    expect(second.hasPendingApproval()).toBe(false);
  });

  it('drops a request that outlived its timeout while stored', async () => {
    const first = new ApprovalService();
    await first.initialize();
    await ask(first);

    // Age the stored request past the five-minute window its timer would have enforced.
    const stored = session['pending_approval_flow'] as { timestamp: number }[];
    stored[0]!.timestamp = Date.now() - 6 * 60 * 1000;

    const second = await restart();

    expect(second.getCurrentApproval()).toBeNull();
    expect(second.hasPendingApproval()).toBe(false);
  });

  it('refuses to complete one that expired while the screen sat open', async () => {
    const first = new ApprovalService();
    await first.initialize();
    await ask(first);

    // Restored while still fresh, so it survives hydration.
    const second = await restart();
    const grant = vi.fn().mockResolvedValue(undefined);
    second.registerCompletionHandler(grant);
    expect(second.getCurrentApproval()).not.toBeNull();

    // Then this worker stays awake past the window the original timer would have enforced. That
    // timer died with its worker, so nothing else is going to stop this.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    try {
      await expect(second.resolveApproval('request-1', { approved: true })).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
    expect(grant).not.toHaveBeenCalled();
  });

  it('lets the user refuse a restored request', async () => {
    const first = new ApprovalService();
    await first.initialize();
    await ask(first);

    const second = await restart();

    expect(second.rejectApproval('request-1', 'User denied the request')).toBe(true);
    expect(second.hasPendingApproval()).toBe(false);
  });

  it('does not carry a settled request into the next worker', async () => {
    const first = new ApprovalService();
    await first.initialize();
    await ask(first);
    await first.resolveApproval('request-1', { approved: true });

    const second = await restart();

    expect(second.getCurrentApproval()).toBeNull();
  });

  it('answers only the request it was asked about', async () => {
    const first = new ApprovalService();
    await first.initialize();
    await ask(first);

    const second = await restart();
    const grant = vi.fn().mockResolvedValue(undefined);
    second.registerCompletionHandler(grant);

    await expect(second.resolveApproval('some-other-request', { approved: true })).resolves.toBe(false);

    expect(grant).not.toHaveBeenCalled();
    expect(second.getCurrentApproval()).not.toBeNull();
  });
});
