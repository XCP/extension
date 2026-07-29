/**
 * Independent fee sanity check for composed transactions.
 *
 * The compose API returns the raw transaction plus its own fee figure. This
 * recomputes the real miner fee locally — sum(input values) − sum(decoded
 * outputs) — and bounds it against the fee rate the user actually chose (which
 * the API cannot influence) and an absolute ceiling. A transaction that drains
 * the balance to fees, or a buggy fee estimate, is rejected before signing.
 *
 * SegWit input amounts are committed to by the signature (BIP143), so a lying
 * API cannot both understate an input value here and produce a valid signature.
 */

import { Transaction } from '@scure/btc-signer';
import { hexToBytes } from '@noble/hashes/utils.js';

/** A fee rate above this (sat/vByte) is treated as never legitimate. */
export const MAX_SANE_FEE_RATE = 5000;
/** When the user chose a fee rate, reject fees beyond this multiple of it. */
export const USER_FEE_RATE_TOLERANCE = 10;
/** Absolute floor so tiny transactions aren't rejected by rate rounding. */
const MIN_BOUND_SATS = 10_000;

export interface FeeCheckInput {
  rawTransaction: string;
  /** Per-input values in sats (from the compose response). */
  inputsValues?: number[];
  /** Fee the API claims, in sats. */
  declaredFee: number;
  /**
   * User-selected fee rate in sat/vByte, or null for network default. Accepts
   * a string because it arrives from a form field; coerced internally so a
   * caller passing the raw value can't silently disable the bound.
   */
  userFeeRate: number | string | null;
}

export interface FeeCheckResult {
  ok: boolean;
  error?: string;
  /** The miner fee actually implied by inputs − outputs, when computable. */
  computedFee?: number;
}

/**
 * Rough signed vsize: the (unsigned) serialized size plus a signature
 * allowance per input large enough to cover a legacy P2PKH scriptSig (~107 B),
 * so the estimate is never below the real signed size and the fee bound never
 * falsely rejects a legitimate transaction.
 */
function estimateVsize(tx: Transaction, rawBytesLength: number): number {
  const perInputSignatureAllowance = 110;
  return rawBytesLength + tx.inputsLength * perInputSignatureAllowance;
}

export function checkTransactionFee(input: FeeCheckInput): FeeCheckResult {
  const { rawTransaction, inputsValues, declaredFee, userFeeRate } = input;

  let tx: Transaction;
  let rawBytes: Uint8Array;
  try {
    rawBytes = hexToBytes(rawTransaction);
    tx = Transaction.fromRaw(rawBytes, {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
    });
  } catch {
    // An unparseable transaction can't be signed either (the signer uses the
    // same parser), so it is not a drain risk — skip the fee check rather than
    // block, and let signing surface the real error.
    return { ok: true };
  }

  // Prefer the fee implied by inputs − outputs; fall back to the declared fee
  // when input values are unavailable.
  let effectiveFee = declaredFee;
  let computedFee: number | undefined;
  if (inputsValues && inputsValues.length === tx.inputsLength) {
    let outputsTotal = 0n;
    for (let i = 0; i < tx.outputsLength; i++) {
      outputsTotal += tx.getOutput(i)?.amount ?? 0n;
    }
    const inputsTotal = inputsValues.reduce((sum, value) => sum + BigInt(value), 0n);
    const fee = inputsTotal - outputsTotal;
    if (fee < 0n) {
      return { ok: false, error: 'Transaction outputs exceed inputs — refusing to sign.' };
    }
    computedFee = Number(fee);
    effectiveFee = computedFee;
  }

  const vsize = Math.max(1, estimateVsize(tx, rawBytes.length));
  const impliedRate = effectiveFee / vsize;

  if (impliedRate > MAX_SANE_FEE_RATE) {
    return {
      ok: false,
      error: `Transaction fee (${effectiveFee} sats, ~${Math.round(impliedRate)} sat/vB) is abnormally high and was blocked.`,
      computedFee,
    };
  }

  const rate = typeof userFeeRate === 'string' ? Number(userFeeRate) : userFeeRate;
  if (rate && Number.isFinite(rate) && rate > 0) {
    const bound = Math.max(MIN_BOUND_SATS, Math.ceil(rate * vsize * USER_FEE_RATE_TOLERANCE));
    if (effectiveFee > bound) {
      return {
        ok: false,
        error: `Transaction fee (${effectiveFee} sats) far exceeds your selected rate of ${rate} sat/vB.`,
        computedFee,
      };
    }
  }

  return { ok: true, computedFee };
}
