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
import { extractPsbtDetails, type PsbtDetails } from '@/core/bitcoin/psbt';
import { fetchInputsAttachedAssets } from '@/core/counterparty/inputAssets';
import {
  type InscriptionCommitContext,
  resolveRevealMessage,
} from '@/core/counterparty/providerInscriptions';
import {
  analyzeSignRequest,
  type SignRequestAnalysis,
} from '@/core/counterparty/signRequestAnalysis';
import { decodeRawTransaction } from '@/core/counterparty/transaction';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';
import { emitToBackground } from '@/platform/provider/emitToBackground';
import { getSignFlow, recordSignOutcome, type SignPsbtRequest } from '@/platform/provider/signFlow';

/**
 * PSBT details with address enrichment, plus the safety analysis every signing request gets
 * (`signRequestAnalysis.ts`, shared with the raw-transaction screen).
 */
export interface DecodedPsbtInfo extends SignRequestAnalysis {
  psbtDetails: PsbtDetails;
  /** Decoded transaction ID (if available from API) */
  txid?: string;
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
    signedInputIndices?: number[],
    inscriptionContext?: InscriptionCommitContext
  ): Promise<DecodedPsbtInfo> => {
    // First, extract pure Bitcoin details (no API calls)
    const psbtDetails = extractPsbtDetails(psbtHex);

    // Kick off per-input attached-asset lookups now so they overlap with the
    // OP_RETURN/txid API decodes below rather than adding a serial round-trip.
    const attachedAssetsPromise = fetchInputsAttachedAssets(psbtDetails.inputs, signedInputIndices);

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

    // An inscription reveal carries its message in input 0's tapleaf instead of any output — the
    // outputs hold only the bare CNTRPRTY marker. Recognized under core's own conditions
    // (`providerInscriptions.ts`), the envelope's message takes the payload's place and the
    // ordinary gate and display apply to it. Raw-transaction requests have no equivalent: an
    // unsigned raw transaction cannot carry the leaf it will reveal, so that path stays blocked.
    if (!counterpartyDataHex) {
      const reveal = resolveRevealMessage(psbtDetails.inputs, psbtDetails.outputs);
      if (reveal) counterpartyDataHex = reveal.messageHex;
    }

    // Enrich the outputs before analysing them, so the safety checks see every address that could
    // be resolved. Try to get txid and enrich outputs with addresses from API.
    if (psbtDetails.rawTxHex) {
      try {
        const decoded = await decodeRawTransaction(psbtDetails.rawTxHex, true);
        txid = decoded.txid;

        // Fill in addresses the local decode couldn't derive — never replace one
        // it did. The signature commits to the output scripts, so an address the
        // API supplies for a script we already read would let it relabel someone
        // else's output as your own change: `analyzeTransactionSafety` and
        // `computeMoneyMovement` both classify on this same array, so the
        // "BTC Sent to External Address" warning would not fire (ADR-019).
        for (const vout of decoded.vout) {
          const output = psbtDetails.outputs.find(o => o.index === vout.n);
          if (output && !output.address && vout.scriptPubKey.address) {
            output.address = vout.scriptPubKey.address;
          }
        }
      } catch (err) {
        console.warn('Failed to decode transaction via API:', err);
      }
    }

    const analysis = await analyzeSignRequest({
      counterpartyDataHex,
      inputs: psbtDetails.inputs,
      outputs: psbtDetails.outputs,
      signerAddresses: signerAddresses ?? [],
      signedInputIndices: signedInputIndices ?? [],
      transactionId: txid,
      attachedAssets: attachedAssetsPromise,
      inscriptionContext,
    });

    return {
      psbtDetails,
      txid,
      ...analysis,
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
        const req = (await getSignFlow(requestId)) as SignPsbtRequest | null;
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
          Object.values(req.signInputs ?? {}).flat(),
          req.inscription
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
          const req = (await getSignFlow(message.signPsbtRequestId)) as SignPsbtRequest | null;
          if (req) {
            setRequest(req);
            const requestedSigners = Object.keys(req.signInputs ?? {});
            const decoded = await decodePsbt(
              req.psbtHex,
              requestedSigners.length > 0 ? requestedSigners : signerAddress ? [signerAddress] : [],
              Object.values(req.signInputs ?? {}).flat(),
              req.inscription
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
    }
  }, [requestId]);

  // Handle cancellation
  const handleCancel = useCallback(async () => {
    if (requestId) {
      await recordSignOutcome(requestId, 'cancelled');
      // Notify the background that PSBT signing was cancelled
      emitToBackground(`sign-psbt-cancel-${requestId}`, { reason: 'User cancelled' });

      // Clean up the request
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
