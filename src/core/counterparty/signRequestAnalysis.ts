/**
 * The checks a transaction gets before this wallet will sign it for a website.
 *
 * A PSBT and a raw transaction reach this code by different routes — one is parsed from a PSBT,
 * the other from raw bytes, and they resolve their Counterparty payload differently — but once the
 * payload is in hand, everything that decides whether signing is safe is the same. It used to be
 * written out twice, once per approval hook, with each copy carrying comments explaining that it
 * matched the other. It only takes one fix landing in one copy for the two screens to disagree
 * about whether the same transaction is safe, so they share this instead.
 *
 * Everything here reads the transaction's own bytes. Nothing decides safety from a remote party's
 * account of them (ADR-019).
 */

import {
  type AttachedAssetDestination,
  movesCounterpartyValue,
  resolveAttachedAssetDestination,
} from '@/core/counterparty/attachedAssetMovement';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import { checkMessageStructure, type StructureFinding } from '@/core/counterparty/messageStructure';
import { type ProtocolContext, resolveProtocolContext } from '@/core/counterparty/protocolContext';
import {
  type CounterpartyMessage,
  decodeCounterpartyMessage,
  describeMpmaSend,
  type MpmaRecipient,
  resolveMpmaRecipients,
} from '@/core/counterparty/transaction';
import {
  analyzeTransactionSafety,
  type SafetyAnalysis,
} from '@/core/counterparty/transactionSafety';
import { type ProviderVerificationResult, verifyProviderTransaction } from '@/core/counterparty/unpack';
import type { MPMAData } from '@/core/counterparty/unpack/messages/mpma';

/** An input being signed, identified by the outpoint it spends. */
export interface AnalyzedInput {
  txid: string;
  vout: number;
}

/**
 * An output, in the shape every check below needs. Both approval paths already produce this — the
 * PSBT parser and the raw-transaction parser agree on these fields.
 */
export interface AnalyzedOutput {
  index: number;
  value: number;
  type: string;
  address?: string;
  script?: string;
}

export interface SignRequestAnalysisInput {
  /** The Counterparty payload the outputs carry, read from the bytes, or undefined if none. */
  counterpartyDataHex: string | undefined;
  inputs: AnalyzedInput[];
  /** Mutated by neither this function nor its callees; enrichment happens before the call. */
  outputs: AnalyzedOutput[];
  /** Addresses this wallet would sign with. Empty when the caller has none to name. */
  signerAddresses: string[];
  /**
   * Indices of the inputs this wallet is being asked to sign. Assets on inputs it does not sign
   * belong to someone else's side of the transaction.
   */
  signedInputIndices: number[];
  /** Transaction id, where the caller could establish one. Only the detail lookups use it. */
  transactionId: string | undefined;
  /**
   * The per-input attached-asset lookup, started by the caller before its own decoding so the two
   * overlap. Passed as a promise rather than a value to keep that overlap.
   */
  attachedAssets: Promise<InputAttachedAssets[]>;
}

export interface SignRequestAnalysis {
  /** The API's rendering of the message, when it could supply one. Never used to decide safety. */
  counterpartyMessage: CounterpartyMessage | undefined;
  verification: ProviderVerificationResult;
  safety: SafetyAnalysis;
  attachedAssets: InputAttachedAssets[];
  mpmaRecipients: MpmaRecipient[];
  structureFindings: StructureFinding[];
  protocolContext: ProtocolContext;
  attachedAssetDestination: AttachedAssetDestination | null;
}

/**
 * Run every safety check that applies to a transaction a website has asked this wallet to sign.
 *
 * @param input - the transaction, already parsed, with its Counterparty payload resolved
 * @returns the analysis both approval screens render, including any blocking warnings
 */
export async function analyzeSignRequest(
  input: SignRequestAnalysisInput
): Promise<SignRequestAnalysis> {
  const {
    counterpartyDataHex,
    inputs,
    outputs,
    signerAddresses,
    signedInputIndices,
    transactionId,
  } = input;

  // The API's rendering is for display only — richer than the local unpack, and not trusted by
  // anything below that decides whether signing is safe.
  let counterpartyMessage: CounterpartyMessage | undefined;
  if (counterpartyDataHex) {
    try {
      const message = await decodeCounterpartyMessage(counterpartyDataHex);
      if (message) counterpartyMessage = message;
    } catch (err) {
      console.warn('Failed to decode Counterparty message:', err);
    }
  }

  // Compares the local binary unpack against the API's result; the local one wins.
  const verification = verifyProviderTransaction(counterpartyDataHex, counterpartyMessage);

  const messageType = counterpartyMessage?.messageType ?? verification.localUnpack?.messageType;
  const safety = analyzeTransactionSafety(messageType, outputs, signerAddresses);

  // mpma_send is described from the bytes, not from the API's rendering of them — see
  // resolveMpmaRecipients for why the API cannot be used for this type. Without it the screen says
  // "Send to 3 recipients" and names none of them.
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
    transactionId,
    apiMessageData: counterpartyMessage?.messageData,
    outputs,
    signerAddresses,
    spentUtxos: inputs.map((i) => `${i.txid}:${i.vout}`),
  });

  // Policy blocks come from the same lookups as the detail list — an oracle-priced dispenser is
  // only visible once the dispensers behind the paid address have been read.
  if (policyWarnings.length > 0) {
    safety.warnings = [...policyWarnings, ...safety.warnings];
    safety.blocked = safety.blocked || policyWarnings.some((w) => w.severity === 'block');
  }

  const attachedAssets = await input.attachedAssets;

  // The gate: a transaction this wallet signs on a site's behalf either carries a Counterparty
  // message or spends an input carrying attached assets. Anything else is a plain Bitcoin
  // transaction, which a site has no Counterparty reason to ask this wallet for and which the user
  // can make in the wallet directly. Both halves are required — a message alone would miss an
  // attached UTXO being spent alongside it, and attached assets alone miss every ordinary send.
  if (!movesCounterpartyValue(Boolean(counterpartyDataHex), attachedAssets, signedInputIndices)) {
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
    outputs,
    attachedAssets,
    signedInputIndices,
    signerAddresses
  );

  return {
    counterpartyMessage,
    verification,
    safety,
    attachedAssets,
    mpmaRecipients,
    structureFindings,
    protocolContext,
    attachedAssetDestination,
  };
}
