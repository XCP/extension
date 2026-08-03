/**
 * Local structural parse of a raw transaction.
 *
 * A dapp hands over finished bytes to sign, and the approval screen has to describe them. Asking
 * the Counterparty API to decode those bytes and rendering its answer means the screen describes
 * what an untrusted party *says* the transaction is, while the signature commits to the bytes —
 * so a hostile or compromised API can show one transaction while another gets signed. ADR-019
 * requires the display to derive from the transaction itself, and this is what makes that possible
 * on the provider paths.
 *
 * The API decode is still worth having, but only as the *second* opinion in a comparison
 * (`providerVerify.ts`) and for facts a node must supply, such as which UTXOs carry assets. It
 * must not be the source of what the user reads.
 *
 * Deliberately structural: this reports what the bytes say and nothing about intent. Values that
 * are genuinely not in the transaction — what each input was worth — are left undefined for the
 * caller to resolve from the chain, rather than filled in from whatever the response claimed.
 */

import { Transaction } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { decodeAddressFromScript } from './address';

export interface LocalParsedInput {
  txid: string;
  vout: number;
  /** Never populated here: an input's value is not in the spending transaction. */
  value?: number;
  address?: string;
}

export interface LocalParsedOutput {
  index: number;
  value: number;
  address?: string;
  /** `op_return` for data outputs, otherwise the address kind or `unknown`. */
  type: string;
  opReturnData?: string;
}

export interface LocalParsedTransaction {
  txid: string;
  inputs: LocalParsedInput[];
  outputs: LocalParsedOutput[];
  vsize: number;
  hasOpReturn: boolean;
}

/**
 * Transaction id: double SHA-256 of the serialized transaction *without* witness data, reversed.
 * Computed here rather than taken from a response so the id shown next to the details belongs to
 * the same bytes those details came from.
 */
function computeTxid(tx: Transaction): string {
  const stripped = tx.toBytes(true, false);
  const hash = sha256(sha256(stripped));
  return bytesToHex(Uint8Array.from(hash).reverse());
}

/**
 * Virtual size from the weight units the parse already implies. Used for the fee-rate warning, so
 * an approximation is acceptable — but it must come from the bytes, not from the API's `vsize`.
 */
function computeVsize(tx: Transaction, rawByteLength: number): number {
  let strippedLength: number;
  try {
    strippedLength = tx.toBytes(true, false).length;
  } catch {
    strippedLength = rawByteLength;
  }
  const weight = strippedLength * 3 + rawByteLength;
  return Math.max(1, Math.ceil(weight / 4));
}

/**
 * Parse a raw transaction into the structure an approval screen renders.
 *
 * Returns null when the bytes cannot be parsed, which the caller should treat as "cannot describe
 * this transaction" rather than falling back to a remote description of it.
 */
export function parseRawTransactionLocally(rawTxHex: string): LocalParsedTransaction | null {
  let rawBytes: Uint8Array;
  let tx: Transaction;
  try {
    rawBytes = hexToBytes(rawTxHex.replace(/^0x/, ''));
    tx = Transaction.fromRaw(rawBytes, {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
    });
  } catch {
    return null;
  }

  const inputs: LocalParsedInput[] = [];
  for (let index = 0; index < tx.inputsLength; index += 1) {
    const input = tx.getInput(index);
    if (!input?.txid) return null;
    inputs.push({
      txid: bytesToHex(input.txid),
      vout: input.index ?? 0,
    });
  }

  const outputs: LocalParsedOutput[] = [];
  let hasOpReturn = false;
  for (let index = 0; index < tx.outputsLength; index += 1) {
    const output = tx.getOutput(index);
    const script = output?.script;
    const value = Number(output?.amount ?? 0n);
    if (!script) {
      outputs.push({ index, value, type: 'unknown' });
      continue;
    }
    const scriptHex = bytesToHex(script);
    if (script[0] === 0x6a) {
      hasOpReturn = true;
      outputs.push({ index, value, type: 'op_return', opReturnData: scriptHex });
      continue;
    }
    const address = decodeAddressFromScript(scriptHex);
    outputs.push({
      index,
      value,
      // An address we cannot attribute is reported as such, never guessed — the money-movement
      // summary renders it as unknown and flags the total as incomplete.
      ...(address ? { address } : {}),
      type: address ? 'address' : 'unknown',
    });
  }

  return {
    txid: computeTxid(tx),
    inputs,
    outputs,
    vsize: computeVsize(tx, rawBytes.length),
    hasOpReturn,
  };
}
