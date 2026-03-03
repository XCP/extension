/**
 * Hook to handle sign message requests from provider/dApps
 *
 * This hook centralizes the logic for:
 * - Loading sign message request data from storage
 * - Listening for navigation messages
 * - Handling success/cancel callbacks
 * - Cleaning up storage
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { signMessageRequestStorage, type SignMessageRequest } from '@/utils/storage/signMessageRequestStorage';

/**
 * Send an event to the background script's EventEmitterService.
 * This is necessary because the popup and background have separate instances.
 */
function emitToBackground(event: string, data: unknown): void {
  chrome.runtime.sendMessage({
    type: 'COMPOSE_EVENT',
    event,
    data
  }).catch((error) => {
    // Popup might be closing, which is fine
    console.debug('Failed to emit sign message event to background:', error);
  });
}

export function useSignMessageRequest() {
  const [searchParams] = useSearchParams();
  const [request, setRequest] = useState<SignMessageRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestId = searchParams.get('requestId');

  // Load sign message request data if we have a request ID
  useEffect(() => {
    if (!requestId) {
      setIsLoading(false);
      setError('No request ID provided');
      return;
    }

    const loadRequest = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const req = await signMessageRequestStorage.get(requestId);
        if (!req) {
          setError('Sign message request not found or expired');
          setIsLoading(false);
          return;
        }
        setRequest(req);
      } catch (err) {
        console.error('Failed to load sign message request:', err);
        setError(err instanceof Error ? err.message : 'Failed to load sign message request');
      } finally {
        setIsLoading(false);
      }
    };

    loadRequest();
  }, [requestId]);

  // Listen for navigation messages from background
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'NAVIGATE_TO_SIGN_MESSAGE' && message.signMessageRequestId) {
        const loadRequest = async () => {
          const req = await signMessageRequestStorage.get(message.signMessageRequestId);
          if (req) {
            setRequest(req);
          }
        };
        loadRequest();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Handle completion for provider requests
  const handleSuccess = useCallback(async (result: { signature: string }) => {
    if (requestId) {
      // Notify the background that the sign message is complete
      emitToBackground(`sign-message-complete-${requestId}`, result);

      // Clean up the request
      await signMessageRequestStorage.remove(requestId);
    }
  }, [requestId]);

  // Handle cancellation for provider requests
  const handleCancel = useCallback(async () => {
    if (requestId) {
      // Notify the background that the sign message was cancelled
      emitToBackground(`sign-message-cancel-${requestId}`, { reason: 'User cancelled' });

      // Clean up the request
      await signMessageRequestStorage.remove(requestId);
    }
  }, [requestId]);

  return {
    request,
    isLoading,
    error,
    requestId,
    handleSuccess,
    handleCancel,
    isProviderRequest: !!requestId
  };
}
