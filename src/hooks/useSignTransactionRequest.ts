/**
 * Hook to handle raw transaction signing requests from provider/dApps
 *
 * This hook centralizes the logic for:
 * - Loading transaction request data from storage
 * - Decoding transaction details (inputs, outputs, fee)
 * - Optionally decoding Counterparty messages
 * - Handling success/cancel callbacks
 * - Cleaning up storage
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { signTransactionRequestStorage, type SignTransactionRequest } from '@/utils/storage/signTransactionRequestStorage';
import {
  decodeRawTransaction,
  decodeCounterpartyMessage,
  hasCounterpartyPrefix,
  type CounterpartyMessage
} from '@/utils/blockchain/counterparty/transaction';
import {
  verifyProviderTransaction,
  type ProviderVerificationResult
} from '@/utils/blockchain/counterparty/unpack';

/**
 * Decoded transaction details
 */
export interface DecodedTransactionInfo {
  txid: string;
  inputs: Array<{
    txid: string;
    vout: number;
    value?: number;
    address?: string;
  }>;
  outputs: Array<{
    index: number;
    value: number;
    address?: string;
    type: string;
    opReturnData?: string;
  }>;
  totalInputValue: number;
  totalOutputValue: number;
  fee: number;
  hasOpReturn: boolean;
  counterpartyMessage?: CounterpartyMessage;
  /** Local verification result */
  verification: ProviderVerificationResult;
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
    console.debug('Failed to emit sign transaction event to background:', error);
  });
}

export function useSignTransactionRequest() {
  const [searchParams] = useSearchParams();
  const [request, setRequest] = useState<SignTransactionRequest | null>(null);
  const [decodedInfo, setDecodedInfo] = useState<DecodedTransactionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestId = searchParams.get('requestId');

  // Decode raw transaction and enrich with API data
  const decodeTransaction = useCallback(async (rawTxHex: string): Promise<DecodedTransactionInfo> => {
    // Decode the raw transaction via API
    const decoded = await decodeRawTransaction(rawTxHex, true);

    const inputs: DecodedTransactionInfo['inputs'] = decoded.vin.map((vin: any) => ({
      txid: vin.txid,
      vout: vin.vout,
      value: vin.prevout?.value,
      address: vin.prevout?.scriptPubKey?.address
    }));

    const outputs: DecodedTransactionInfo['outputs'] = decoded.vout.map((vout: any) => {
      const isOpReturn = vout.scriptPubKey.type === 'nulldata';
      return {
        index: vout.n,
        value: Math.round(vout.value * 100000000), // Convert to satoshis
        address: vout.scriptPubKey.address,
        type: isOpReturn ? 'op_return' : vout.scriptPubKey.type,
        opReturnData: isOpReturn ? vout.scriptPubKey.hex : undefined
      };
    });

    const totalInputValue = inputs.reduce((sum, input) => sum + (input.value || 0), 0);
    const totalOutputValue = outputs.reduce((sum, output) => sum + output.value, 0);
    const fee = totalInputValue > 0 ? totalInputValue - totalOutputValue : 0;

    const hasOpReturn = outputs.some(o => o.type === 'op_return');

    let counterpartyMessage: CounterpartyMessage | undefined;
    let opReturnData: string | undefined;

    // Check if any OP_RETURN has Counterparty prefix
    if (hasOpReturn) {
      const cpOutput = outputs.find(
        o => o.opReturnData && hasCounterpartyPrefix(o.opReturnData)
      );

      if (cpOutput) {
        opReturnData = cpOutput.opReturnData;

        // Try to decode via API
        try {
          const msg = await decodeCounterpartyMessage(rawTxHex);
          if (msg) {
            counterpartyMessage = msg;
          }
        } catch (err) {
          console.warn('Failed to decode Counterparty message:', err);
        }
      }
    }

    // Verify locally and compare against API
    const verification = verifyProviderTransaction(opReturnData, counterpartyMessage);

    return {
      txid: decoded.txid,
      inputs,
      outputs,
      totalInputValue,
      totalOutputValue,
      fee,
      hasOpReturn,
      counterpartyMessage,
      verification
    };
  }, []);

  // Load transaction request data if we have a request ID
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
        const req = await signTransactionRequestStorage.get(requestId);
        if (!req) {
          setError('Transaction signing request not found or expired');
          setIsLoading(false);
          return;
        }

        setRequest(req);

        // Decode the transaction
        const decoded = await decodeTransaction(req.rawTxHex);
        setDecodedInfo(decoded);
      } catch (err) {
        console.error('Failed to load transaction request:', err);
        setError(err instanceof Error ? err.message : 'Failed to load transaction request');
      } finally {
        setIsLoading(false);
      }
    };

    loadRequest();
  }, [requestId, decodeTransaction]);

  // Listen for navigation messages from background
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'NAVIGATE_TO_APPROVE_TRANSACTION' && message.signTxRequestId) {
        // Reload the request if we get a navigation message
        const loadRequest = async () => {
          const req = await signTransactionRequestStorage.get(message.signTxRequestId);
          if (req) {
            setRequest(req);
            const decoded = await decodeTransaction(req.rawTxHex);
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
  }, [decodeTransaction]);

  // Handle completion - called when user approves and signs
  const handleSuccess = useCallback(async (signedTxHex: string) => {
    if (requestId) {
      // Notify the background that transaction signing is complete
      emitToBackground(`sign-tx-complete-${requestId}`, { signedTxHex });

      // Clean up the request
      await signTransactionRequestStorage.remove(requestId);
    }
  }, [requestId]);

  // Handle cancellation
  const handleCancel = useCallback(async () => {
    if (requestId) {
      // Notify the background that transaction signing was cancelled
      emitToBackground(`sign-tx-cancel-${requestId}`, { reason: 'User cancelled' });

      // Clean up the request
      await signTransactionRequestStorage.remove(requestId);
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
