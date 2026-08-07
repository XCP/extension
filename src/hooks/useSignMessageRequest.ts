/**
 * Hook to handle sign message requests from provider/dApps
 *
 * This hook centralizes the logic for:
 * - Loading sign message request data from storage
 * - Listening for navigation messages
 * - Handling success/cancel callbacks
 * - Cleaning up storage
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { emitToBackground } from '@/platform/provider/emitToBackground';
import { getSignFlow, recordSignOutcome, type SignMessageRequest } from '@/platform/provider/signFlow';

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
        const req = (await getSignFlow(requestId)) as SignMessageRequest | null;
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
          const req = (await getSignFlow(message.signMessageRequestId)) as SignMessageRequest | null;
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
      // Persist the outcome so the dApp can recover it after a worker restart.
      await recordSignOutcome(requestId, 'completed', result);
      // Notify the background that the sign message is complete
      emitToBackground(`sign-message-complete-${requestId}`, result);

      // Clean up the request
    }
  }, [requestId]);

  // Handle cancellation for provider requests
  const handleCancel = useCallback(async () => {
    if (requestId) {
      await recordSignOutcome(requestId, 'cancelled');
      // Notify the background that the sign message was cancelled
      emitToBackground(`sign-message-cancel-${requestId}`, { reason: 'User cancelled' });

      // Clean up the request
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
