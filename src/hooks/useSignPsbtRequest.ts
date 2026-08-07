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
import {
  type AttachedAssetDestination,
  movesCounterpartyValue,
  resolveAttachedAssetDestination,
} from '@/core/counterparty/attachedAssetMovement';
import {
  fetchInputsAttachedAssets,
  type InputAttachedAssets,
} from '@/core/counterparty/inputAssets';
import { checkMessageStructure, type StructureFinding } from '@/core/counterparty/messageStructure';
import { type ProtocolContext, resolveProtocolContext } from '@/core/counterparty/protocolContext';
import {
  type CounterpartyMessage, 
  decodeCounterpartyMessage,
  decodeRawTransaction, 
  describeMpmaSend,
  type MpmaRecipient,
  resolveMpmaRecipients
} from '@/core/counterparty/transaction';
import {
  analyzeTransactionSafety,
  type SafetyAnalysis,
} from '@/core/counterparty/transactionSafety';
import {
  type ProviderVerificationResult, 
  verifyProviderTransaction
} from '@/core/counterparty/unpack';
import type { MPMAData } from '@/core/counterparty/unpack/messages/mpma';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';
import { recordSignOutcome } from '@/platform/provider/signFlow';
import { getSignFlow, type SignPsbtRequest } from '@/platform/provider/signFlow';

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
  /**
   * Recipients of an mpma_send, read from the local unpack. Empty for every other message type.
   *
   * A PSBT can carry any Counterparty payload a raw transaction can, and MPMA recipients travel
   * inside the payload rather than as outputs — so without this the PSBT screen said "Send to 3
   * recipients" and named none of them, while the transaction screen listed all three.
   */
  mpmaRecipients: MpmaRecipient[];
  /**
   * Where the assets attached to the signed inputs end up. Null when nothing attached is moving.
   *
   * Spending an attached UTXO moves its balances with no Counterparty message, so this is the only
   * account of an atomic swap the screen can give.
   */
  attachedAssetDestination: AttachedAssetDestination | null;
  /** Message fields that reference this transaction and do not resolve against it. */
  structureFindings: StructureFinding[];
  /** Ledger facts the message does not carry, for the protocol detail list. */
  protocolContext: ProtocolContext;
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

    // Verify locally (compares local binary unpack against API result)
    const verification = verifyProviderTransaction(counterpartyDataHex, counterpartyMessage);

    // Analyze for security risks (dangerous types, suspicious outputs)
    const messageType = counterpartyMessage?.messageType
      ?? verification.localUnpack?.messageType;
    const safety = analyzeTransactionSafety(messageType, psbtDetails.outputs, signerAddresses ?? []);

    // Same checks the raw-transaction path runs. A PSBT carries the same payloads, so anything
    // that path establishes about a message holds here too.
    let mpmaRecipients: MpmaRecipient[] = [];
    if (verification.localUnpack?.messageType === 'mpma_send' && verification.localUnpack.data) {
      const sends = (verification.localUnpack.data as MPMAData).sends ?? [];
      if (sends.length > 0) {
        mpmaRecipients = await resolveMpmaRecipients(sends);
        if (counterpartyMessage) {
          counterpartyMessage = {
            ...counterpartyMessage,
            description: describeMpmaSend(mpmaRecipients),
          };
        }
      }
    }

    const structureFindings = checkMessageStructure(
      verification.localUnpack?.messageType,
      verification.localUnpack?.data,
      { inputs: psbtDetails.inputs, outputs: psbtDetails.outputs }
    );

    // Same ledger lookups the raw-transaction path runs: a PSBT carries the same messages, so a
    // cancel, dividend or dispense in one deserves the same account of itself as in the other.
    const { context: protocolContext, warnings: policyWarnings } = await resolveProtocolContext({
      messageType: verification.localUnpack?.messageType,
      data: verification.localUnpack?.data,
      transactionId: txid,
      apiMessageData: counterpartyMessage?.messageData,
      outputs: psbtDetails.outputs,
      signerAddresses: signerAddresses ?? [],
      spentUtxos: psbtDetails.inputs.map((input) => `${input.txid}:${input.vout}`),
    });

    if (policyWarnings.length > 0) {
      safety.warnings = [...policyWarnings, ...safety.warnings];
      safety.blocked = safety.blocked || policyWarnings.some((w) => w.severity === 'block');
    }

    const attachedAssets = await attachedAssetsPromise;

    // The gate: a transaction this wallet signs on a site's behalf either carries a Counterparty
    // message or spends an input carrying attached assets. Anything else is a plain Bitcoin
    // transaction, which a site has no Counterparty reason to ask this wallet for and which the
    // user can make in the wallet directly. Both halves are required — a message alone would miss
    // an attached UTXO being spent alongside it, and attached assets alone miss every ordinary send.
    if (!movesCounterpartyValue(Boolean(counterpartyDataHex), attachedAssets, signedInputIndices ?? [])) {
      safety.warnings = [
        {
          severity: 'block',
          title: 'Blocked: Not a Counterparty Transaction',
          message:
            'This carries no Counterparty message and spends nothing holding Counterparty assets, ' +
            'so signing it would move only bitcoin at a site’s direction. Make plain Bitcoin ' +
            'payments in the wallet, where you choose the destination.',
        },
        ...safety.warnings,
      ];
      safety.blocked = true;
    }

    const attachedAssetDestination = resolveAttachedAssetDestination(
      psbtDetails.outputs,
      attachedAssets,
      signedInputIndices ?? [],
      signerAddresses ?? []
    );

    return {
      psbtDetails,
      counterpartyMessage,
      txid,
      verification,
      safety,
      attachedAssets,
      mpmaRecipients,
      structureFindings,
      attachedAssetDestination,
      protocolContext,
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
          const req = (await getSignFlow(message.signPsbtRequestId)) as SignPsbtRequest | null;
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
