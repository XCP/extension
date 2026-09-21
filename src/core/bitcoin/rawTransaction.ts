import { hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { ValidationError } from '@/core/errors';

/**
 * Browser-facing transaction parsing must be bounded before allocating decoder structures. This
 * covers the largest serialized transaction permitted by Bitcoin's standard weight limit while
 * preventing a site or API from handing the extension an arbitrarily large parsing job.
 */
export const MAX_RAW_TRANSACTION_BYTES = 4_000_000;
export const MAX_TRANSACTION_INPUTS = 1_000;
export const MAX_TRANSACTION_OUTPUTS = 1_000;

const RAW_TRANSACTION_OPTIONS = {
  // These are the same raw-history allowances used by btc-signer's Esplora adapter. Historical
  // consensus transactions may contain scripts or versions a wallet would never construct.
  allowUnknownInputs: true,
  allowUnknownOutputs: true,
  disableScriptCheck: true,
  allowUnknownVersion: true,
} as const;

export function decodeRawTransaction(raw: string | Uint8Array): Uint8Array {
  if (raw instanceof Uint8Array) {
    if (raw.length === 0 || raw.length > MAX_RAW_TRANSACTION_BYTES) {
      throw new ValidationError(
        'INVALID_TRANSACTION',
        `Raw transaction must be between 1 and ${MAX_RAW_TRANSACTION_BYTES} bytes`,
      );
    }
    return raw;
  }

  if (typeof raw !== 'string') {
    throw new ValidationError('INVALID_TRANSACTION', 'Raw transaction must be hex bytes');
  }
  const normalized = raw.replace(/^0x/i, '');
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || normalized.length > MAX_RAW_TRANSACTION_BYTES * 2
    || !/^[0-9a-f]+$/i.test(normalized)
  ) {
    throw new ValidationError(
      'INVALID_TRANSACTION',
      `Raw transaction must be valid hex no larger than ${MAX_RAW_TRANSACTION_BYTES} bytes`,
    );
  }
  return hexToBytes(normalized);
}

/**
 * Parse consensus/history bytes without treating unusual output scripts as wallet-approved.
 *
 * `disableScriptCheck` is intentionally confined here. Raw transactions contain no PSBT
 * redeemScript, witnessScript, or Taproot commitment metadata for that option to authenticate;
 * the permissive setting only lets us inspect historical and Counterparty script shapes. Signing
 * decisions must still pass the separate input/output/fee policies.
 */
export function parseConsensusTransaction(raw: string | Uint8Array): Transaction {
  return Transaction.fromRaw(decodeRawTransaction(raw), RAW_TRANSACTION_OPTIONS);
}

/** Parse a browser/API supplied transaction and bound the work downstream screens perform. */
export function parseTransactionForSigning(raw: string | Uint8Array): Transaction {
  const transaction = parseConsensusTransaction(raw);
  if (transaction.inputsLength > MAX_TRANSACTION_INPUTS) {
    throw new ValidationError(
      'INVALID_TRANSACTION',
      `Transaction has too many inputs (${transaction.inputsLength}; maximum ${MAX_TRANSACTION_INPUTS})`,
    );
  }
  if (transaction.outputsLength > MAX_TRANSACTION_OUTPUTS) {
    throw new ValidationError(
      'INVALID_TRANSACTION',
      `Transaction has too many outputs (${transaction.outputsLength}; maximum ${MAX_TRANSACTION_OUTPUTS})`,
    );
  }
  return transaction;
}
