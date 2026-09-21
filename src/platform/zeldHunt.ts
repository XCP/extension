import { type HuntTxidOptions, type HuntTxidResult, huntTxid } from '@/core/zeld/hunt';

let busy = false;

/**
 * Keep legacy signing constants in the existing background context. Chrome MV3 hunts inline;
 * background pages that support Worker can use the existing pool. No extra document or permission.
 * Overlapping opportunistic hunts skip mining rather than delaying another approved payment.
 */
export async function huntInBackground(job: Parameters<typeof huntTxid>[0], options: HuntTxidOptions): Promise<HuntTxidResult> {
  if (options.signal?.aborted) return { status: 'aborted', attempts: 0, elapsedMs: 0 };
  if (busy) return { status: 'not_found', attempts: 0, elapsedMs: 0 };
  busy = true;
  let lastActivity = Date.now();
  try {
    return await huntTxid(job, { ...options, onProgress: progress => {
      options.onProgress?.(progress);
      // An active, time-limited signing request can exceed Chrome's 30s idle lifetime.
      // Existing runtime API activity keeps it alive; no timer survives the hunt.
      if (!options.signal?.aborted && typeof Worker === 'undefined' && typeof chrome !== 'undefined'
        && chrome.runtime?.getPlatformInfo && Date.now() - lastActivity >= 20_000) {
        lastActivity = Date.now();
        void Promise.resolve().then(() => chrome.runtime.getPlatformInfo()).catch(() => {});
      }
    } });
  } finally {
    busy = false;
  }
}
