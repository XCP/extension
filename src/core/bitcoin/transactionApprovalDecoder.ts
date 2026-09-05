/** Local raw transaction review shared by provider execution and its approval screen. */

import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { noTrustedPrevout, type TrustedPrevoutResolver } from '@/core/bitcoin/trustedPrevout';
import { fetchInputsAttachedAssets } from '@/core/counterparty/inputAssets';
import {
  analyzeSignRequest,
  type SignRequestAnalysis,
} from '@/core/counterparty/signRequestAnalysis';
import { fetchInputPrevouts } from '@/core/counterparty/transaction';
import { extractCounterpartyPayload } from '@/core/counterparty/unpack/opReturn';

/**
 * Decoded transaction details: what the bytes say, plus the safety analysis every signing request
 * gets (`signRequestAnalysis.ts`, shared with the PSBT screen).
 */
export interface DecodedTransactionInfo extends SignRequestAnalysis {
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
}

export async function decodeTransactionForApproval(
  rawTxHex: string,
  signerAddress?: string,
  resolveTrustedPrevout: TrustedPrevoutResolver = noTrustedPrevout,
): Promise<DecodedTransactionInfo> {
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
    inputs.map((input, index) => ({ index, txid: input.txid, vout: input.vout })),
    undefined,
    resolveTrustedPrevout
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
      const prevouts = await fetchInputPrevouts(inputs, resolveTrustedPrevout);
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

  // Resolve any Counterparty payload the outputs carry — plaintext or ARC4 OP_RETURN, or
  // bare-multisig data outputs, which produce no OP_RETURN at all. Classifying every encoding
  // here is what lets the sweep block apply regardless of how the message is carried.
  //
  // Read from the raw bytes, not from the API's rendering of them. Extracting from an API-
  // supplied script list keyed by an API-supplied txid would leave both sides of the comparison
  // rooted in the same source, so agreement would prove nothing about the bytes.
  const counterpartyDataHex = extractCounterpartyPayload(rawTxHex) ?? undefined;

  // Every input is being signed here, so all of them count as sources for attached assets — a
  // raw transaction can spend an attached UTXO just as a PSBT can, and does so with no message.
  const analysis = await analyzeSignRequest({
    counterpartyDataHex,
    inputs,
    outputs,
    signerAddresses: signerAddress ? [signerAddress] : [],
    signedInputIndices: inputs.map((_, index) => index),
    signedInputs: inputs.map((_, index) => ({ index, sighashType: 0x01 })),
    transactionId: parsed.txid,
    attachedAssets: attachedAssetsPromise,
  });

  return {
    txid: parsed.txid,
    inputs,
    outputs,
    totalInputValue,
    totalOutputValue,
    fee,
    vsize: parsed.vsize,
    hasOpReturn,
    ...analysis,
  };
}
