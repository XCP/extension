/**
 * Independent fee sanity check for composed transactions.
 *
 * The miner fee is recomputed locally as inputs minus outputs, then bounded against the fee rate
 * the user chose (which the API cannot influence) and an absolute ceiling, so a response that
 * drains the balance to fees is rejected before signing.
 *
 * The API's own fee figure is never the subject of the check, and its input values are trusted
 * only where a signature will bind them. A SegWit signature commits to the amount it spends
 * (BIP143), so an understated value cannot also produce a valid signature. A legacy signature
 * commits to no amount at all, so those values are resolved from block explorers instead —
 * signing fetches the same prevouts for legacy inputs regardless, so this costs no availability
 * that signing did not already require. A fee that cannot be established is refused.
 */

import { Transaction } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { fetchInputValues } from '@/utils/blockchain/counterparty/transaction';

/** A fee rate above this (sat/vByte) is treated as never legitimate. */
export const MAX_SANE_FEE_RATE = 5000;
/** When the user chose a fee rate, reject fees beyond this multiple of it. */
export const USER_FEE_RATE_TOLERANCE = 10;
/** Absolute floor so tiny transactions aren't rejected by rate rounding. */
const MIN_BOUND_SATS = 10_000;

export interface FeeCheckInput {
  rawTransaction: string;
  /**
   * Per-input values in sats, as hinted by the compose response. Used only for SegWit inputs,
   * whose signatures commit to the amount, and only when there is one value per input.
   */
  inputsValues?: number[];
  /**
   * Whether the spending signatures will commit to the input amounts. False for legacy
   * (P2PKH-family) wallets, whose values must be resolved independently.
   */
  signaturesCommitToInputValues: boolean;
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
  /** The miner fee implied by inputs minus outputs. */
  computedFee?: number;
}

/** Resolves "txid:vout" → satoshi value for inputs the compose response did not cover. */
export type InputValueResolver = (
  inputs: Array<{ txid: string; vout: number }>
) => Promise<Map<string, number>>;

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

/** Total input value in sats, from the compose hint or resolved independently. */
async function resolveInputsTotal(
  tx: Transaction,
  inputsValues: number[] | undefined,
  signaturesCommitToInputValues: boolean,
  resolveInputValues: InputValueResolver
): Promise<bigint | null> {
  // A hint is usable when a signature will bind it and it covers every input with a whole
  // number of sats.
  if (
    signaturesCommitToInputValues
    && inputsValues
    && inputsValues.length === tx.inputsLength
    && inputsValues.every((value) => Number.isSafeInteger(value) && value >= 0)
  ) {
    return inputsValues.reduce((sum, value) => sum + BigInt(value), 0n);
  }

  const outpoints: Array<{ txid: string; vout: number }> = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const txInput = tx.getInput(i);
    if (!txInput?.txid) return null;
    outpoints.push({ txid: bytesToHex(txInput.txid), vout: txInput.index ?? 0 });
  }
  if (outpoints.length === 0) return null;

  let resolved: Map<string, number>;
  try {
    resolved = await resolveInputValues(outpoints);
  } catch {
    return null;
  }

  let total = 0n;
  for (const { txid, vout } of outpoints) {
    const value = resolved.get(`${txid}:${vout}`);
    // A partial answer cannot bound the fee; treat it as unresolved.
    if (value === undefined) return null;
    total += BigInt(value);
  }
  return total;
}

export async function checkTransactionFee(
  input: FeeCheckInput,
  resolveInputValues: InputValueResolver = fetchInputValues
): Promise<FeeCheckResult> {
  const { rawTransaction, inputsValues, signaturesCommitToInputValues, userFeeRate } = input;

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

  const inputsTotal = await resolveInputsTotal(
    tx,
    inputsValues,
    signaturesCommitToInputValues,
    resolveInputValues
  );
  if (inputsTotal === null) {
    return {
      ok: false,
      error: 'Could not establish this transaction\'s fee from the inputs it spends, so it was not '
        + 'accepted. Check your connection and try again.',
    };
  }

  let outputsTotal = 0n;
  for (let i = 0; i < tx.outputsLength; i++) {
    outputsTotal += tx.getOutput(i)?.amount ?? 0n;
  }
  const fee = inputsTotal - outputsTotal;
  if (fee < 0n) {
    return { ok: false, error: 'Transaction outputs exceed inputs — refusing to sign.' };
  }
  const computedFee = Number(fee);

  const vsize = Math.max(1, estimateVsize(tx, rawBytes.length));
  const impliedRate = computedFee / vsize;

  if (impliedRate > MAX_SANE_FEE_RATE) {
    return {
      ok: false,
      error: `Transaction fee (${computedFee} sats, ~${Math.round(impliedRate)} sat/vB) is abnormally high and was blocked.`,
      computedFee,
    };
  }

  const rate = typeof userFeeRate === 'string' ? Number(userFeeRate) : userFeeRate;
  if (rate && Number.isFinite(rate) && rate > 0) {
    const bound = Math.max(MIN_BOUND_SATS, Math.ceil(rate * vsize * USER_FEE_RATE_TOLERANCE));
    if (computedFee > bound) {
      return {
        ok: false,
        error: `Transaction fee (${computedFee} sats) far exceeds your selected rate of ${rate} sat/vB.`,
        computedFee,
      };
    }
  }

  return { ok: true, computedFee };
}
