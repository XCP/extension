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
  decryptOpReturnData,
  fetchInputValues,
  type CounterpartyMessage
} from '@/utils/blockchain/counterparty/transaction';
import {
  verifyProviderTransaction,
  type ProviderVerificationResult
} from '@/utils/blockchain/counterparty/unpack';
import {
  analyzeTransactionSafety,
  type SafetyAnalysis,
} from '@/utils/blockchain/counterparty/transactionSafety';

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
  /** Transaction virtual size in vbytes (for fee rate calculation) */
  vsize?: number;
  hasOpReturn: boolean;
  counterpartyMessage?: CounterpartyMessage;
  /** Local verification result */
  verification: ProviderVerificationResult;
  /** Security analysis (dangerous types, suspicious outputs) */
  safety: SafetyAnalysis;
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

export function useSignTransactionRequest(signerAddress?: string) {
  const [searchParams] = useSearchParams();
  const [request, setRequest] = useState<SignTransactionRequest | null>(null);
  const [decodedInfo, setDecodedInfo] = useState<DecodedTransactionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestId = searchParams.get('requestId');

  // Decode raw transaction and enrich with API data
  const decodeTransaction = useCallback(async (rawTxHex: string, signerAddress?: string): Promise<DecodedTransactionInfo> => {
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

    // If decode didn't provide input values (prevout), look them up from blockchain
    const hasInputValues = inputs.some(i => i.value != null && i.value > 0);
    if (!hasInputValues && inputs.length > 0) {
      try {
        const inputValues = await fetchInputValues(inputs);
        for (const input of inputs) {
          const key = `${input.txid}:${input.vout}`;
          const value = inputValues.get(key);
          if (value != null) {
            input.value = value;
          }
        }
      } catch (err) {
        console.warn('Failed to fetch input values:', err);
      }
    }

    const totalInputValue = inputs.reduce((sum, input) => sum + (input.value || 0), 0);
    const totalOutputValue = outputs.reduce((sum, output) => sum + output.value, 0);
    const fee = totalInputValue > 0 ? totalInputValue - totalOutputValue : 0;

    const hasOpReturn = outputs.some(o => o.type === 'op_return');

    let counterpartyMessage: CounterpartyMessage | undefined;
    let decryptedDataHex: string | undefined;

    // Counterparty encrypts OP_RETURN data with ARC4 using the first input's txid.
    // Decrypt to get the CNTRPRTY-prefixed datahex for local verification and API decode.
    if (hasOpReturn && inputs.length > 0 && inputs[0].txid) {
      for (const output of outputs) {
        if (output.opReturnData) {
          const decrypted = decryptOpReturnData(output.opReturnData, inputs[0].txid);
          if (decrypted) {
            decryptedDataHex = decrypted;
            break;
          }
        }
      }
    }

    // If we decrypted Counterparty data, try API unpack for rich message info
    if (decryptedDataHex) {
      try {
        const msg = await decodeCounterpartyMessage(decryptedDataHex);
        if (msg) {
          counterpartyMessage = msg;
        }
      } catch (err) {
        console.warn('Failed to decode Counterparty message:', err);
      }
    }

    // Verify locally (compares local binary unpack against API result)
    const verification = verifyProviderTransaction(decryptedDataHex, counterpartyMessage);

    // Analyze for security risks (dangerous types, suspicious outputs)
    const messageType = counterpartyMessage?.messageType
      ?? verification.localUnpack?.messageType;
    const safety = analyzeTransactionSafety(messageType, outputs, signerAddress || '');

    return {
      txid: decoded.txid,
      inputs,
      outputs,
      totalInputValue,
      totalOutputValue,
      fee,
      vsize: decoded.vsize ?? decoded.size,
      hasOpReturn,
      counterpartyMessage,
      verification,
      safety,
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
        const decoded = await decodeTransaction(req.rawTxHex, signerAddress);
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
            const decoded = await decodeTransaction(req.rawTxHex, signerAddress);
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
