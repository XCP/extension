/**
 * Hook to handle sign message requests from provider/dApps
 *
 * This hook centralizes the logic for:
 * - Loading sign message request data from storage
 * - Listening for navigation messages
 * - Handling success/cancel callbacks
 * - Cleaning up storage
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { signMessageRequestStorage, type SignMessageRequest } from '@/utils/storage/signMessageRequestStorage';
import { eventEmitterService } from '@/services/eventEmitterService';

export function useSignMessageRequest() {
  const [searchParams] = useSearchParams();
  const [providerMessage, setProviderMessage] = useState<string | null>(null);
  const [providerOrigin, setProviderOrigin] = useState<string | null>(null);
  const signMessageRequestId = searchParams.get('signMessageRequestId');

  // Load sign message request data if we have a request ID
  useEffect(() => {
    if (signMessageRequestId) {
      const loadSignMessageRequest = async () => {
        const request = await signMessageRequestStorage.get(signMessageRequestId);
        if (request) {
          setProviderMessage(request.message);
          setProviderOrigin(request.origin);
        }
      };
      loadSignMessageRequest();
    }
  }, [signMessageRequestId]);

  // Listen for navigation messages from background
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'NAVIGATE_TO_SIGN_MESSAGE') {
        // Load the sign message request
        if (message.signMessageRequestId) {
          const loadSignMessageRequest = async () => {
            const request = await signMessageRequestStorage.get(message.signMessageRequestId);
            if (request) {
              setProviderMessage(request.message);
              setProviderOrigin(request.origin);
            }
          };
          loadSignMessageRequest();
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Handle completion for provider requests
  const handleSuccess = async (result: { signature: string }) => {
    if (signMessageRequestId) {
      // Notify the provider that the sign message is complete
      eventEmitterService.emit(`sign-message-complete-${signMessageRequestId}`, result);

      // Clean up the request
      await signMessageRequestStorage.remove(signMessageRequestId);
    }
  };

  // Handle cancellation for provider requests
  const handleCancel = async () => {
    if (signMessageRequestId) {
      // Notify the provider that the sign message was cancelled
      eventEmitterService.emit(`sign-message-cancel-${signMessageRequestId}`, { reason: 'User cancelled' });

      // Clean up the request
      await signMessageRequestStorage.remove(signMessageRequestId);
    }
  };

  return {
    providerMessage,
    providerOrigin,
    signMessageRequestId,
    handleSuccess,
    handleCancel,
    isProviderRequest: !!signMessageRequestId
  };
}