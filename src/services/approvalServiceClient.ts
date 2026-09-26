/**
 * The approval service as seen from the popup: its name and remote-call policy, and a proxy that
 * forwards calls to the background.
 *
 * Kept apart from approvalService.ts so extension pages get the proxy without bundling the
 * implementation (approval flow storage, popup window management). The background registers the
 * real service against this same policy, so the two sides cannot drift. Code that runs in the
 * background keeps using getApprovalService() from approvalService.ts: this proxy is never
 * registered, so calling it inside the background throws.
 */
import { defineProxyService, type ProxyServicePolicy } from '@/platform/proxy';
import type { ApprovalService } from '@/services/approvalService';

export const APPROVAL_SERVICE_NAME = 'ApprovalService';

export const APPROVAL_SERVICE_POLICY: ProxyServicePolicy<ApprovalService> = {
  methods: {
    resolveApproval: 'command', rejectApproval: 'command',
    getCurrentApproval: 'read', hasPendingApproval: 'read',
  },
};

/** A caller-side proxy. It is never registered, so its factory never runs. */
export const [, getApprovalServiceClient] = defineProxyService<ApprovalService>(
  APPROVAL_SERVICE_NAME,
  () => { throw new Error('ApprovalService is registered only in the background'); },
  APPROVAL_SERVICE_POLICY,
);
