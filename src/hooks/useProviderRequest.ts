/**
 * Hook to handle provider requests in compose forms
 *
 * This hook centralizes the logic for:
 * - Loading compose request data from storage
 * - Denormalizing provider data for form display
 * - Listening for navigation messages
 * - Handling success/cancel callbacks
 * - Cleaning up storage
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { composeRequestStorage, type ComposeRequest } from '@/utils/storage/composeRequestStorage';
import { eventEmitterService } from '@/services/eventEmitterService';
import { getActiveComposeRequest } from '@/services/providerService';

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
        // Try in-memory first (fast, for active requests)
        let request = getActiveComposeRequest(composeRequestId);

        // Fallback to storage (for recovery after crash/reload)
        if (!request) {
          request = await composeRequestStorage.get(composeRequestId);
        }

        if (request && request.type === composeType) {
          // Provider data is already in API format (satoshis), no denormalization needed
          // Auto-compose will pass it directly to the API
          setProviderFormData(request.params as T);
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
            // Try in-memory first (fast, for active requests)
            let request = getActiveComposeRequest(message.composeRequestId);

            // Fallback to storage (for recovery after crash/reload)
            if (!request) {
              request = await composeRequestStorage.get(message.composeRequestId);
            }

            if (request && request.type === composeType) {
              // Provider data is already in API format (satoshis), no denormalization needed
              // Auto-compose will pass it directly to the API
              setProviderFormData(request.params as T);
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
      eventEmitterService.emit(`compose-cancel-${composeRequestId}`, { reason: 'User cancelled' });

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