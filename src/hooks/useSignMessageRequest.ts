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
      // Notify the background that the sign message is complete
      // Uses chrome.runtime.sendMessage to cross the context boundary
      emitToBackground(`sign-message-complete-${signMessageRequestId}`, result);

      // Clean up the request
      await signMessageRequestStorage.remove(signMessageRequestId);
    }
  };

  // Handle cancellation for provider requests
  const handleCancel = async () => {
    if (signMessageRequestId) {
      // Notify the background that the sign message was cancelled
      // Uses chrome.runtime.sendMessage to cross the context boundary
      emitToBackground(`sign-message-cancel-${signMessageRequestId}`, { reason: 'User cancelled' });

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