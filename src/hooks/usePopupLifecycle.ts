import { useEffect } from 'react';

export type SignRequestKind = 'sign-transaction' | 'sign-psbt' | 'sign-psbts' | 'sign-message';

/** Pause before reconnecting a dropped port, so a background that keeps refusing is not hammered. */
export const POPUP_LIFECYCLE_RECONNECT_MS = 1_000;

/**
 * Connects the 'popup-lifecycle' port so the background can promptly cancel this
 * request if the popup is closed without a decision. The background only cancels
 * flows still marked 'pending', so completing/cancelling first is safe.
 *
 * The port drops whenever the background worker stops, and the worker that replaces it knows
 * nothing about this window. So while the screen is mounted a dropped port is reconnected and the
 * request announced again; otherwise closing the window after a worker restart would leave the
 * request pending until it timed out.
 */
export function usePopupLifecycle(requestId: string | null | undefined, requestType: SignRequestKind): void {
  useEffect(() => {
    if (!requestId) return;

    let port: chrome.runtime.Port | null = null;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      retry = undefined;
      if (!active) return;
      try {
        const next = chrome.runtime.connect({ name: 'popup-lifecycle' });
        port = next;
        next.onDisconnect.addListener(() => {
          if (chrome.runtime.lastError) { /* consumed */ }
          if (port !== next) return;
          port = null;
          if (active) retry = setTimeout(connect, POPUP_LIFECYCLE_RECONNECT_MS);
        });
        next.postMessage({ type: 'request-active', requestId, requestType });
      } catch {
        // Background may be unavailable, or this page's extension context is gone for good;
        // cancellation then falls back to the request's timeout.
        port = null;
      }
    };
    connect();

    return () => {
      active = false;
      if (retry) clearTimeout(retry);
      const current = port;
      port = null;
      try { current?.disconnect(); } catch { /* already gone */ }
    };
  }, [requestId, requestType]);
}
