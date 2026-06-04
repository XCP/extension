import { useEffect } from 'react';

export type SignRequestKind = 'sign-transaction' | 'sign-psbt' | 'sign-message';

/**
 * Connects the 'popup-lifecycle' port so the background can promptly cancel this
 * request if the popup is closed without a decision. The background only cancels
 * flows still marked 'pending', so completing/cancelling first is safe.
 */
export function usePopupLifecycle(requestId: string | null | undefined, requestType: SignRequestKind): void {
  useEffect(() => {
    if (!requestId) return;

    let port: chrome.runtime.Port | null = null;
    try {
      port = chrome.runtime.connect({ name: 'popup-lifecycle' });
      port.postMessage({ type: 'request-active', requestId, requestType });
    } catch {
      // Background may be unavailable; cancellation falls back to the timeout.
    }

    return () => {
      try { port?.disconnect(); } catch { /* already gone */ }
    };
  }, [requestId, requestType]);
}
