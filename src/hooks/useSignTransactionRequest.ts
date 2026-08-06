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

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import {
  type AttachedAssetDestination,
  movesCounterpartyValue,
  resolveAttachedAssetDestination,
} from '@/core/counterparty/attachedAssetMovement';
import {
  fetchInputsAttachedAssets,
  type InputAttachedAssets,
} from '@/core/counterparty/inputAssets';
import {
  checkMessageStructure,
  type StructureFinding,
} from '@/core/counterparty/messageStructure';
import { type ProtocolContext, resolveProtocolContext } from '@/core/counterparty/protocolContext';
import {
  type CounterpartyMessage,
  decodeCounterpartyMessage,
  describeMpmaSend,
  fetchInputPrevouts,
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
import { extractCounterpartyPayload } from '@/core/counterparty/unpack/opReturn';
import { recordSignOutcome } from '@/platform/provider/signFlow';
import { type SignTransactionRequest, signTransactionRequestStorage } from '@/platform/storage/signTransactionRequestStorage';

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
    /** Raw scriptPubKey hex — lets the safety analyzer classify addressless scripts. */
    script?: string;
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
  /** Inputs whose UTXOs carry Counterparty assets, or whose lookup failed. */
  attachedAssets: InputAttachedAssets[];
  /**
   * Message fields that reference this transaction and do not resolve against it — an attach
   * naming an output that does not exist, a move naming a UTXO the transaction does not spend.
   */
  structureFindings: StructureFinding[];
  /**
   * Ledger facts the message does not carry, so the detail list can say what the transaction means
   * rather than only what it contains — the order behind a cancel, the supply a destroy is measured
   * against, the total a dividend costs.
   */
  protocolContext: ProtocolContext;
  /** Where the assets attached to the signed inputs end up. Null when nothing attached moves. */
  attachedAssetDestination: AttachedAssetDestination | null;
  /**
   * Recipients of an mpma_send, read from the local unpack. Empty for every other message type.
   * These are carried in the payload rather than as outputs, so the approval screen has no other
   * source for them.
   */
  mpmaRecipients: MpmaRecipient[];
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

  // Describe the transaction from its own bytes, then enrich with facts only a node can supply.
  const decodeTransaction = useCallback(async (rawTxHex: string, signerAddress?: string): Promise<DecodedTransactionInfo> => {
    // The screen must describe the bytes being signed, not a remote party's account of them
    // (ADR-019). A parse failure is reported as such rather than deferring to the API's version.
    const parsed = parseRawTransactionLocally(rawTxHex);
    if (!parsed) {
      throw new Error('This transaction could not be decoded, so it was not shown for signing.');
    }

    const inputs: DecodedTransactionInfo['inputs'] = parsed.inputs.map((input) => ({
      txid: input.txid,
      vout: input.vout,
    }));

    // Kick off per-input attached-asset lookups now so they overlap with the
    // decodes below rather than adding a serial round-trip. Inputs have no index
    // field here, so the array position is the index.
    const attachedAssetsPromise = fetchInputsAttachedAssets(
      inputs.map((input, index) => ({ index, txid: input.txid, vout: input.vout }))
    );

    const outputs: DecodedTransactionInfo['outputs'] = parsed.outputs.map((output) => ({
      index: output.index,
      value: output.value,
      ...(output.address ? { address: output.address } : {}),
      type: output.type,
      ...(output.opReturnData ? { opReturnData: output.opReturnData } : {}),
      // Carried through so bare-multisig data outputs can be recognized rather
      // than flagged as unknown destinations.
      ...(output.script ? { script: output.script } : {}),
    }));

    // An input's value is not in the transaction that spends it, so it has to be resolved from the
    // chain. Every input is looked up: previously one API-supplied value suppressed the lookup for
    // all of them, and unresolved inputs silently counted as zero, understating the fee.
    if (inputs.length > 0) {
      try {
        const prevouts = await fetchInputPrevouts(inputs);
        for (const input of inputs) {
          const prevout = prevouts.get(`${input.txid}:${input.vout}`);
          if (prevout == null) continue;
          input.value = prevout.value;
          // Without the owning address the movement summary cannot tell whose
          // input this is, and reports every total as undetermined.
          if (prevout.address) input.address = prevout.address;
        }
      } catch (err) {
        console.warn('Failed to fetch input values:', err);
      }
    }

    const totalInputValue = inputs.reduce((sum, input) => sum + (input.value || 0), 0);
    const totalOutputValue = outputs.reduce((sum, output) => sum + output.value, 0);
    // Any unresolved input makes the fee unknowable rather than small: reporting a partial
    // subtraction would understate it, and the fee-rate warning is computed from this number.
    const allInputValuesResolved = inputs.every((input) => input.value != null);
    const fee = allInputValuesResolved ? totalInputValue - totalOutputValue : 0;

    const hasOpReturn = parsed.hasOpReturn;

    let counterpartyMessage: CounterpartyMessage | undefined;
    let counterpartyDataHex: string | undefined;

    // Resolve any Counterparty payload the outputs carry — plaintext or ARC4 OP_RETURN, or
    // bare-multisig data outputs, which produce no OP_RETURN at all. Classifying every encoding
    // here is what lets the sweep block apply regardless of how the message is carried.
    //
    // Read from the raw bytes, not from the API's rendering of them. Extracting from an API-
    // supplied script list keyed by an API-supplied txid would leave both sides of the comparison
    // below rooted in the same source, so agreement would prove nothing about the bytes.
    counterpartyDataHex = extractCounterpartyPayload(rawTxHex) ?? undefined;

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

    // Verify locally (compares local binary unpack against API result)
    const verification = verifyProviderTransaction(counterpartyDataHex, counterpartyMessage);

    // Analyze for security risks (dangerous types, suspicious outputs)
    const messageType = counterpartyMessage?.messageType
      ?? verification.localUnpack?.messageType;
    const safety = analyzeTransactionSafety(messageType, outputs, signerAddress || '');

    // mpma_send is described from the bytes, not from the API's rendering of them — see
    // resolveMpmaRecipients for why the API cannot be used for this type.
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

    // Independent of both decoders: does the message's own account of this transaction hold up
    // against the transaction? Uses the local decode, since the point is to test the bytes.
    const structureFindings = checkMessageStructure(
      verification.localUnpack?.messageType,
      verification.localUnpack?.data,
      { inputs, outputs }
    );

    const { context: protocolContext, warnings: policyWarnings } = await resolveProtocolContext({
      messageType: verification.localUnpack?.messageType,
      data: verification.localUnpack?.data,
      transactionId: parsed.txid,
      apiMessageData: counterpartyMessage?.messageData,
      outputs,
      signerAddresses: signerAddress ? [signerAddress] : [],
      spentUtxos: inputs.map((input) => `${input.txid}:${input.vout}`),
    });

    // Policy blocks come from the same lookups as the detail list — an oracle-priced dispenser is
    // only visible once the dispensers behind the paid address have been read.
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
    if (!movesCounterpartyValue(Boolean(counterpartyDataHex), attachedAssets, inputs.map((_, index) => index))) {
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

    // A raw transaction can spend an attached UTXO just as a PSBT can, and does so with no
    // message. Every input is being signed here, so all of them count as sources.
    const attachedAssetDestination = resolveAttachedAssetDestination(
      outputs,
      attachedAssets,
      inputs.map((_, index) => index),
      signerAddress ? [signerAddress] : []
    );

    return {
      txid: parsed.txid,
      inputs,
      outputs,
      totalInputValue,
      totalOutputValue,
      fee,
      vsize: parsed.vsize,
      hasOpReturn,
      counterpartyMessage,
      verification,
      safety,
      attachedAssets,
      structureFindings,
      protocolContext,
      attachedAssetDestination,
      mpmaRecipients,
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
      // Persist the outcome so the dApp can recover it after a worker restart.
      await recordSignOutcome(requestId, 'completed', { signedTxHex });
      // Notify the background that transaction signing is complete
      emitToBackground(`sign-tx-complete-${requestId}`, { signedTxHex });

      // Clean up the request
      await signTransactionRequestStorage.remove(requestId);
    }
  }, [requestId]);

  // Handle cancellation
  const handleCancel = useCallback(async () => {
    if (requestId) {
      await recordSignOutcome(requestId, 'cancelled');
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
