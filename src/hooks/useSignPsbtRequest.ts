/**
 * Hook to handle PSBT signing requests from provider/dApps
 *
 * This hook centralizes the logic for:
 * - Loading PSBT request data from storage
 * - Decoding PSBT details (inputs, outputs, fee)
 * - Optionally decoding Counterparty messages
 * - Handling success/cancel callbacks
 * - Cleaning up storage
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { signPsbtRequestStorage, type SignPsbtRequest } from '@/utils/storage/signPsbtRequestStorage';
import { extractPsbtDetails, type PsbtDetails } from '@/utils/blockchain/bitcoin/psbt';
import {
  decodeRawTransaction,
  decodeCounterpartyMessage,
  hasCounterpartyPrefix,
  type CounterpartyMessage
} from '@/utils/blockchain/counterparty/transaction';

/**
 * Extended PSBT details with address enrichment and Counterparty message
 */
export interface DecodedPsbtInfo {
  psbtDetails: PsbtDetails;
  counterpartyMessage?: CounterpartyMessage;
  /** Decoded transaction ID (if available from API) */
  txid?: string;
}

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
    console.debug('Failed to emit sign PSBT event to background:', error);
  });
}

export function useSignPsbtRequest() {
  const [searchParams] = useSearchParams();
  const [request, setRequest] = useState<SignPsbtRequest | null>(null);
  const [decodedInfo, setDecodedInfo] = useState<DecodedPsbtInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestId = searchParams.get('requestId');

  // Decode PSBT and enrich with API data
  const decodePsbt = useCallback(async (psbtHex: string): Promise<DecodedPsbtInfo> => {
    // First, extract pure Bitcoin details (no API calls)
    const psbtDetails = extractPsbtDetails(psbtHex);

    let counterpartyMessage: CounterpartyMessage | undefined;
    let txid: string | undefined;

    // If we have raw tx hex and OP_RETURN, try to decode Counterparty message
    if (psbtDetails.rawTxHex && psbtDetails.hasOpReturn) {
      // Check if any OP_RETURN has Counterparty prefix
      const hasCounterparty = psbtDetails.outputs.some(
        o => o.opReturnData && hasCounterpartyPrefix(o.opReturnData)
      );

      if (hasCounterparty) {
        try {
          const msg = await decodeCounterpartyMessage(psbtDetails.rawTxHex);
          if (msg) {
            counterpartyMessage = msg;
          }
        } catch (err) {
          console.warn('Failed to decode Counterparty message:', err);
        }
      }

      // Try to get txid and enrich outputs with addresses
      try {
        const decoded = await decodeRawTransaction(psbtDetails.rawTxHex, true);
        txid = decoded.txid;

        // Enrich outputs with addresses from API
        for (const vout of decoded.vout) {
          const output = psbtDetails.outputs.find(o => o.index === vout.n);
          if (output && vout.scriptPubKey.address) {
            output.address = vout.scriptPubKey.address;
          }
        }
      } catch (err) {
        console.warn('Failed to decode transaction via API:', err);
      }
    }

    return {
      psbtDetails,
      counterpartyMessage,
      txid
    };
  }, []);

  // Load PSBT request data if we have a request ID
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
        const req = await signPsbtRequestStorage.get(requestId);
        if (!req) {
          setError('PSBT signing request not found or expired');
          setIsLoading(false);
          return;
        }

        setRequest(req);

        // Decode the PSBT
        const decoded = await decodePsbt(req.psbtHex);
        setDecodedInfo(decoded);
      } catch (err) {
        console.error('Failed to load PSBT request:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PSBT request');
      } finally {
        setIsLoading(false);
      }
    };

    loadRequest();
  }, [requestId, decodePsbt]);

  // Listen for navigation messages from background
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'NAVIGATE_TO_APPROVE_PSBT' && message.signPsbtRequestId) {
        // Reload the request if we get a navigation message
        const loadRequest = async () => {
          const req = await signPsbtRequestStorage.get(message.signPsbtRequestId);
          if (req) {
            setRequest(req);
            const decoded = await decodePsbt(req.psbtHex);
            setDecodedInfo(decoded);
          }
        };
        loadRequest();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [decodePsbt]);

  // Handle completion - called when user approves and signs
  const handleSuccess = useCallback(async (signedPsbtHex: string) => {
    if (requestId) {
      // Notify the background that PSBT signing is complete
      emitToBackground(`sign-psbt-complete-${requestId}`, { signedPsbtHex });

      // Clean up the request
      await signPsbtRequestStorage.remove(requestId);
    }
  }, [requestId]);

  // Handle cancellation
  const handleCancel = useCallback(async () => {
    if (requestId) {
      // Notify the background that PSBT signing was cancelled
      emitToBackground(`sign-psbt-cancel-${requestId}`, { reason: 'User cancelled' });

      // Clean up the request
      await signPsbtRequestStorage.remove(requestId);
    }
  }, [requestId]);

  return {
    request,
    decodedInfo,
    isLoading,
    error,
    requestId,
    handleSuccess,
    handleCancel,
    isProviderRequest: !!requestId
  };
}
