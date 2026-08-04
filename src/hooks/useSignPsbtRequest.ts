/**
 * Hook to handle PSBT signing requests from provider/dApps
 *
 * This hook centralizes the logic for:
 * - Loading PSBT request data from storage
 * - Decoding PSBT details (inputs, outputs, fee)
 * - Counterparty payload extraction (plaintext/ARC4 OP_RETURN, bare multisig)
 * - Safety analysis (block sweeps, warn on suspicious outputs)
 * - Handling success/cancel callbacks
 * - Cleaning up storage
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { extractPsbtDetails, type PsbtDetails } from '@/core/blockchain/bitcoin/psbt';
import {
  fetchInputsAttachedAssets,
  type InputAttachedAssets,
} from '@/core/blockchain/counterparty/inputAssets';
import {
  type CounterpartyMessage, 
  decodeCounterpartyMessage,
  decodeRawTransaction
} from '@/core/blockchain/counterparty/transaction';
import {
  analyzeTransactionSafety,
  type SafetyAnalysis,
} from '@/core/blockchain/counterparty/transactionSafety';
import {
  type ProviderVerificationResult, 
  verifyProviderTransaction
} from '@/core/blockchain/counterparty/unpack';
import { extractPayloadFromOutputs } from '@/core/blockchain/counterparty/unpack/opReturn';
import { recordSignOutcome } from '@/platform/provider/signFlow';
import { type SignPsbtRequest, signPsbtRequestStorage } from '@/platform/storage/signPsbtRequestStorage';

/**
 * Extended PSBT details with address enrichment and Counterparty message
 */
export interface DecodedPsbtInfo {
  psbtDetails: PsbtDetails;
  counterpartyMessage?: CounterpartyMessage;
  /** Decoded transaction ID (if available from API) */
  txid?: string;
  /** Local verification result */
  verification: ProviderVerificationResult;
  /** Security analysis (dangerous types, suspicious outputs) */
  safety: SafetyAnalysis;
  /** Inputs whose UTXOs carry Counterparty assets (empty if none). */
  attachedAssets: InputAttachedAssets[];
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

export function useSignPsbtRequest(signerAddress?: string) {
  const [searchParams] = useSearchParams();
  const [request, setRequest] = useState<SignPsbtRequest | null>(null);
  const [decodedInfo, setDecodedInfo] = useState<DecodedPsbtInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestId = searchParams.get('requestId');

  // Decode PSBT and enrich with API data
  const decodePsbt = useCallback(async (
    psbtHex: string,
    signerAddresses?: string[],
    signedInputIndices?: number[]
  ): Promise<DecodedPsbtInfo> => {
    // First, extract pure Bitcoin details (no API calls)
    const psbtDetails = extractPsbtDetails(psbtHex);

    // Kick off per-input attached-asset lookups now so they overlap with the
    // OP_RETURN/txid API decodes below rather than adding a serial round-trip.
    const attachedAssetsPromise = fetchInputsAttachedAssets(psbtDetails.inputs, signedInputIndices);

    let counterpartyMessage: CounterpartyMessage | undefined;
    let txid: string | undefined;
    let counterpartyDataHex: string | undefined;

    // Resolve any Counterparty payload the outputs carry — plaintext or ARC4 OP_RETURN, or
    // bare-multisig data outputs, which produce no OP_RETURN at all. Classifying every encoding
    // here is what lets the sweep block apply regardless of how the message is carried.
    const firstInputTxid = psbtDetails.inputs[0]?.txid;
    if (firstInputTxid) {
      counterpartyDataHex = extractPayloadFromOutputs(
        psbtDetails.outputs.map((output) => output.script ?? ''),
        firstInputTxid
      ) ?? undefined;
    }

    // If the outputs carried Counterparty data, try API unpack for rich message info
    if (counterpartyDataHex) {
      try {
        const msg = await decodeCounterpartyMessage(counterpartyDataHex);
        if (msg) {
          counterpartyMessage = msg;
        }
      } catch (err) {
        console.warn('Failed to decode Counterparty message:', err);
      }
    }

    // Try to get txid and enrich outputs with addresses from API
    if (psbtDetails.rawTxHex) {
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

    // Verify locally (compares local binary unpack against API result)
    const verification = verifyProviderTransaction(counterpartyDataHex, counterpartyMessage);

    // Analyze for security risks (dangerous types, suspicious outputs)
    const messageType = counterpartyMessage?.messageType
      ?? verification.localUnpack?.messageType;
    const safety = analyzeTransactionSafety(messageType, psbtDetails.outputs, signerAddresses ?? []);

    const attachedAssets = await attachedAssetsPromise;

    return {
      psbtDetails,
      counterpartyMessage,
      txid,
      verification,
      safety,
      attachedAssets,
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
        const requestedSigners = Object.keys(req.signInputs ?? {});
        const decoded = await decodePsbt(
          req.psbtHex,
          requestedSigners.length > 0 ? requestedSigners : signerAddress ? [signerAddress] : [],
          Object.values(req.signInputs ?? {}).flat()
        );
        setDecodedInfo(decoded);
      } catch (err) {
        console.error('Failed to load PSBT request:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PSBT request');
      } finally {
        setIsLoading(false);
      }
    };

    loadRequest();
  }, [requestId, decodePsbt, signerAddress]);

  // Listen for navigation messages from background
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'NAVIGATE_TO_APPROVE_PSBT' && message.signPsbtRequestId) {
        // Reload the request if we get a navigation message
        const loadRequest = async () => {
          const req = await signPsbtRequestStorage.get(message.signPsbtRequestId);
          if (req) {
            setRequest(req);
            const requestedSigners = Object.keys(req.signInputs ?? {});
            const decoded = await decodePsbt(
              req.psbtHex,
              requestedSigners.length > 0 ? requestedSigners : signerAddress ? [signerAddress] : [],
              Object.values(req.signInputs ?? {}).flat()
            );
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
  }, [decodePsbt, signerAddress]);

  // Handle completion - called when user approves and signs
  const handleSuccess = useCallback(async (signedPsbtHex: string) => {
    if (requestId) {
      // Persist the outcome so the dApp can recover it after a worker restart.
      await recordSignOutcome(requestId, 'completed', { signedPsbtHex });
      // Notify the background that PSBT signing is complete
      emitToBackground(`sign-psbt-complete-${requestId}`, { signedPsbtHex });

      // Clean up the request
      await signPsbtRequestStorage.remove(requestId);
    }
  }, [requestId]);

  // Handle cancellation
  const handleCancel = useCallback(async () => {
    if (requestId) {
      await recordSignOutcome(requestId, 'cancelled');
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
