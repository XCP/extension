/**
 * Hook to handle PSBT signing requests from provider/dApps
 *
 * This hook centralizes the logic for:
 * - Loading PSBT request data from storage
 * - Decoding PSBT details (inputs, outputs, fee)
 * - ARC4 decryption of OP_RETURN data for Counterparty detection
 * - Safety analysis (block sweeps, warn on suspicious outputs)
 * - Handling success/cancel callbacks
 * - Cleaning up storage
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { signPsbtRequestStorage, type SignPsbtRequest } from '@/utils/storage/signPsbtRequestStorage';
import { recordSignOutcome } from '@/utils/provider/signFlow';
import { extractPsbtDetails, type PsbtDetails } from '@/utils/blockchain/bitcoin/psbt';
import {
  decodeRawTransaction,
  decodeCounterpartyMessage,
  type CounterpartyMessage
} from '@/utils/blockchain/counterparty/transaction';
import { decryptOpReturnData } from '@/utils/blockchain/counterparty/unpack/opReturn';
import {
  verifyProviderTransaction,
  type ProviderVerificationResult
} from '@/utils/blockchain/counterparty/unpack';
import {
  analyzeTransactionSafety,
  type SafetyAnalysis,
} from '@/utils/blockchain/counterparty/transactionSafety';
import { fetchUtxoBalances } from '@/utils/blockchain/counterparty/api';

/**
 * Counterparty assets attached to a single PSBT input's UTXO.
 * Spending such an input moves the assets, which the BTC value alone hides.
 */
export interface InputAttachedAssets {
  inputIndex: number;
  /** UTXO identifier (txid:vout). */
  utxo: string;
  /**
   * True when the balance lookup itself failed, so the asset status is unknown
   * rather than a confirmed empty. Surfaced separately in the UI so a network
   * or rate-limit failure is not shown as "no assets."
   */
  lookupFailed?: boolean;
  assets: Array<{
    asset: string;
    quantity_normalized: string;
    asset_longname?: string | null;
  }>;
}

/** Cap on per-input asset lookups; truncation past this is logged, not silent. */
export const MAX_ASSET_LOOKUP_INPUTS = 30;

/**
 * Look up the Counterparty assets attached to each input's UTXO. Returns an
 * entry for every input that carries assets or whose lookup failed; inputs
 * confirmed empty are omitted. A failed lookup is reported (lookupFailed) rather
 * than silently treated as empty, and never blocks signing.
 */
export async function fetchInputsAttachedAssets(
  inputs: Array<{ index: number; txid: string; vout: number }>
): Promise<InputAttachedAssets[]> {
  const checked = inputs.slice(0, MAX_ASSET_LOOKUP_INPUTS);
  if (inputs.length > MAX_ASSET_LOOKUP_INPUTS) {
    console.warn(
      `PSBT has ${inputs.length} inputs; only the first ${MAX_ASSET_LOOKUP_INPUTS} were checked for attached Counterparty assets.`
    );
  }

  const results = await Promise.all(
    checked.map(async (input): Promise<InputAttachedAssets | null> => {
      const utxo = `${input.txid}:${input.vout}`;
      try {
        const res = await fetchUtxoBalances(utxo);
        const assets = (res.result ?? [])
          .filter((b) => b.asset && b.quantity_normalized)
          .map((b) => ({
            asset: b.asset,
            quantity_normalized: b.quantity_normalized,
            asset_longname: b.asset_info?.asset_longname ?? null,
          }));
        return assets.length > 0 ? { inputIndex: input.index, utxo, assets } : null;
      } catch (err) {
        console.warn(`Failed to fetch attached assets for ${utxo}:`, err);
        return { inputIndex: input.index, utxo, assets: [], lookupFailed: true };
      }
    })
  );

  return results.filter((r): r is InputAttachedAssets => r !== null);
}

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
    signerAddresses?: string[]
  ): Promise<DecodedPsbtInfo> => {
    // First, extract pure Bitcoin details (no API calls)
    const psbtDetails = extractPsbtDetails(psbtHex);

    // Kick off per-input attached-asset lookups now so they overlap with the
    // OP_RETURN/txid API decodes below rather than adding a serial round-trip.
    const attachedAssetsPromise = fetchInputsAttachedAssets(psbtDetails.inputs);

    let counterpartyMessage: CounterpartyMessage | undefined;
    let txid: string | undefined;
    let decryptedDataHex: string | undefined;

    // ARC4 decrypt OP_RETURN data using the first input's txid as key
    if (psbtDetails.hasOpReturn && psbtDetails.inputs.length > 0 && psbtDetails.inputs[0]!.txid) {
      for (const output of psbtDetails.outputs) {
        if (output.type === 'op_return' && output.script) {
          const decrypted = decryptOpReturnData(output.script, psbtDetails.inputs[0]!.txid);
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
    const verification = verifyProviderTransaction(decryptedDataHex, counterpartyMessage);

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
          requestedSigners.length > 0 ? requestedSigners : signerAddress ? [signerAddress] : []
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
              requestedSigners.length > 0 ? requestedSigners : signerAddress ? [signerAddress] : []
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
