/**
 * Hook to handle provider requests in compose forms
 *
 * This hook centralizes the logic for:
 * - Loading compose request data from storage
 * - Listening for navigation messages
 * - Handling success/cancel callbacks
 * - Cleaning up storage
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { composeRequestStorage, type ComposeRequest } from '@/utils/storage/composeRequestStorage';
import { eventEmitterService } from '@/services/eventEmitterService';

export function useProviderRequest<T = any>(
  composeType: ComposeRequest['type']
) {
  const [searchParams] = useSearchParams();
  const [providerFormData, setProviderFormData] = useState<T | null>(null);
  const composeRequestId = searchParams.get('composeRequestId');

  // Load compose request data if we have a request ID
  useEffect(() => {
    if (composeRequestId) {
      const loadComposeRequest = async () => {
        const request = await composeRequestStorage.get(composeRequestId);
        if (request && request.type === composeType) {
          setProviderFormData(request.params);
        }
      };
      loadComposeRequest();
    }
  }, [composeRequestId, composeType]);

  // Listen for navigation messages from background
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'NAVIGATE_TO_COMPOSE' && message.composeType === composeType) {
        // Load the compose request
        if (message.composeRequestId) {
          const loadComposeRequest = async () => {
            const request = await composeRequestStorage.get(message.composeRequestId);
            if (request && request.type === composeType) {
              setProviderFormData(request.params);
            }
          };
          loadComposeRequest();
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [composeType]);

  // Handle completion for provider requests
  const handleSuccess = async (result: any) => {
    if (composeRequestId) {
      // Notify the provider that the compose is complete
      eventEmitterService.emit(`compose-complete-${composeRequestId}`, result);

      // Clean up the request
      await composeRequestStorage.remove(composeRequestId);
    }
  };

  // Handle cancellation for provider requests
  const handleCancel = async () => {
    if (composeRequestId) {
      // Notify the provider that the compose was cancelled
      eventEmitterService.emit(`compose-cancel-${composeRequestId}`);

      // Clean up the request
      await composeRequestStorage.remove(composeRequestId);
    }
  };

  return {
    providerFormData,
    composeRequestId,
    handleSuccess,
    handleCancel,
    isProviderRequest: !!composeRequestId
  };
}