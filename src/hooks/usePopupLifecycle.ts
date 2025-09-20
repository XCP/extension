/**
 * Hook to track popup lifecycle and notify background service
 *
 * This helps handle cases where users close the popup or walk away
 * while a provider request is pending.
 */

import { useEffect, useRef } from 'react';

export function usePopupLifecycle() {
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    // Connect to background service
    try {
      const port = chrome.runtime.connect({ name: 'popup-lifecycle' });
      portRef.current = port;

      // Notify that popup is active
      port.postMessage({ type: 'popup-active', timestamp: Date.now() });

      // Set up heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          port.postMessage({ type: 'heartbeat', timestamp: Date.now() });
        } catch (e) {
          // Port disconnected
          clearInterval(heartbeatInterval);
        }
      }, 30000); // Every 30 seconds

      // Cleanup on unmount
      return () => {
        clearInterval(heartbeatInterval);
        try {
          port.disconnect();
        } catch (e) {
          // Port already disconnected
        }
      };
    } catch (error) {
      console.error('Failed to connect popup lifecycle port:', error);
    }
  }, []);

  /**
   * Notify background that a request is active
   */
  const notifyRequestActive = (requestId: string, requestType: 'compose' | 'sign') => {
    if (portRef.current) {
      try {
        portRef.current.postMessage({
          type: 'request-active',
          requestId,
          requestType,
          timestamp: Date.now()
        });
      } catch (e) {
        console.error('Failed to notify request active:', e);
      }
    }
  };

  /**
   * Notify background that a request is complete
   */
  const notifyRequestComplete = (requestId: string) => {
    if (portRef.current) {
      try {
        portRef.current.postMessage({
          type: 'request-complete',
          requestId,
          timestamp: Date.now()
        });
      } catch (e) {
        console.error('Failed to notify request complete:', e);
      }
    }
  };

  return {
    notifyRequestActive,
    notifyRequestComplete
  };
}